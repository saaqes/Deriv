import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSmartchartsChampionAdapter } from '@/adapters/smartcharts-champion';
import { createServices } from '@/adapters/smartcharts-champion/services';
import { createTransport } from '@/adapters/smartcharts-champion/transport';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
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
                if (attempt >= maxAttempts) {
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
    useEffect(() => {
        if (!adapter || !adapterInitialized) return;

        let cancelled = false;

        // CORRECCIÓN (causa raíz de "obteniendo datos" indefinido): la
        // obtención real de active_symbols (ver api-base.ts) puede tardar
        // legítimamente bastante más que un par de segundos — tiene su
        // propio timeout interno de 10s más hasta 5 reintentos adicionales
        // (2s/4s/6s/8s/10s) si el primer intento falla, algo frecuente en
        // redes móviles o justo al entrar directo a #chart antes de que el
        // WebSocket termine de autenticar. Antes, aquí solo se reintentaba
        // durante 2 segundos (10 x 200ms); al agotarse ese margen sin haber
        // símbolos, el estado quedaba fijado en vacío para siempre y
        // chart.tsx (que depende únicamente de chartData.activeSymbols)
        // seguía mostrando el loader sin ningún otro intento futuro.
        //
        // CORRECCIÓN ADICIONAL: incluso con un margen más amplio, un límite
        // fijo de reintentos (por grande que sea) sigue significando que,
        // si la condición que bloqueó el primer intento tarda más que ese
        // margen en resolverse (reconexión lenta, red inestable en móvil,
        // etc.), el Chart se queda "congelado" para siempre de todas
        // formas — exactamente el reporte de "nunca termina de cargar" al
        // darle Run. Por eso, pasado el primer tramo de reintentos rápidos
        // (pensado para el caso común: carga inicial un poco lenta), el
        // hook NUNCA deja de intentar mientras el componente siga montado:
        // sigue reintentando cada FALLBACK_RETRY_DELAY_MS de forma
        // indefinida. Combinado con la corrección en active-symbols.js
        // (que ya no cachea un resultado vacío como "definitivo"), en
        // cuanto la causa real se resuelva (reconexión completa, servidor
        // responde, etc.) el próximo intento programado SÍ va a traer los
        // símbolos reales — nunca se llega a un estado sin salida.
        const FAST_RETRIES = 20;
        const FAST_RETRY_DELAY_MS = 1500;
        const FALLBACK_RETRY_DELAY_MS = 5000;

        const scheduleRetry = (retryCount: number) => {
            const delayMs = retryCount < FAST_RETRIES ? FAST_RETRY_DELAY_MS : FALLBACK_RETRY_DELAY_MS;

            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }

            retryTimeoutRef.current = setTimeout(() => {
                if (!cancelled && isMountedRef.current) {
                    // eslint-disable-next-line @typescript-eslint/no-use-before-define
                    loadChartData(retryCount + 1);
                }
            }, delayMs);
        };

        const loadChartData = async (retryCount = 0) => {
            try {
                setIsLoading(true);
                const data = await adapter.getChartData();

                if (!cancelled && isMountedRef.current) {
                    // Sin símbolos todavía: nunca nos rendimos mientras el
                    // componente siga montado (ver comentario arriba).
                    if (data.activeSymbols.length === 0) {
                        scheduleRetry(retryCount);
                        return;
                    }

                    setChartData({
                        activeSymbols: data.activeSymbols,
                        tradingTimes: data.tradingTimes,
                    });
                    setError(null);
                }
            } catch (err) {
                if (!cancelled && isMountedRef.current) {
                    // Deja constancia del error (por si algo más lo usa),
                    // pero igual sigue reintentando — nunca se detiene por
                    // su cuenta, ver comentario arriba.
                    setError(err instanceof Error ? err : new Error('Failed to load chart data'));
                    scheduleRetry(retryCount);
                    return;
                }
            } finally {
                if (!cancelled && isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

        loadChartData();

        // Cleanup function to cancel async operations
        return () => {
            cancelled = true;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
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
