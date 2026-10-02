// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { action, computed, makeObservable, observable, reaction } from 'mobx';
import { LocalStore } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton';
import RootStore from './root-store';

type TSubscription = {
    id: string | null;
    subscriber: null | { unsubscribe: () => void };
};

export default class ChartStore {
    root_store: RootStore;
    constructor(root_store: RootStore) {
        makeObservable(this, {
            symbol: observable,
            is_chart_loading: observable,
            chart_type: observable,
            granularity: observable,
            is_contract_ended: computed,
            updateSymbol: action,
            onSymbolChange: action,
            updateGranularity: action,
            updateChartType: action,
            setChartStatus: action,
            restoreFromStorage: action,
            chart_subscription_id: observable,
            setChartSubscriptionId: action,
        });

        this.root_store = root_store;
        const { run_panel } = root_store;

        reaction(
            () => run_panel.is_running,
            () => (run_panel.is_running ? this.onStartBot() : this.onStopBot())
        );

        this.restoreFromStorage();
    }

    subscription: TSubscription = {
        id: null,
        subscriber: null,
    };
    chart_subscription_id = '';

    symbol: string | undefined;
    is_chart_loading: boolean | undefined;
    chart_type: string | undefined;
    granularity: number | undefined;

    get is_contract_ended() {
        const { transactions } = this.root_store;

        return transactions.contracts.length > 0 && transactions.contracts[0].is_ended;
    }

    onStartBot = () => {
        this.updateSymbol();
    };

    // eslint-disable-next-line
    onStopBot = () => {
        // const { main_content } = this.root_store;
        // main_content.setActiveTab(tabs_title.WORKSPACE);
    };

    updateSymbol = () => {
        // CORRECCIÓN (causa raíz de "no carga nada" al entrar directo a
        // #chart): esta función se llama incondicionalmente desde el efecto
        // de montaje de Chart (chart.tsx: `if (!symbol) updateSymbol();`),
        // es decir, ANTES de que exista ninguna garantía de haber abierto
        // Bot Builder. `window.Blockly` solo se asigna dentro de
        // `loadBlockly()` (scratch/blockly.js), que es async y se dispara
        // al inicializar Bot Builder — si el usuario entra directo a
        // #chart (o recarga ahí) sin haber pasado antes por Bot Builder,
        // `window.Blockly` todavía es `undefined` en ese momento.
        //
        // Antes, `window.Blockly.derivWorkspace` (sin `?.` sobre
        // `window.Blockly`) lanzaba un TypeError síncrono dentro del
        // useEffect de Chart. React enruta ese error al ErrorBoundary
        // global (que envuelve TODA la app), que hace `forceUpdate()` para
        // recuperarse; pero como `symbol` nunca llegaba a asignarse, el
        // remount repetía el mismo throw una y otra vez — hasta agotar el
        // límite de recuperaciones (5 en 2s) y entonces el ErrorBoundary
        // deja de reintentar y renderiza `null` para TODA la aplicación.
        // Resultado visible: pantalla en blanco / "no carga nada" al
        // entrar directo a #chart, exactamente el reporte del usuario.
        //
        // El resto del código ya sigue este mismo patrón defensivo en
        // otros lugares (p. ej. app-store.ts: `window.Blockly?.derivWorkspace`);
        // aquí faltaba.
        if (!window.Blockly) {
            console.warn(
                '[ChartStore] updateSymbol(): window.Blockly aún no está listo (Bot Builder no se ha ' +
                    'inicializado todavía) — usando el símbolo de active_symbols como fallback.'
            );
        }

        const workspace = window.Blockly?.derivWorkspace;
        const market_block = workspace?.getAllBlocks().find((block: window.Blockly.Block) => {
            return block.type === 'trade_definition_market';
        });

        const symbol =
            market_block?.getFieldValue('SYMBOL_LIST') ??
            (api_base?.active_symbols[0]
                ? (api_base.active_symbols[0] as any).underlying_symbol || (api_base.active_symbols[0] as any).symbol
                : undefined);

        if (!symbol) {
            console.warn(
                '[ChartStore] updateSymbol(): todavía no hay símbolo disponible (ni bloque de mercado ni ' +
                    'active_symbols poblado). Chart seguirá mostrando el loader hasta el próximo intento.'
            );
        }

        this.symbol = symbol;
    };

    onSymbolChange = (symbol: string) => {
        this.symbol = symbol;
        this.saveToLocalStorage();
    };

    updateGranularity = (granularity: number) => {
        this.granularity = granularity;
        this.saveToLocalStorage();
    };

    updateChartType = (chart_type: string) => {
        this.chart_type = chart_type;
        this.saveToLocalStorage();
    };

    setChartStatus = (status: boolean) => {
        this.is_chart_loading = status;
    };

    saveToLocalStorage = () => {
        LocalStore.set(
            'bot.chart_props',
            JSON.stringify({
                symbol: this.symbol,
                granularity: this.granularity,
                chart_type: this.chart_type,
            })
        );
    };

    restoreFromStorage = () => {
        try {
            const props = LocalStore.get('bot.chart_props');

            if (props) {
                const { symbol, granularity, chart_type } = JSON.parse(props);
                this.symbol = symbol;
                this.granularity = granularity;
                this.chart_type = chart_type;
            } else {
                this.granularity = 0;
                this.chart_type = 'line';
            }
        } catch {
            LocalStore.remove('bot.chart_props');
        }
    };

    getMarketsOrder = (active_symbols: any[]) => {
        const synthetic_index = 'synthetic_index';

        if (!active_symbols || !Array.isArray(active_symbols)) {
            return [synthetic_index];
        }

        const has_synthetic_index = !!active_symbols.find(s => s.market === synthetic_index);

        return active_symbols
            .map(s => s.market)
            .reduce(
                (arr, market) => {
                    if (arr.indexOf(market) === -1) arr.push(market);
                    return arr;
                },
                has_synthetic_index ? [synthetic_index] : []
            );
    };

    setChartSubscriptionId = (chartSubscriptionId: string) => {
        this.chart_subscription_id = chartSubscriptionId;
    };
}
