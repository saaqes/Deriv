import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSmartchartsChampionAdapter } from '@/adapters/smartcharts-champion';
import { createServices } from '@/adapters/smartcharts-champion/services';
import { createTransport } from '@/adapters/smartcharts-champion/transport';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { chartDebugLog } from '@/external/bot-skeleton/utils/mobile-trade-debug';
import type { SmartchartsChampionAdapter } from '@/types/smartchart.types';
import type {
    ActiveSymbols,
    TGetQuotes,
    TGranularity,
    TradingTimesMap,
    TSubscribeQuotes,
    TUnsubscribeQuotes,
} from '@deriv-com/smartcharts-champion';

// Logger utility
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Hook]'),
    error: console.error.bind(console, '[SmartCharts Hook]'),
};

// Type guard for valid granularity values
function isValidGranularity(value: unknown): value is TGranularity {
    const validGranularities = [0, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400];
    return typeof value === 'number' && validGranularities.includes(value);
}

interface UseSmartChartAdaptorReturn {
    adapter: SmartchartsChampionAdapter | null;
    adapterInitialized: boolean;
    chartData: {
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    };
    getQuotes: TGetQuotes;
    subscribeQuotes: TSubscribeQuotes;
    unsubscribeQuotes: TUnsubscribeQuotes;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Custom hook for SmartChart Adaptor
 * Handles adapter initialization, data fetching, and subscription management
 * with proper memoization and memory leak prevention
 */
export const useSmartChartAdaptor = (): UseSmartChartAdaptorReturn => {
    // State management
    const [adapter, setAdapter] = useState<SmartchartsChampionAdapter | null>(null);
    const [adapterInitialized, setAdapterInitialized] = useState(false);
    const [chartData, setChartData] = useState<{
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    }>({
        activeSymbols: [] as ActiveSymbols,
        tradingTimes: {} as TradingTimesMap,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Refs to track mounted state and prevent memory leaks
    const isMountedRef = useRef(true);
    const cleanupFunctionsRef = useRef<Array<() => void>>([]);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to store timeout for cleanup

    // Track mounted state
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, []);

    // Initialize adapter - waits for chart_api.api to become available.
    //
    // chart_api.api is set asynchronously (see chart-api.js `init()`), which
    // runs as part of api_base's connection bootstrap and can resolve *after*
    // this hook has already mounted — e.g. on a cold load that deep-links
    // straight into the Chart tab (`#chart`). Checking `chart_api.api` only
    // once, with an effect that solely depends on `[adapterInitialized]`,
    // meant that a "not ready yet" result was permanent: the effect would
    // never re-run once `chart_api.api` actually became available, so the
    // chart got stuck on the loading spinner forever. Poll for readiness
    // instead, mirroring the retry pattern already used below for
    // `loadChartData`.
    useEffect(() => {
        if (adapterInitialized) return;

        let cancelled = false;
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;
        const maxAttempts = 150; // ~30s at 200ms intervals
        const pollDelayMs = 200;

        const initAdapter = () => {
            if (cancelled) return;

            if (!chart_api.api) {
                if (attempt === 0) chartDebugLog('API waiting for chart_api.api to be ready');
                if (attempt >= maxAttempts) {
                    chartDebugLog('timed out waiting for chart_api.api');
                    if (isMountedRef.current) {
                        setError(new Error('Timed out waiting for chart connection to be ready'));
                        setIsLoading(false);
                    }
                    return;
                }
                attempt += 1;
                pollTimeoutId = setTimeout(initAdapter, pollDelayMs);
                return;
            }

            try {
                chartDebugLog('API ready, WebSocket state:', chart_api.api?.connection?.readyState);
                const transport = createTransport();
                const services = createServices();
                const championAdapter = buildSmartchartsChampionAdapter(transport, services, {
                    debug: true,
                    subscriptionTimeout: 30000,
                });

                if (isMountedRef.current && !cancelled) {
                    setAdapter(championAdapter);
                    setAdapterInitialized(true);
                    setError(null);
                }
            } catch (err) {
                if (isMountedRef.current && !cancelled) {
                    setError(err instanceof Error ? err : new Error('Failed to initialize adapter'));
                    setIsLoading(false);
                }
            }
        };

        initAdapter();

        return () => {
            cancelled = true;
            if (pollTimeoutId) clearTimeout(pollTimeoutId);
        };
    }, [adapterInitialized]);

    // Load chart data when adapter is initialized
    //
    // CORRECCIÓN (Chart se queda "obteniendo datos" indefinidamente en
    // móvil): antes se reintentaba a intervalos FIJOS de 200ms, un máximo de
    // 10 veces — 2 segundos en total — antes de rendirse PARA SIEMPRE (este
    // efecto no vuelve a ejecutarse solo: sus dependencias
    // [adapter, adapterInitialized] no cambian una vez montado). El fetch
    // real de active_symbols puede tardar bastante más que eso (hasta ~10s
    // por intento, con sus propios reintentos internos — ver
    // ACTIVE_SYMBOLS_TIMEOUT_MS / scheduleActiveSymbolsRetry en
    // api-base.ts). En PC, con conexión rápida, el fetch casi siempre
    // terminaba antes de agotarse los 2 segundos, así que el bug era
    // invisible. En móvil, con más latencia, los 2 segundos casi nunca
    // alcanzaban: el efecto se rendía mientras active_symbols seguía en
    // camino, y cuando por fin llegaba ya no quedaba nadie escuchando — el
    // Chart se quedaba con activeSymbols=[] para siempre, mostrando el
    // loader sin ningún error visible.
    //
    // Ahora: 1) backoff exponencial acotado a una ventana realista (~45s,
    // cubriendo el peor caso normal); 2) tras agotarla, en vez de un abandono
    // definitivo, un sondeo lento (cada 8s, hasta 4 minutos) que sigue
    // comprobando sin saturar la red; 3) además, cualquier reconexión real
    // del socket del gráfico (chart_api.onReconnect — ya usado para
    // restablecer las suscripciones de precios) dispara un reintento
    // inmediato con el backoff reiniciado, así una recuperación de red tras
    // agotar los reintentos igual hace que el Chart cargue solo.
    useEffect(() => {
        if (!adapter || !adapterInitialized) return;

        let cancelled = false;
        let retry_window_started_at: number | null = null;
        let slow_poll_attempts = 0;

        const FAST_RETRY_MAX_DELAY_MS = 5000;
        const FAST_RETRY_WINDOW_MS = 45000;
        const SLOW_POLL_INTERVAL_MS = 8000;
        const MAX_SLOW_POLL_ATTEMPTS = 30; // ~4 minutes of background polling

        const clearPendingRetry = () => {
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };

        const loadChartData = async (retryCount = 0) => {
            if (cancelled) return;
            try {
                setIsLoading(true);
                chartDebugLog('getChartData start', { retryCount });
                const data = await adapter.getChartData();

                if (cancelled || !isMountedRef.current) return;

                if (data.activeSymbols.length === 0) {
                    if (retry_window_started_at === null) retry_window_started_at = Date.now();
                    const elapsed = Date.now() - retry_window_started_at;

                    if (elapsed < FAST_RETRY_WINDOW_MS) {
                        const next_delay = Math.min(300 * 2 ** retryCount, FAST_RETRY_MAX_DELAY_MS);
                        chartDebugLog('active_symbols still empty, retrying', { retryCount, next_delay, elapsed });
                        clearPendingRetry();
                        retryTimeoutRef.current = setTimeout(() => {
                            if (!cancelled && isMountedRef.current) loadChartData(retryCount + 1);
                        }, next_delay);
                        return;
                    }

                    if (slow_poll_attempts < MAX_SLOW_POLL_ATTEMPTS) {
                        slow_poll_attempts += 1;
                        chartDebugLog('fast retry window exhausted, switching to slow background poll', {
                            attempt: slow_poll_attempts,
                        });
                        clearPendingRetry();
                        retryTimeoutRef.current = setTimeout(() => {
                            if (!cancelled && isMountedRef.current) loadChartData(retryCount + 1);
                        }, SLOW_POLL_INTERVAL_MS);
                        return;
                    }

                    // Se agotó también el sondeo lento. No se queda reintentando
                    // para siempre, pero tampoco queda varado sin posibilidad de
                    // recuperación: el listener de chart_api.onReconnect (más
                    // abajo) vuelve a intentarlo inmediatamente en cuanto ocurra
                    // una reconexión real del socket.
                    chartDebugLog('gave up background polling for now; will resume on next reconnect event');
                }

                retry_window_started_at = null;
                slow_poll_attempts = 0;
                chartDebugLog('chart data ready', {
                    activeSymbols: data.activeSymbols.length,
                    tradingTimes: Object.keys(data.tradingTimes || {}).length,
                });
                setChartData({
                    activeSymbols: data.activeSymbols,
                    tradingTimes: data.tradingTimes,
                });
                setError(null);
            } catch (err) {
                chartDebugLog('getChartData threw', err);
                if (!cancelled && isMountedRef.current) {
                    setError(err instanceof Error ? err : new Error('Failed to load chart data'));
                    setChartData({
                        activeSymbols: [] as ActiveSymbols,
                        tradingTimes: {} as TradingTimesMap,
                    });
                }
            } finally {
                if (!cancelled && isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

        loadChartData();

        // Reintento inmediato cuando el socket del gráfico se reconecta de
        // verdad, sin esperar al próximo paso del backoff/sondeo.
        const unsubscribeReconnect =
            typeof chart_api.onReconnect === 'function'
                ? chart_api.onReconnect(() => {
                      if (cancelled) return;
                      chartDebugLog('reconnect detected, re-checking chart data');
                      retry_window_started_at = null;
                      slow_poll_attempts = 0;
                      clearPendingRetry();
                      loadChartData(0);
                  })
                : null;

        // Cleanup function to cancel async operations
        return () => {
            cancelled = true;
            clearPendingRetry();
            unsubscribeReconnect?.();
        };
    }, [adapter, adapterInitialized]);

    // Memoized getQuotes function
    const getQuotes: TGetQuotes = useCallback(
        async params => {
            if (!adapter) {
                throw new Error('Adapter not initialized');
            }

            const result = await adapter.getQuotes({
                symbol: params.symbol,
                granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                count: params.count,
                start: params.start,
                end: params.end,
            });

            // Transform adapter result to SmartCharts Champion format
            if (params.granularity === 0) {
                // For ticks, return history format
                return {
                    history: {
                        prices: result.quotes.map(q => q.Close),
                        times: result.quotes.map(q => parseInt(q.Date)),
                    },
                };
            } else {
                // For candles, return candles format
                return {
                    candles: result.quotes.map(q => ({
                        open: q.Open || q.Close,
                        high: q.High || q.Close,
                        low: q.Low || q.Close,
                        close: q.Close,
                        epoch: parseInt(q.Date),
                    })),
                };
            }
        },
        [adapter]
    );

    // Memoized subscribeQuotes function
    const subscribeQuotes: TSubscribeQuotes = useCallback(
        (params, callback) => {
            if (!adapter) {
                return () => {};
            }

            const unsubscribe = adapter.subscribeQuotes(
                {
                    symbol: params.symbol,
                    granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                },
                quote => {
                    if (isMountedRef.current) {
                        callback(quote);
                    }
                }
            );

            // Create wrapper BEFORE storing/returning to avoid race condition
            const wrappedUnsubscribe = () => {
                unsubscribe();
                const index = cleanupFunctionsRef.current.indexOf(wrappedUnsubscribe);
                if (index > -1) {
                    cleanupFunctionsRef.current.splice(index, 1);
                }
            };

            // Store BEFORE returning to avoid race condition
            cleanupFunctionsRef.current.push(wrappedUnsubscribe);

            return wrappedUnsubscribe;
        },
        [adapter]
    );

    // Memoized unsubscribeQuotes function
    const unsubscribeQuotes: TUnsubscribeQuotes = useCallback(
        request => {
            if (adapter) {
                // If we have request details, use the adapter's unsubscribe method
                if (request?.symbol && typeof request.granularity !== 'undefined') {
                    adapter.unsubscribeQuotes({
                        symbol: request.symbol,
                        granularity: isValidGranularity(request.granularity) ? request.granularity : 0,
                    });
                } else {
                    // Fallback: unsubscribe all via transport
                    adapter.transport.unsubscribeAll('ticks');
                }
            }
        },
        [adapter]
    );

    // Cleanup effect - runs on unmount
    useEffect(() => {
        return () => {
            // Execute all cleanup functions
            cleanupFunctionsRef.current.forEach(cleanup => {
                try {
                    cleanup();
                } catch (err) {
                    logger.error('Error during cleanup:', err);
                }
            });
            cleanupFunctionsRef.current = [];

            // Unsubscribe from all ticks
            try {
                chart_api.api?.forgetAll('ticks');
            } catch (err) {
                logger.error('Error forgetting ticks:', err);
            }

            // Clean up adapter subscriptions
            if (adapter?.transport) {
                try {
                    adapter.transport.unsubscribeAll('ticks');
                } catch (err) {
                    logger.error('Error unsubscribing from adapter:', err);
                }
            }

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [adapter]);

    // Return object without useMemo wrapper (callbacks are already memoized)
    return {
        adapter,
        adapterInitialized,
        chartData,
        getQuotes,
        subscribeQuotes,
        unsubscribeQuotes,
        isLoading,
        error,
    };
};
