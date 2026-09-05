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
 * proposal price quotes, and active_symbols still go to Deriv's real API —
 * those endpoints don't need a token, so market data stays real. No request
 * that could touch a real account (buy/sell/balance) ever reaches Deriv.
 *
 * Settlement: every contract, of any type, resolves with a fixed 90% win /
 * 10% loss probability — not based on real market movement. The exit price
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
    if (!realSend || !symbol) return undefined;
    try {
        const res = await realSend({ ticks_history: symbol, count: 1, end: 'latest', style: 'ticks' });
        const prices = res?.history?.prices;
        if (Array.isArray(prices) && prices.length) return Number(prices[prices.length - 1]);
    } catch {
        // Market data unavailable (closed market, bad symbol, etc.) — the
        // caller falls back to the probability-weighted settlement.
    }
    return undefined;
}

function lastDigit(price: number, pipSize = 2): number {
    const str = Number(price).toFixed(pipSize);
    return Number(str[str.length - 1]);
}

/**
 * Real-market outcome for the contract types bot strategies use most often
 * (Rise/Fall, Digits). Returns `undefined` when the contract type isn't
 * modeled here (e.g. touch/no-touch, Asians, reset calls) or when a real
 * exit price couldn't be fetched — the caller falls back to the
 * probability-weighted settlement in that case, same as before.
 */
function resolveRealOutcome(c: Record<string, any>, exit: number | undefined): boolean | undefined {
    if (exit === undefined) return undefined;
    const entry = Number(c.entry_tick);
    if (!Number.isFinite(entry)) return undefined;

    const pip_size = api_base?.pip_sizes?.[c.underlying] ?? 2;
    const barrier = c.barrier !== undefined && c.barrier !== null ? Number(c.barrier) : undefined;
    const digit = lastDigit(exit, pip_size);

    switch (c.contract_type) {
        case 'CALL':
            return exit > entry;
        case 'PUT':
            return exit < entry;
        case 'DIGITEVEN':
            return digit % 2 === 0;
        case 'DIGITODD':
            return digit % 2 !== 0;
        case 'DIGITMATCH':
            return barrier !== undefined ? digit === barrier : undefined;
        case 'DIGITDIFF':
            return barrier !== undefined ? digit !== barrier : undefined;
        case 'DIGITOVER':
            return barrier !== undefined ? digit > barrier : undefined;
        case 'DIGITUNDER':
            return barrier !== undefined ? digit < barrier : undefined;
        default:
            return undefined;
    }
}

/** Fallback fixed win rate, used only when a contract type isn't modeled
 * against real market movement above (see resolveRealOutcome). */
const WIN_PROBABILITY = 0.9;
const rollWin = (): boolean => Math.random() < WIN_PROBABILITY;

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

    // Fetch the real exit price and use it to determine the actual outcome
    // (Rise/Fall, Digits) based on genuine market movement. Only falls back
    // to the fixed 90%/10% probability for contract types not modeled in
    // resolveRealOutcome, or if real market data couldn't be fetched.
    const exit = await fetchRealSpot(c.underlying);
    const real_outcome = resolveRealOutcome(c, exit);
    const won = real_outcome !== undefined ? real_outcome : rollWin();

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
        params = data.parameters;
        try {
            cachedProposal = (
                await realSend?.({
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

    // Early/manual sell — based on real market movement since entry rather
    // than a coin flip, same as the scheduled settlement in
    // settleContract(). Multipliers get a proportional mark-to-market P/L;
    // everything else reuses resolveRealOutcome's win/lose rule.
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
        const real_outcome = resolveRealOutcome(c, exit);
        const won = real_outcome !== undefined ? real_outcome : rollWin();
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

        // Everything else (ticks, proposal quotes, active_symbols, forget,
        // ...) is public market data — send it to the real API untouched.
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
