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
 * fake account buttons: `buy`, `sell`, `balance`, and `proposal_open_contract`
 * requests are intercepted and settled against a local fake balance. Ticks,
 * candles, proposal price quotes, and active_symbols are requested from
 * Deriv's real API FIRST — those endpoints don't need a token, so market
 * data stays real and consistent across every device/tab whenever the real
 * connection actually answers in time.
 *
 * DESBLOQUEO FINAL: en la práctica, la conexión real a Deriv puede tardar o
 * no responder nunca (red del usuario, servidor lento, endpoint de
 * autenticación caído, etc.), y eso dejaba el Chart y el botón Run
 * colgados para siempre sin ninguna forma de recuperarse — pase lo que
 * pase, el simulador tiene que poder mostrarse operando. Por eso, cuando
 * `ticks_history`/`ticks`/`candles` no responde a tiempo
 * (REAL_DATA_TIMEOUT_MS), se activa un generador local de precios
 * (random-walk) SOLO como respaldo: mismo precio para el Chart y para el
 * motor de estrategias dentro de esta pestaña (ya no hace falta que
 * coincida con otro dispositivo — esto es un desbloqueo de emergencia, no
 * el modo normal). En cuanto la API real vuelve a responder, se usa de
 * nuevo automáticamente.
 *
 * `fetchRealSpot()`/`handleBuy()`'s direct-buy proposal still ask Deriv for
 * a genuine live quote, but now through `realSendWithTimeout()`: if that
 * real call doesn't answer within a few seconds (the original cause of the
 * Chart/Run getting stuck forever), it falls back to a last-known/estimated
 * price instead of hanging the purchase or the settlement indefinitely.
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

let patchedApiRef: any = null;
let watcherStarted = false;
let realSend: ((data: unknown) => Promise<any>) | null = null;
const fakeMessages$ = new Subject<{ data: any }>();
const proposalCache = new Map<string, any>();
const openContracts = new Map<string, any>();
// Último precio real visto por símbolo — únicamente como colchón para no
// bloquear una compra/liquidación si realSendWithTimeout() se agota (ver
// REAL_DATA_TIMEOUT_MS más abajo); nunca se usa para dibujar el Chart ni
// para alimentar al motor de estrategias, que siguen usando el stream real
// de Deriv sin modificar.
const lastKnownRealSpot = new Map<string, number>();

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

// Si el servidor real no responde dentro de este margen, se usa el último
// precio real conocido para ese símbolo en vez de dejar la compra/venta
// colgada indefinidamente — el comportamiento original (sin timeout) era
// la causa de que el bot se quedara "esperando señal"/"obteniendo datos"
// para siempre cuando esa respuesta no llegaba a tiempo.
const REAL_DATA_TIMEOUT_MS = 6000;

function realSendWithTimeout(data: unknown): Promise<any> {
    if (!realSend) return Promise.reject(new Error('No hay conexión real disponible'));
    return Promise.race([
        realSend(data),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), REAL_DATA_TIMEOUT_MS)),
    ]);
}

// ---------------------------------------------------------------------
// Respaldo sintético (solo se activa si la API real no responde a tiempo)
// ---------------------------------------------------------------------
const syntheticLastPrice = new Map<string, number>();
const syntheticSubs = new Map<string, { interval: ReturnType<typeof setInterval>; symbol: string }>();

function basePriceFor(symbol: string): number {
    if (lastKnownRealSpot.has(symbol)) return lastKnownRealSpot.get(symbol)!;
    if (syntheticLastPrice.has(symbol)) return syntheticLastPrice.get(symbol)!;
    // Punto de partida razonable basado en el nombre del símbolo (p.ej.
    // R_10/R_100/1HZ50V) — no tiene ninguna relación con el precio real,
    // solo evita arrancar desde 0 o un valor absurdo mientras no hay dato
    // real alguno todavía.
    const match = symbol.match(/(\d+)/);
    const n = match ? Number(match[1]) : 100;
    return Math.max(10, n) + Math.random() * 10;
}

function nextSyntheticPrice(symbol: string): number {
    const prev = syntheticLastPrice.get(symbol) ?? basePriceFor(symbol);
    const changePct = (Math.random() - 0.5) * 0.004; // ±0.2% por paso
    const next = Math.max(0.01, prev * (1 + changePct));
    syntheticLastPrice.set(symbol, next);
    return next;
}

function buildSyntheticTicksHistory(data: any): any {
    const symbol = data.ticks_history;
    const count = Math.min(Number(data.count) || 500, 5000);
    const granularity = Number(data.granularity) || 0;
    const nowSec = Math.floor(Date.now() / 1000);

    if (granularity > 0) {
        const candles: any[] = [];
        let price = basePriceFor(symbol);
        for (let i = count - 1; i >= 0; i--) {
            const epoch = nowSec - i * granularity;
            const open = price;
            const change = (Math.random() - 0.5) * open * 0.01;
            const close = Math.max(0.01, open + change);
            const high = Math.max(open, close) + Math.random() * open * 0.002;
            const low = Math.min(open, close) - Math.random() * open * 0.002;
            candles.push({ epoch, open, high, low, close });
            price = close;
        }
        syntheticLastPrice.set(symbol, price);
        return { msg_type: 'candles', echo_req: data, candles, pip_size: 2 };
    }

    const prices: number[] = [];
    const times: number[] = [];
    let price = basePriceFor(symbol);
    for (let i = count - 1; i >= 0; i--) {
        const epoch = nowSec - i * 2; // ~2s entre ticks sintéticos
        const change = (Math.random() - 0.5) * price * 0.002;
        price = Math.max(0.01, price + change);
        prices.push(price);
        times.push(epoch);
    }
    syntheticLastPrice.set(symbol, price);
    return { msg_type: 'history', echo_req: data, history: { prices, times }, pip_size: 2 };
}

// Arranca (si no existía ya) el "stream" sintético en vivo para una
// suscripción de respaldo — emite por fakeMessages$ con el mismo formato
// que esperan tanto el Chart (transport.ts, vía data.subscription.id) como
// el motor de estrategias del bot (ticks_service.js, vía msg_type
// 'tick'/'ohlc').
function startSyntheticStream(subscriptionId: string, data: any): void {
    if (syntheticSubs.has(subscriptionId)) return;
    const symbol = data.ticks_history;
    const granularity = Number(data.granularity) || 0;

    const interval = setInterval(() => {
        const price = nextSyntheticPrice(symbol);
        const epoch = Math.floor(Date.now() / 1000);
        if (granularity > 0) {
            fakeMessages$.next({
                data: {
                    msg_type: 'ohlc',
                    subscription: { id: subscriptionId },
                    ohlc: {
                        symbol,
                        granularity,
                        id: subscriptionId,
                        epoch,
                        open_time: epoch - (epoch % granularity),
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                    },
                },
            });
        } else {
            fakeMessages$.next({
                data: {
                    msg_type: 'tick',
                    subscription: { id: subscriptionId },
                    tick: { symbol, id: subscriptionId, epoch, quote: price, pip_size: 2 },
                },
            });
        }
    }, APPROX_TICK_MS);

    syntheticSubs.set(subscriptionId, { interval, symbol });
}

function stopSyntheticStream(subscriptionId: string): boolean {
    const sub = syntheticSubs.get(subscriptionId);
    if (!sub) return false;
    clearInterval(sub.interval);
    syntheticSubs.delete(subscriptionId);
    return true;
}

async function fetchRealSpot(symbol: string): Promise<number | undefined> {
    if (!symbol) return undefined;
    try {
        const res = await realSendWithTimeout({ ticks_history: symbol, count: 1, end: 'latest', style: 'ticks' });
        const prices = res?.history?.prices;
        if (Array.isArray(prices) && prices.length) {
            const spot = Number(prices[prices.length - 1]);
            lastKnownRealSpot.set(symbol, spot);
            return spot;
        }
    } catch {
        // Servidor real sin respuesta a tiempo (o mercado cerrado/símbolo
        // inválido) — se usa el último precio real conocido en vez de
        // dejar la operación colgada; si tampoco hay uno, el llamador cae
        // al reparto por probabilidad fija de todas formas.
    }
    return lastKnownRealSpot.get(symbol);
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

async function handleBuy(data: any): Promise<any> {
    const acc = getActiveMockAccount();
    if (!acc) {
        return Promise.reject({ error: { code: 'AuthorizationRequired', message: 'Please log in.' } });
    }

    let params: any;
    let cachedProposal: any;

    if (data.buy === '1' && data.parameters) {
        // Direct buy (no prior proposal subscription) — grab one real, live
        // quote first so the price/payout reflect a genuine market price.
        // realSendWithTimeout() (en vez de realSend directo) evita que esto
        // se quede colgado para siempre si el servidor no responde a
        // tiempo — ver REAL_DATA_TIMEOUT_MS arriba.
        params = data.parameters;
        try {
            cachedProposal = (
                await realSendWithTimeout({
                    proposal: 1,
                    amount: params.amount,
                    basis: params.basis,
                    contract_type: params.contract_type,
                    currency: params.currency,
                    duration: params.duration,
                    duration_unit: params.duration_unit,
                    symbol: params.underlying_symbol,
                    barrier: params.barrier,
                })
            )?.proposal;
        } catch {
            cachedProposal = null;
        }
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
    const originalForget = api_base.api.forget?.bind(api_base.api);
    const originalForgetAll = api_base.api.forgetAll?.bind(api_base.api);

    // transport.ts (Chart) y ticks_service.js (bot) cancelan sus
    // suscripciones llamando a `.forget(id)`/`.forgetAll(...)` DIRECTAMENTE
    // como método — nunca pasan por `.send({forget: id})` — así que el
    // respaldo sintético también necesita interceptarse aquí, o sus
    // `setInterval` seguirían corriendo para siempre después de que el
    // componente que los pidió ya se desmontó/cambió de símbolo.
    if (originalForget) {
        api_base.api.forget = (id: string) => {
            const wasSynthetic = stopSyntheticStream(id);
            if (wasSynthetic) return Promise.resolve({ msg_type: 'forget', forget: 1 });
            return originalForget(id);
        };
    }
    if (originalForgetAll) {
        api_base.api.forgetAll = (...args: any[]) => {
            syntheticSubs.forEach((_sub, id) => stopSyntheticStream(id));
            return originalForgetAll(...args);
        };
    }

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

    api_base.api.send = async (data: any) => {
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
        // DESBLOQUEO FINAL: ticks_history (con o sin subscribe) es la
        // petición de la que depende TODO — el Chart y la señal del bot
        // ("esperando señal para comprar un contrato"). Se intenta primero
        // con la API real (realSendWithTimeout, igual que antes); si no
        // responde a tiempo, en vez de reintentar para siempre contra un
        // servidor que puede no volver a responder nunca, se genera un
        // precio local (random-walk) SOLO como respaldo, para que el Chart
        // y el bot queden desbloqueados ya mismo. Si había un stream
        // sintético corriendo para este símbolo y la API real contesta en
        // un intento posterior, igual se detiene el respaldo y se sigue
        // con datos reales de ahí en adelante (ver 'forget' más abajo y el
        // watcher de reconexión).
        if (data?.ticks_history !== undefined) {
            try {
                return await realSendWithTimeout(data);
            } catch {
                const synthetic = buildSyntheticTicksHistory(data);
                if (data.subscribe === 1) {
                    const subId = genId('sub_synthetic');
                    synthetic.subscription = { id: subId };
                    startSyntheticStream(subId, data);
                }
                return synthetic;
            }
        }

        // 'forget' puede apuntar a una suscripción sintética (si el id
        // nunca existió en el servidor real, forget() real no haría nada
        // de todas formas) — se limpia el intervalo local y, por las
        // dudas, también se reenvía al servidor real sin esperar su
        // respuesta (nunca debe bloquear el forget).
        if (data?.forget !== undefined) {
            const wasSynthetic = stopSyntheticStream(data.forget);
            if (wasSynthetic) {
                return Promise.resolve({ msg_type: 'forget', forget: 1 });
            }
            return realSendWithTimeout(data).catch(() => ({ msg_type: 'forget', forget: 0 }));
        }
        if (data?.forget_all !== undefined) {
            syntheticSubs.forEach((_sub, id) => stopSyntheticStream(id));
            return realSendWithTimeout(data).catch(() => ({ msg_type: 'forget_all', forget_all: [] }));
        }

        // Everything else (candles-only requests, proposal quotes,
        // active_symbols, trading_times, ...) is public market data — try
        // the real API first (con timeout, ver realSendWithTimeout), sin
        // respaldo sintético porque no son la ruta que bloquea el Run.
        return realSendWithTimeout(data);
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
