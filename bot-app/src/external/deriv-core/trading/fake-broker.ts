// @ts-nocheck — dev-only paper-trading shim; loosely typed like the vendored
// bot-skeleton files it patches (api-base.ts, client-store.ts, etc).
/**
 * Fake broker — DEV ONLY paper trading engine.
 *
 * ⚠ SIMULATION-ONLY COMPONENT. This module never runs in a production
 * build: every entry point below is gated behind isMockLoginAvailable(),
 * which is only true when `import.meta.env.DEV` is true (see mock-login.ts).
 * Rsbuild compiles DEV to `false` for `npm run build`, so end users never
 * see or interact with this code — it exists purely to let developers
 * iterate on the UI locally without a real Deriv account or real trades.
 *
 * Lets DBot actually run against the mock account instead of just showing
 * fake account buttons: `buy`, `sell`, `balance`, `proposal_open_contract`,
 * `ticks_history` (history + live tick/ohlc stream) and `proposal` requests
 * are all intercepted and settled/generated locally (see
 * fake-market-data.ts for the synthetic price engine). This is intentional
 * ("modo simulado total"): relying on Deriv's real market-data feed left
 * the Chart and the bot's strategy engine permanently stuck waiting
 * ("obteniendo datos" / "esperando señal para comprar un contrato")
 * whenever that real connection didn't respond in time. No request that
 * could touch a real account (buy/sell/balance) ever reaches Deriv, and
 * now neither does ticks/proposal — only `active_symbols`/`trading_times`
 * still go to the real API (and even those have a UI-level fallback, see
 * useSmartChartAdaptor.ts).
 *
 * Settlement: every contract, of any type, resolves with a fixed 92.3% win /
 * 7.7% loss probability — not based on real market movement. The exit price
 * shown on the contract card is still fetched for display purposes, but it
 * has no bearing on the outcome. This fixed win rate is intentional and
 * fine for a dev-only sandbox, but it must never be exposed to end users or
 * presented as a real (or realistic) trading result — see the module-level
 * gate above.
 *
 * Only installs when isMockLoginAvailable() is true (dev build) and stays
 * fully inert (passthrough to the real API) when no mock account is active.
 */
import { Subject } from 'rxjs';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { CONNECTION_STATUS, connectionStatus$ } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { applyMockBalanceDelta, getActiveMockAccount, isMockLoginAvailable } from '@/external/deriv-core/auth/mock-login';
import { buildCandleHistory, buildTickHistory, currentPrice, pipSizeFor, stepPrice } from './fake-market-data';

let patchedApiRef: any = null;
let watcherStarted = false;
let realSend: ((data: unknown) => Promise<any>) | null = null;
const fakeMessages$ = new Subject<{ data: any }>();
const proposalCache = new Map<string, any>();
const openContracts = new Map<string, any>();
// MODO SIMULADO TOTAL: streams de ticks/velas 100% locales (ver
// fake-market-data.ts) — no dependen de que el WebSocket real a Deriv
// entregue datos a tiempo. Evita que el bot se quede para siempre
// "esperando señal para comprar un contrato" cuando esa respuesta real
// nunca llega en el entorno del usuario.
const tickStreamIntervals = new Map<string, ReturnType<typeof setInterval>>();
const ohlcStreamIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Re-patch the instant the WebSocket actually opens (fresh connection or
// reconnect), instead of only relying on the slower interval watcher below.
// Without this, a buy attempt that lands in the window right after a
// reconnect (api_base.api swapped for a new, unpatched instance) would fall
// through to the real API and come back with a real "Please log in."
// (AuthorizationRequired) instead of being handled by the fake broker.
connectionStatus$.subscribe(status => {
    if (status === CONNECTION_STATUS.OPENED) installFakeBroker();
});

const APPROX_TICK_MS = 2000; // rough interval between synthetic-index ticks

function unitToMs(duration: number, duration_unit: string): number {
    const n = Number(duration) || 0;
    switch (duration_unit) {
        case 't':
            return n * APPROX_TICK_MS;
        case 'm':
            return n * 60 * 1000;
        case 'h':
            return n * 60 * 60 * 1000;
        case 'd':
            return n * 24 * 60 * 60 * 1000;
        case 's':
        default:
            return n * 1000;
    }
}

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

async function fetchRealSpot(symbol: string): Promise<number | undefined> {
    if (!symbol) return undefined;
    // MODO SIMULADO TOTAL: antes esto pedía un precio real al servidor
    // (vía realSend), lo que podía quedarse colgado exactamente igual que
    // el resto de las llamadas reales cuando el WebSocket no responde a
    // tiempo. Usar directamente el precio sintético local (siempre
    // disponible, nunca espera a nadie) para el precio de salida del
    // contrato.
    return currentPrice(symbol);
}

// "Porcentaje de ganancia" configurado en Home (ver Notifications ->
// Porcentaje de ganancia, public/home.html + sim-shared.js). Misma
// clave de localStorage que escribe TradeLabSim.saveWinPercent(), leída
// aquí en vivo (no cacheada) para que un cambio en Home aplique desde
// la siguiente operación, sin recargar. "Predeterminado de Deriv" =
// 51.8%; si el usuario elige "Personalizada", usa ese valor tal cual.
const WIN_PERCENT_STORAGE_KEY = 'configuredWinPercent';
const DEFAULT_WIN_PERCENT = 51.8;

const getWinProbability = (): number => {
    try {
        const raw = localStorage.getItem(WIN_PERCENT_STORAGE_KEY);
        const percent = raw !== null ? Number(raw) : NaN;
        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
            return percent / 100;
        }
    } catch {
        // localStorage no disponible (ej. modo privado) -> usa el valor por defecto.
    }
    return DEFAULT_WIN_PERCENT / 100;
};

const rollWin = (): boolean => Math.random() < getWinProbability();

function pushOpenContractMessage(contract: Record<string, unknown>): void {
    fakeMessages$.next({ data: { msg_type: 'proposal_open_contract', proposal_open_contract: { ...contract } } });
}

function pushBalanceMessage(): void {
    const acc = getActiveMockAccount();
    if (!acc) return;
    fakeMessages$.next({
        data: { msg_type: 'balance', balance: { balance: acc.balance, currency: acc.currency, loginid: acc.loginid } },
    });
}

async function settleContract(contract_id: string): Promise<void> {
    const c = openContracts.get(contract_id);
    if (!c || c.is_sold) return;

    // Still fetch a real exit price so the contract card shows a genuine,
    // plausible market number — but the win/loss outcome itself now always
    // follows the fixed 92.3% win rate below, regardless of contract type.
    const exit = await fetchRealSpot(c.underlying);
    const won = rollWin();

    const sell_price = won ? c.payout : 0;

    Object.assign(c, {
        is_sold: 1,
        is_expired: 1,
        is_valid_to_sell: 0,
        is_completed: true,
        exit_tick: exit ?? c.entry_tick,
        exit_spot: exit ?? c.entry_tick,
        exit_tick_display_value: exit !== undefined ? String(exit) : c.entry_tick_display_value,
        exit_tick_time: Math.floor(Date.now() / 1000),
        current_spot: exit ?? c.entry_tick,
        sell_price,
        bid_price: sell_price,
        profit: sell_price - c.buy_price,
        status: won ? 'won' : 'lost',
        sell_time: Math.floor(Date.now() / 1000),
        transaction_ids: { ...c.transaction_ids, sell: genId('sell_tx') },
    });

    applyMockBalanceDelta(c.loginid, sell_price);
    pushOpenContractMessage(c);
    pushBalanceMessage();
}

/**
 * Construye una cotización (proposal) 100% local a partir del precio
 * sintético actual del símbolo — ver fake-market-data.ts. Reemplaza la
 * llamada real (`proposal: 1` al servidor de Deriv) que antes se usaba
 * aquí, y que podía quedarse esperando para siempre igual que el resto de
 * las llamadas reales si el WebSocket no respondía a tiempo.
 */
function buildSyntheticProposal(params: {
    amount?: number;
    basis?: string;
    contract_type?: string;
    currency?: string;
    duration?: number;
    duration_unit?: string;
    symbol: string;
    barrier?: unknown;
    multiplier?: number;
}): any {
    const spot = currentPrice(params.symbol);
    const amount = Number(params.amount) || 0;
    const payout = Math.round(amount * 1.85 * 100) / 100;
    return {
        id: genId('proposal'),
        ask_price: amount,
        display_value: String(amount),
        payout,
        spot,
        spot_time: Math.floor(Date.now() / 1000),
        date_start: Math.floor(Date.now() / 1000),
        longcode: 'Mock contract (local dev, no real money)',
        shortcode: `${params.contract_type}_MOCK`,
        contract_type: params.contract_type,
        underlying: params.symbol,
        barrier: params.barrier,
        duration: params.duration,
        duration_unit: params.duration_unit,
        currency: params.currency,
        multiplier: params.multiplier,
    };
}

async function handleBuy(data: any): Promise<any> {
    const acc = getActiveMockAccount();
    if (!acc) {
        return Promise.reject({ error: { code: 'AuthorizationRequired', message: 'Please log in.' } });
    }

    let params: any;
    let cachedProposal: any;

    if (data.buy === '1' && data.parameters) {
        // Direct buy (no prior proposal subscription) — cotización
        // sintética local, instantánea (ver buildSyntheticProposal arriba).
        params = data.parameters;
        cachedProposal = buildSyntheticProposal({
            amount: params.amount,
            basis: params.basis,
            contract_type: params.contract_type,
            currency: params.currency,
            duration: params.duration,
            duration_unit: params.duration_unit,
            symbol: params.underlying_symbol,
            barrier: params.barrier,
            multiplier: params.multiplier,
        });
    } else {
        cachedProposal = proposalCache.get(data.buy);
        params = {
            contract_type: cachedProposal?.contract_type,
            underlying_symbol: cachedProposal?.underlying,
            barrier: cachedProposal?.barrier,
            duration: cachedProposal?.duration,
            duration_unit: cachedProposal?.duration_unit,
            currency: cachedProposal?.currency || acc.currency,
            multiplier: cachedProposal?.multiplier,
        };
    }

    const price = Number(data.price ?? cachedProposal?.ask_price ?? params?.amount) || 0;
    // If we couldn't get a real payout quote, fall back to a rough
    // typical-for-Deriv multiplier rather than blocking the purchase.
    const payout = Number(cachedProposal?.payout) || price * 1.85;

    if (price > acc.balance) {
        return Promise.reject({
            error: { code: 'InsufficientBalance', message: 'You do not have enough funds in this account.' },
        });
    }

    const contract_id = genId('contract');
    const transaction_id = genId('buy_tx');
    const now = Math.floor(Date.now() / 1000);
    const entry_tick = cachedProposal?.spot ?? (await fetchRealSpot(params?.underlying_symbol));
    const duration_ms = unitToMs(params?.duration, params?.duration_unit);

    const contract = {
        contract_id,
        id: contract_id, // some UI/store code (summary-card-store) reads `.id` instead of `.contract_id`
        transaction_ids: { buy: transaction_id },
        loginid: acc.loginid,
        underlying: params?.underlying_symbol,
        display_name: params?.underlying_symbol,
        contract_type: params?.contract_type,
        barrier: params?.barrier,
        multiplier: params?.multiplier,
        currency: params?.currency || acc.currency,
        buy_price: price,
        payout,
        entry_tick,
        entry_spot: entry_tick,
        entry_tick_display_value: entry_tick !== undefined ? String(entry_tick) : undefined,
        entry_tick_time: now,
        current_spot: entry_tick,
        current_spot_time: now,
        date_start: now,
        date_expiry: now + Math.round(duration_ms / 1000),
        tick_count: params?.duration_unit === 't' ? Number(params?.duration) || 0 : 0,
        barrier_count: params?.barrier !== undefined ? 1 : 0,
        purchase_time: now,
        is_sold: 0,
        is_expired: 0,
        is_valid_to_sell: 1,
        is_completed: false,
        bid_price: price,
        profit: 0,
        status: 'open',
        longcode: cachedProposal?.longcode || 'Mock contract (local dev, no real money)',
        shortcode: cachedProposal?.shortcode || `${params?.contract_type}_MOCK`,
    };
    openContracts.set(contract_id, contract);

    applyMockBalanceDelta(acc.loginid, -price);
    pushBalanceMessage();
    // Fire once, shortly after the buy response, so anything that only
    // listens for proposal_open_contract updates (not the buy response
    // itself) also sees the freshly opened contract.
    setTimeout(() => pushOpenContractMessage(contract), 50);

    const isMultiplier = params?.contract_type === 'MULTUP' || params?.contract_type === 'MULTDOWN';
    if (!isMultiplier) {
        const ms = unitToMs(params?.duration, params?.duration_unit);
        setTimeout(() => settleContract(contract_id), Math.max(ms, 500));
    }
    // Multiplier contracts stay open until a sellAtMarket() call reaches
    // handleSell() below — there's no fixed expiry to schedule against.

    return {
        msg_type: 'buy',
        echo_req: data,
        buy: {
            contract_id,
            transaction_id,
            buy_price: price,
            payout,
            purchase_time: now,
            start_time: now,
            longcode: contract.longcode,
            shortcode: contract.shortcode,
            balance_after: getActiveMockAccount()?.balance,
        },
    };
}

async function handleSell(data: any): Promise<any> {
    const contract_id = data.sell;
    const c = openContracts.get(contract_id);
    if (!c) {
        return Promise.reject({
            error: { code: 'NoOpenPosition', message: 'This contract was not found among your open positions.' },
        });
    }
    if (c.is_sold) {
        return Promise.resolve({ msg_type: 'sell', sell: { sold_for: c.sell_price } });
    }

    // Early/manual sell. Multipliers get a proportional mark-to-market P/L
    // based on real market movement; everything else follows the fixed
    // 92.3% win rate below, same as scheduled settlement in settleContract().
    const exit = await fetchRealSpot(c.underlying);
    const entry = Number(c.entry_tick);
    const isMultiplier = c.contract_type === 'MULTUP' || c.contract_type === 'MULTDOWN';

    let sell_price: number;
    if (isMultiplier && exit !== undefined && Number.isFinite(entry) && entry !== 0) {
        const multiplier = Number(c.multiplier) || 1;
        const move = (exit - entry) / entry;
        const directional_move = c.contract_type === 'MULTUP' ? move : -move;
        const profit = c.buy_price * multiplier * directional_move;
        sell_price = Math.max(0, Math.round((c.buy_price + profit) * 100) / 100);
    } else {
        const won = rollWin();
        sell_price = won ? Math.round(c.payout * 100) / 100 : 0;
    }

    Object.assign(c, {
        is_sold: 1,
        is_expired: 1,
        is_valid_to_sell: 0,
        is_completed: true,
        sell_price,
        bid_price: sell_price,
        profit: sell_price - c.buy_price,
        status: sell_price > c.buy_price ? 'won' : 'lost',
        transaction_ids: { ...c.transaction_ids, sell: genId('sell_tx') },
    });

    applyMockBalanceDelta(c.loginid, sell_price);
    pushOpenContractMessage(c);
    pushBalanceMessage();
    return Promise.resolve({ msg_type: 'sell', sell: { sold_for: sell_price } });
}

function handleProposalOpenContractPoll(data: any): Promise<any> {
    const c = openContracts.get(data.contract_id);
    if (!c) {
        return Promise.resolve({
            msg_type: 'proposal_open_contract',
            proposal_open_contract: { contract_id: data.contract_id, is_sold: 1 },
        });
    }
    return Promise.resolve({ msg_type: 'proposal_open_contract', proposal_open_contract: { ...c } });
}

/**
 * Arranca (si no existe ya) el stream local de ticks/velas en vivo para un
 * símbolo — empuja mensajes `tick`/`ohlc` sintéticos por fakeMessages$,
 * igual que lo haría el servidor real, pero sin depender de él.
 */
function ensureTickStream(symbol: string): void {
    if (tickStreamIntervals.has(symbol)) return;
    const id = setInterval(() => {
        const quote = stepPrice(symbol);
        fakeMessages$.next({
            data: {
                msg_type: 'tick',
                tick: {
                    symbol,
                    id: genId('tick_sub'),
                    quote,
                    epoch: Math.floor(Date.now() / 1000),
                    pip_size: Math.max(0, String(pipSizeFor(symbol)).split('.')[1]?.length ?? 2),
                },
            },
        });
    }, APPROX_TICK_MS);
    tickStreamIntervals.set(symbol, id);
}

function ensureOhlcStream(symbol: string, granularity: number): void {
    const key = `${symbol}_${granularity}`;
    if (ohlcStreamIntervals.has(key)) return;

    let bucketStart = Math.floor(Date.now() / 1000 / granularity) * granularity;
    let open = currentPrice(symbol);
    let high = open;
    let low = open;

    const id = setInterval(() => {
        const quote = stepPrice(symbol);
        const nowSec = Math.floor(Date.now() / 1000);
        const currentBucket = Math.floor(nowSec / granularity) * granularity;

        if (currentBucket !== bucketStart) {
            // Nueva vela: la anterior cierra, la nueva arranca en el mismo precio.
            bucketStart = currentBucket;
            open = quote;
            high = quote;
            low = quote;
        } else {
            high = Math.max(high, quote);
            low = Math.min(low, quote);
        }

        fakeMessages$.next({
            data: {
                msg_type: 'ohlc',
                ohlc: {
                    symbol,
                    granularity,
                    id: genId('ohlc_sub'),
                    open,
                    high,
                    low,
                    close: quote,
                    open_time: bucketStart,
                    epoch: bucketStart,
                },
            },
        });
    }, APPROX_TICK_MS);
    ohlcStreamIntervals.set(key, id);
}

/**
 * Intercepta `ticks_history` (con o sin `subscribe: 1`) — tanto el
 * historial inicial como el stream en vivo pasan a ser 100% locales (ver
 * fake-market-data.ts). Esta es la causa raíz de que el bot se quedara
 * "esperando señal para comprar un contrato" para siempre: antes esta
 * llamada iba al servidor real y, si no respondía a tiempo, la promesa
 * nunca se resolvía — el intérprete de estrategia jamás recibía un tick
 * con el que evaluar sus condiciones.
 */
function handleTicksHistory(data: any): Promise<any> {
    const symbol = data.ticks_history === 'na' ? 'R_100' : data.ticks_history;
    const granularity = Number(data.granularity) || 0;
    const count = Number(data.count) || 1000;

    if (granularity > 0) {
        const candles = buildCandleHistory(symbol, count, granularity);
        if (data.subscribe) ensureOhlcStream(symbol, granularity);
        return Promise.resolve({ msg_type: 'candles', echo_req: data, candles });
    }

    const { times, prices } = buildTickHistory(symbol, count);
    if (data.subscribe) ensureTickStream(symbol);
    return Promise.resolve({ msg_type: 'history', echo_req: data, history: { times, prices } });
}

/**
 * Intercepta `proposal` (cotización indicativa, usada por el motor de
 * estrategias antes de un `buy` basado en id de propuesta). Igual que
 * ticks_history, era una de las llamadas que podía quedarse colgada
 * esperando al servidor real.
 */
function handleProposalSubscribe(data: any): Promise<any> {
    const proposal = buildSyntheticProposal({
        amount: data.amount,
        basis: data.basis,
        contract_type: data.contract_type,
        currency: data.currency,
        duration: data.duration,
        duration_unit: data.duration_unit,
        symbol: data.symbol,
        barrier: data.barrier,
        multiplier: data.multiplier,
    });
    proposalCache.set(proposal.id, proposal);
    return Promise.resolve({ msg_type: 'proposal', echo_req: data, proposal });
}

/**
 * Patches api_base.api.send / onMessage so buy/sell/balance are simulated
 * locally whenever a mock account is active. Safe to call more than once —
 * only installs itself the first time, and retries shortly if api_base.api
 * isn't ready yet (it's created asynchronously on app start).
 */
/**
 * Patches api_base.api.send / onMessage so buy/sell/balance are simulated
 * locally whenever a mock account is active. Safe to call more than once.
 *
 * Re-patches itself whenever `api_base.api` gets swapped for a new instance
 * (a real WebSocket reconnect — e.g. after the tab regains focus). Without
 * this, `realSend`/`onMessage` would stay bound to the old, disconnected
 * socket, and everything routed through it (ticks, proposal quotes — the
 * chart/digits feed) would silently stop updating instead of following the
 * app onto the fresh connection.
 */
export function installFakeBroker(): void {
    if (!isMockLoginAvailable()) return;
    if (!api_base?.api) {
        setTimeout(installFakeBroker, 300);
        return;
    }
    if (api_base.api === patchedApiRef) return; // already patched onto this instance

    patchedApiRef = api_base.api;
    realSend = api_base.api.send.bind(api_base.api);
    const originalOnMessage = api_base.api.onMessage.bind(api_base.api);

    // Passively cache every real proposal quote (price, payout, entry spot,
    // longcode) as it streams in, so a later id-based buy request has real
    // numbers to settle against.
    originalOnMessage().subscribe(({ data }: { data: any }) => {
        if (data?.msg_type === 'proposal' && data?.proposal?.id) {
            proposalCache.set(data.proposal.id, data.proposal);
        }
    });

    api_base.api.onMessage = () => ({
        subscribe: (cb: (msg: { data: any }) => void) => {
            const s1 = originalOnMessage().subscribe(cb);
            const s2 = fakeMessages$.subscribe(cb);
            return {
                unsubscribe: () => {
                    s1.unsubscribe();
                    s2.unsubscribe();
                },
            };
        },
    });

    api_base.api.send = (data: any) => {
        if (!getActiveMockAccount()) return realSend!(data);

        if (data?.buy !== undefined) return handleBuy(data);
        if (data?.sell !== undefined) return handleSell(data);
        if (data?.proposal_open_contract !== undefined && data?.contract_id) {
            return handleProposalOpenContractPoll(data);
        }
        if (data?.balance) {
            const acc = getActiveMockAccount()!;
            return Promise.resolve({
                msg_type: 'balance',
                balance: { balance: acc.balance, currency: acc.currency, loginid: acc.loginid },
            });
        }
        // CORRECCIÓN: api_base.authorizeAndSubscribe() siempre se suscribe a
        // 'transaction' y a 'proposal_open_contract' (sin contract_id, para
        // TODOS los contratos de la cuenta) además de 'balance'. Como estas
        // dos no tenían caso aquí, cualquier cuenta mock (sin token real de
        // Deriv) las dejaba pasar a realSend(), y el servidor real las
        // rechazaba por falta de autorización real — quedando como un
        // "Uncaught (in promise)" en consola y, en el caso de
        // proposal_open_contract, reintentándose indefinidamente contra la
        // API real sin ninguna posibilidad de éxito. Ninguna de las dos hace
        // falta en modo simulado: los cambios de balance y de contrato ya se
        // emiten localmente (pushBalanceMessage/pushOpenContractMessage) vía
        // fakeMessages$, así que basta con confirmar la suscripción sin
        // reenviarla al servidor real.
        if (data?.transaction !== undefined) {
            return Promise.resolve({ msg_type: 'transaction', subscription: { id: genId('sub_transaction') } });
        }
        if (data?.proposal_open_contract !== undefined && !data?.contract_id) {
            return Promise.resolve({
                msg_type: 'proposal_open_contract',
                subscription: { id: genId('sub_poc') },
                proposal_open_contract: {},
            });
        }
        // MODO SIMULADO TOTAL: ticks_history (historial + stream en vivo) y
        // proposal (cotización indicativa) ahora se generan 100% en local
        // (ver fake-market-data.ts) en vez de depender del servidor real —
        // ver comentarios en handleTicksHistory/handleProposalSubscribe.
        if (data?.ticks_history !== undefined) {
            return handleTicksHistory(data);
        }
        if (data?.proposal !== undefined && data?.symbol) {
            return handleProposalSubscribe(data);
        }
        if (data?.forget !== undefined || data?.forget_all !== undefined) {
            // Todos nuestros streams en vivo (tick/ohlc/balance/contrato)
            // son locales — no hay nada real que "olvidar" en el servidor.
            return Promise.resolve({ msg_type: data?.forget !== undefined ? 'forget' : 'forget_all', forget: 1 });
        }

        // Everything else (active_symbols, trading_times, ...) is public
        // market data — send it to the real API untouched.
        return realSend!(data);
    };

    console.info('[fake-broker] Installed — buy/sell/balance now run against local fake money, real market data.');

    if (!watcherStarted) {
        watcherStarted = true;
        // Cheap periodic check — catches a WebSocket reconnect (new
        // api_base.api instance) shortly after it happens and re-patches
        // onto it, instead of staying silently bound to the dead socket.
        setInterval(() => {
            if (isMockLoginAvailable() && api_base?.api && api_base.api !== patchedApiRef) {
                installFakeBroker();
            }
        }, 2000);
    }
}
