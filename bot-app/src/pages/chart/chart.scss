import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
/* [AI] - Analytics removed - rudderstack event tracking removed */
/* [/AI] */
import ChunkLoader from '@/components/loader/chunk-loader';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useStore } from '@/hooks/useStore';
import { ChartTitle, SmartChart, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';

const Chart = observer(({ show_digits_stats }: { show_digits_stats: boolean }) => {
    const barriers: [] = [];
    const { common, ui } = useStore();
    const { chart_store, run_panel, dashboard } = useStore();
    const [isSafari, setIsSafari] = useState(false);

    const {
        chart_type,
        getMarketsOrder,
        granularity,
        onSymbolChange,
        setChartStatus,
        symbol,
        updateChartType,
        updateGranularity,
        updateSymbol,
    } = chart_store;

    // Use the custom hook for SmartChart Adaptor
    const { chartData, getQuotes: rawGetQuotes, subscribeQuotes: rawSubscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    // scrollToEpoch (prop pública y documentada de SmartCharts, ver
    // README oficial de @deriv-com/smartcharts-champion): "Scrolls the
    // chart to the leftmost side and sets the last spot/bar as the
    // first visible spot/bar in the chart." El requisito es que el
    // gráfico esté SIEMPRE siguiendo el precio en vivo — al entrar,
    // durante una operación y después de que termina — sin quedarse
    // "atrás".
    //
    // CORRECCIÓN: al principio se actualizaba scrollToEpoch con CADA tick
    // nuevo, sin agrupar. La librería dispara una animación de "saltar al
    // último precio" cada vez que este valor cambia — y si llega un tick
    // nuevo antes de que esa animación termine (los índices de
    // volatilidad pueden tickear varias veces por segundo), la reinicia
    // sin dejarla completar. El resultado visible era justo lo contrario
    // de lo buscado: en vez de seguir el precio en vivo, la vista se
    // quedaba atascada/atrasada, acumulando ticks sin terminar de
    // desplazarse, hasta que había que arrastrarla a mano para
    // "alcanzar" el precio actual.
    //
    // Ahora se agrupan los ticks que llegan muy seguido y solo se aplica
    // el más reciente cada ~800ms — tiempo suficiente para que la
    // animación de la librería termine antes de pedirle la siguiente —
    // mantenien el gráfico sincronizado de forma continua y fluida en
    // vez de en saltos que se pisan entre sí.
    const [liveScrollEpoch, setLiveScrollEpoch] = useState<number | undefined>(undefined);
    const pendingEpochRef = useRef<number | undefined>(undefined);
    const followLiveEpochTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const followLiveEpoch = useCallback((epoch: number | undefined) => {
        if (!epoch) return;
        pendingEpochRef.current = epoch;

        if (followLiveEpochTimerRef.current) return;

        followLiveEpochTimerRef.current = setTimeout(() => {
            followLiveEpochTimerRef.current = null;
            const latestEpoch = pendingEpochRef.current;
            setLiveScrollEpoch(prev => (prev === latestEpoch ? prev : latestEpoch));
        }, 800);
    }, []);

    useEffect(
        () => () => {
            if (followLiveEpochTimerRef.current) {
                clearTimeout(followLiveEpochTimerRef.current);
                followLiveEpochTimerRef.current = null;
            }
        },
        []
    );

    const extractLatestEpochFromQuotesResult = (result: any): number | undefined => {
        if (!result) return undefined;
        if (Array.isArray(result.candles) && result.candles.length > 0) {
            return result.candles[result.candles.length - 1]?.epoch;
        }
        if (result.history?.times?.length > 0) {
            const lastTime = result.history.times[result.history.times.length - 1];
            return typeof lastTime === 'number' ? lastTime : Number(lastTime);
        }
        return undefined;
    };

    const getQuotes: typeof rawGetQuotes = useCallback(
        async (...args) => {
            const result = await rawGetQuotes(...args);
            followLiveEpoch(extractLatestEpochFromQuotesResult(result));
            return result;
        },
        [rawGetQuotes, followLiveEpoch]
    );

    const subscribeQuotes: typeof rawSubscribeQuotes = useCallback(
        (params, callback) =>
            rawSubscribeQuotes(params, quote => {
                const epoch = (quote as any)?.tick?.epoch ?? (quote as any)?.epoch ?? (quote as any)?.ohlc?.epoch;
                followLiveEpoch(epoch);
                callback(quote);
            }),
        [rawSubscribeQuotes, followLiveEpoch]
    );

    const { isDesktop, isMobile } = useDevice();
    const { is_drawer_open } = run_panel;
    const { is_chart_modal_visible } = dashboard;

    const settings = {
        assetInformation: false, // ui.is_chart_asset_info_visible,
        countdown: true,
        isHighestLowestMarkerEnabled: false, // TODO: Pending UI,
        language: common.current_language.toLowerCase(),
        position: ui.is_chart_layout_default ? 'bottom' : 'left',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
    };

    useEffect(() => {
        // Safari browser detection using feature detection
        // More robust than user agent sniffing
        const isSafariBrowser = () => {
            // Check for Safari-specific features
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

            // Additional check: Safari has specific webkit features
            const hasWebkitFeatures = 'webkitAudioContext' in window || 'WebKitMediaSource' in window;

            return isSafari && hasWebkitFeatures;
        };

        setIsSafari(isSafariBrowser());

        return () => {
            chart_api.api.forgetAll('ticks');
        };
    }, []);

    useEffect(() => {
        if (!symbol) updateSymbol();
    }, [symbol, updateSymbol]);

    const is_connection_opened = !!chart_api?.api;

    const handleStateChange: TStateChangeListener = (state, options) => {
        /* [AI] - Analytics removed - rudderstack event call removed */
        // Handle state changes: INITIAL, READY, SCROLL_TO_LEFT
        /* [/AI] */
        if (state === 'READY') {
            setChartStatus(true);
        }
    };

    if (!symbol || chartData.activeSymbols.length === 0) {
        return <ChunkLoader message='' />;
    }

    return (
        <div
            className={classNames('dashboard__chart-wrapper', {
                'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                'dashboard__chart-wrapper--safari': isSafari,
            })}
            dir='ltr'
        >
            <SmartChart
                id={`dbot-${symbol}`}
                key={`chart-${symbol}`}
                barriers={barriers}
                showLastDigitStats={show_digits_stats}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                stateChangeListener={handleStateChange}
                toolbarWidget={() => (
                    <ToolbarWidgets
                        updateChartType={updateChartType}
                        updateGranularity={updateGranularity}
                        position={!isDesktop ? 'bottom' : 'top'}
                        isDesktop={isDesktop}
                    />
                )}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity as TGranularity}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                chartData={{ activeSymbols: chartData.activeSymbols, tradingTimes: chartData.tradingTimes }}
                settings={settings}
                symbol={symbol}
                topWidgets={() => <ChartTitle onChange={onSymbolChange} />}
                isConnectionOpened={is_connection_opened}
                getMarketsOrder={getMarketsOrder}
                isLive
                scrollToEpoch={liveScrollEpoch}
                leftMargin={80}
                drawingToolFloatingMenuPosition={isMobile ? { x: 100, y: 100 } : { x: 200, y: 200 }}
            />
        </div>
    );
});

export default Chart;
