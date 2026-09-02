/**
 * Simulated login.
 *
 * Skips the real Deriv OAuth redirect entirely and fills the same
 * observable streams that api-base.ts fills after a real `authorize` call,
 * so the header renders the account switcher (Real / Demo buttons, like the
 * screenshot) immediately, with no round trip to oauth.deriv.com.
 *
 * IMPORTANT — what this does NOT do:
 * It does not create a real access token or an authorized WebSocket
 * session. Anything that actually talks to Deriv's API (running a bot,
 * loading real chart data behind auth, placing a trade, transfers, etc.)
 * will still fail or behave oddly, because there is no genuine session
 * behind the fake buttons. This app is an educational simulator — see the
 * "no es Deriv, no gestiona dinero real" disclaimer in the standalone
 * pages — so the simulated login runs in every build, not just dev.
 */
import { observer as globalObserver } from '@/external/bot-skeleton';
import {
    CONNECTION_STATUS,
    connectionStatus$,
    isAuthorized$,
    isAuthorizing$,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import type { TAccount } from '@/types/api-types';

const MOCK_REAL_ACCOUNT: TAccount = {
    loginid: 'CR0000001',
    currency: 'USD',
    balance: 500,
    is_virtual: 0,
};

const MOCK_DEMO_ACCOUNT: TAccount = {
    loginid: 'VRTC0000001',
    currency: 'USD',
    balance: 9988.4,
    is_virtual: 1,
};

// Mutable — balances actually move as the fake broker settles trades.
const mockAccounts: Record<string, TAccount> = {
    [MOCK_REAL_ACCOUNT.loginid]: { ...MOCK_REAL_ACCOUNT },
    [MOCK_DEMO_ACCOUNT.loginid]: { ...MOCK_DEMO_ACCOUNT },
};
let activeMockLoginId: string | null = null;

/** Always true — this app simulates login instead of the real Deriv OAuth. */
export const isMockLoginAvailable = (): boolean => true;

export const isMockAccountId = (loginid: string): boolean => loginid in mockAccounts;

/** Current fake account (balance, currency, loginid), or null if logged out. */
export function getActiveMockAccount(): TAccount | null {
    return activeMockLoginId ? mockAccounts[activeMockLoginId] : null;
}

function pushAuthState(): void {
    const active = getActiveMockAccount();
    if (!active) return;
    const accountList = Object.values(mockAccounts);

    setAccountList(accountList);
    setAuthData({
        balance: active.balance,
        currency: active.currency,
        loginid: active.loginid,
        is_virtual: active.is_virtual,
        account_list: accountList,
        email: 'dev@example.com',
        fullname: 'Dev Tester',
        token: 'mock-token-not-a-real-session',
    });

    // Mirrors the 'api.authorize' event api-base.ts emits after a real
    // authorize response, so client-store (balance, currency, loginid,
    // is_logged_in) updates the same way it would for a real login.
    globalObserver.emit('api.authorize', {
        account_list: accountList,
        current_account: {
            loginid: active.loginid,
            currency: active.currency,
            is_virtual: active.is_virtual,
            balance: active.balance,
        },
    });
}

/**
 * Activates the fake "logged in" UI state with a Real + Demo account,
 * matching the account switcher screenshot. Call again with the other
 * `startOn` value to flip which one is active.
 */
export function initiateMockLogin(startOn: 'real' | 'demo' = 'real'): void {
    if (!isMockLoginAvailable()) {
        console.warn('[mock-login] Ignored — only available in a dev build.');
        return;
    }

    activeMockLoginId = startOn === 'demo' ? MOCK_DEMO_ACCOUNT.loginid : MOCK_REAL_ACCOUNT.loginid;

    setConnectionStatus(CONNECTION_STATUS.OPENED);
    pushAuthState();
    setIsAuthorized(true);
    setIsAuthorizing(false);
    localStorage.setItem('active_loginid', activeMockLoginId);

    console.info(
        '[mock-login] Fake session active (no real Deriv auth). Call clearMockLogin() from the console to reset.'
    );
}

/** Reverts to the logged-out state. */
export function clearMockLogin(): void {
    activeMockLoginId = null;
    setAccountList([]);
    setAuthData(null);
    setIsAuthorized(false);
    setIsAuthorizing(false);
    localStorage.removeItem('active_loginid');
}

/**
 * Switches the active mock account (Real <-> Demo) without touching any
 * real WebSocket — just flips which of the two fake accounts is "active"
 * and re-emits the same events a real account switch would.
 */
export function switchMockAccount(loginid: string): void {
    if (!isMockLoginAvailable() || !mockAccounts[loginid]) return;
    activeMockLoginId = loginid;
    pushAuthState();
}

/**
 * Adjusts one fake account's balance (used by the fake broker after a buy
 * or a settlement) and, if it's the active account, pushes the update to
 * the UI the same way a real balance change would.
 */
export function applyMockBalanceDelta(loginid: string, delta: number): void {
    const acc = mockAccounts[loginid];
    if (!acc) return;
    acc.balance = Math.max(0, Math.round((acc.balance + delta) * 100) / 100);
    if (loginid === activeMockLoginId) pushAuthState();
}

if (typeof window !== 'undefined' && isMockLoginAvailable()) {
    // Handy console access during dev: mockLogin(), mockLogin('demo'), clearMockLogin()
    (window as unknown as Record<string, unknown>).mockLogin = initiateMockLogin;
    (window as unknown as Record<string, unknown>).clearMockLogin = clearMockLogin;

    // Keep "Run" from ever getting interrupted: while a mock account is
    // active, force the connection/auth status back to "always on" the
    // instant anything (e.g. the real, unauthenticated api_base.init()
    // running in the background) tries to flip it off.
    connectionStatus$.subscribe(status => {
        if (activeMockLoginId && status !== CONNECTION_STATUS.OPENED) setConnectionStatus(CONNECTION_STATUS.OPENED);
    });
    isAuthorized$.subscribe(isAuthorized => {
        if (activeMockLoginId && !isAuthorized) setIsAuthorized(true);
    });
    isAuthorizing$.subscribe(isAuthorizing => {
        if (activeMockLoginId && isAuthorizing) setIsAuthorizing(false);
    });
}
