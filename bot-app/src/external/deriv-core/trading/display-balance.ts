/**
 * Display balance — DEMO-ONLY cosmetic balance override.
 * -------------------------------------------------------
 * This module NEVER touches real trading. It only decides what *number*
 * is shown next to a DEMO/virtual account in the header, so it can match
 * a value the user configured on the TradeLab Sim site (site-standalone
 * `index.html`, "Notifications" balance manager).
 *
 * Hard boundaries (do not weaken these):
 *  - This value is only ever read by presentation code (see
 *    `useActiveAccount`/`AccountSwitcher`). It is never sent to Deriv's
 *    API and never used by the trading engine, buy/sell handlers, or
 *    balance checks (those all keep reading the real balance from
 *    `api_base` / the client store, untouched).
 *  - It is only applied when the *active* account is a demo/virtual
 *    account (see `isVirtualAccount` in `account-helpers.ts`). Real
 *    accounts always show their real Deriv balance, no exceptions.
 *  - It is not sent by bot-app to Deriv, nor written back to the real
 *    account — it is purely a local, cosmetic "what should the demo
 *    balance display as" preference.
 *
 * Handoff from site-standalone:
 * `site-standalone` and `bot-app` are typically deployed on two
 * different origins (e.g. two separate Render services), so a plain
 * `localStorage` value set on one origin is not visible on the other.
 * To bridge that gap without standing up a backend, the configured
 * balance is passed as a short-lived URL query parameter
 * (`?tlbal=10000`) when the user clicks through from `index.html` /
 * `options.html` to `BOT_APP_URL`. `captureConfiguredBalanceFromUrl()`
 * reads it once on load, validates it, stores it in bot-app's own
 * localStorage (so it survives reloads/navigation within bot-app), and
 * strips it from the address bar.
 *
 * If both apps are ever deployed on the same origin (or on subdomains
 * with a shared parent domain + cookie), the URL handoff becomes
 * unnecessary — bot-app will also read a same-origin `configuredBalance`
 * key directly (see CONFIGURED_BALANCE_LEGACY_KEY below) and react to
 * `storage` events the same way it does for its own key.
 */

export const CONFIGURED_BALANCE_STORAGE_KEY = 'tradelab_configured_balance';
// Key name used by site-standalone's own localStorage (see sim-shared.js /
// index.html). Only reachable when both apps share an origin; harmless to
// check for even when they don't (the read simply comes back empty).
const CONFIGURED_BALANCE_LEGACY_KEY = 'configuredBalance';
export const CONFIGURED_BALANCE_URL_PARAM = 'tlbal';
export const CONFIGURED_BALANCE_EVENT = 'tradelab:configured-balance-updated';

// Second, independent channel for the mock/simulated "Real" account
// (CR0000001 in mock-login.ts — NOT a genuine Deriv real-money account).
// Mirrors home.html's "Cuenta Virtual" panel (TradeLabSim's `virtual`
// balance) the same way CONFIGURED_BALANCE_LEGACY_KEY mirrors "Cuenta
// Demo". Kept fully separate from the demo channel above so the two
// account cards in home.html can be set to different numbers.
const CONFIGURED_REAL_BALANCE_LEGACY_KEY = 'configuredRealBalance';
export const CONFIGURED_REAL_BALANCE_EVENT = 'tradelab:configured-real-balance-updated';

type StoredConfiguredBalance = {
    value: number;
    updatedAt: number;
};

/**
 * Validates a raw balance value coming from a query param, localStorage,
 * or user input: must be a finite, non-negative number. Rejects NaN,
 * undefined, negative numbers, and non-numeric strings.
 */
export function parseConfiguredBalance(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) return null;
    return num;
}

/** Reads and validates the currently stored configured (demo/display) balance. */
export function getConfiguredBalance(): number | null {
    // Same-origin key first: home.html / options.html (sim-shared.js) write
    // this every time the user changes the "Cuenta Demo" balance, and now
    // that they're served by bot-app itself (same origin), this is always
    // the freshest value. Checking it first means a one-off value captured
    // long ago from the old cross-origin `?tlbal=` handoff (below) can never
    // permanently shadow a newer balance set from home.html.
    try {
        const legacy = localStorage.getItem(CONFIGURED_BALANCE_LEGACY_KEY);
        if (legacy !== null) {
            const valid = parseConfiguredBalance(legacy);
            if (valid !== null) return valid;
        }
    } catch {
        // Corrupt/inaccessible storage — fall through to the URL-handoff key.
    }

    // Fallback: value captured from a `?tlbal=` URL param (used only when
    // site-standalone is deployed on a different origin than bot-app).
    try {
        const raw = localStorage.getItem(CONFIGURED_BALANCE_STORAGE_KEY);
        if (raw) {
            const parsed: StoredConfiguredBalance = JSON.parse(raw);
            return parseConfiguredBalance(parsed?.value);
        }
    } catch {
        // Corrupt/inaccessible storage.
    }

    return null;
}

/**
 * Same as `getConfiguredBalance`, but for the mock "Real" account
 * (CR0000001) instead of the mock "Demo" account. Reads the balance
 * home.html's "Cuenta Virtual" panel keeps in `configuredRealBalance`.
 */
export function getConfiguredRealBalance(): number | null {
    try {
        const legacy = localStorage.getItem(CONFIGURED_REAL_BALANCE_LEGACY_KEY);
        if (legacy !== null) {
            return parseConfiguredBalance(legacy);
        }
    } catch {
        // Corrupt/inaccessible storage.
    }
    return null;
}

/**
 * Persists a validated configured balance to bot-app's own localStorage
 * and notifies any listeners in the current tab. Returns false (and
 * stores nothing) if the value fails validation.
 */
export function setConfiguredBalance(rawValue: unknown): boolean {
    const value = parseConfiguredBalance(rawValue);
    if (value === null) return false;

    const payload: StoredConfiguredBalance = { value, updatedAt: Date.now() };
    try {
        localStorage.setItem(CONFIGURED_BALANCE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        return false;
    }
    window.dispatchEvent(new CustomEvent(CONFIGURED_BALANCE_EVENT, { detail: value }));
    return true;
}

/**
 * One-time bootstrap: if the current URL carries a `tlbal` query param
 * (set by site-standalone when linking to BOT_APP_URL), validate it,
 * persist it as the configured balance, and remove it from the address
 * bar so it isn't re-applied or shared accidentally (bookmarks, screen
 * shares, etc). Safe to call unconditionally on every app load.
 */
export function captureConfiguredBalanceFromUrl(): void {
    try {
        const url = new URL(window.location.href);
        const raw = url.searchParams.get(CONFIGURED_BALANCE_URL_PARAM);
        if (raw === null) return;

        setConfiguredBalance(raw);

        url.searchParams.delete(CONFIGURED_BALANCE_URL_PARAM);
        window.history.replaceState({}, document.title, url.toString());
    } catch {
        // Non-browser environment or malformed URL — nothing to capture.
    }
}

/**
 * Subscribes to configured-balance changes: same-tab updates (custom
 * event, fired by `setConfiguredBalance`) and cross-tab/same-origin
 * updates (the native `storage` event, e.g. if site-standalone and
 * bot-app ever share an origin). Returns an unsubscribe function.
 */
export function subscribeToConfiguredBalance(callback: (value: number | null) => void): () => void {
    const handleCustomEvent = () => callback(getConfiguredBalance());
    const handleStorageEvent = (event: StorageEvent) => {
        if (event.key === CONFIGURED_BALANCE_STORAGE_KEY || event.key === CONFIGURED_BALANCE_LEGACY_KEY) {
            callback(getConfiguredBalance());
        }
    };

    window.addEventListener(CONFIGURED_BALANCE_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
        window.removeEventListener(CONFIGURED_BALANCE_EVENT, handleCustomEvent);
        window.removeEventListener('storage', handleStorageEvent);
    };
}

/**
 * Same as `subscribeToConfiguredBalance`, but for the mock "Real" account
 * channel. Cross-tab sync (home.html "Cuenta Virtual" panel in one tab,
 * #chart in another) via the native `storage` event.
 */
export function subscribeToConfiguredRealBalance(callback: (value: number | null) => void): () => void {
    const handleStorageEvent = (event: StorageEvent) => {
        if (event.key === CONFIGURED_REAL_BALANCE_LEGACY_KEY) {
            callback(getConfiguredRealBalance());
        }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
        window.removeEventListener('storage', handleStorageEvent);
    };
}

/** Formats a configured/display balance as currency, e.g. 10000 -> "$10,000.00". */
export function formatConfiguredBalance(value: number, currency = 'USD'): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // Unknown/invalid currency code — fall back to a plain number.
        return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}
