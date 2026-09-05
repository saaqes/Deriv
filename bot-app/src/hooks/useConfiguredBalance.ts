import { useEffect, useState } from 'react';
import {
    getConfiguredBalance,
    getConfiguredRealBalance,
    subscribeToConfiguredBalance,
    subscribeToConfiguredRealBalance,
} from '@/external/deriv-core/trading/display-balance';

/** Shared implementation behind useConfiguredBalance / useConfiguredRealBalance. */
function useConfiguredBalanceChannel(
    getValue: () => number | null,
    subscribe: (callback: (value: number | null) => void) => () => void
): number | null {
    const [value, setValue] = useState<number | null>(() => getValue());

    useEffect(() => {
        // Re-sync on mount in case the value changed between initial render
        // and effect setup (e.g. captureConfiguredBalanceFromUrl running in
        // main.tsx before this component mounted).
        const resync = () => setValue(getValue());
        resync();

        const unsubscribe = subscribe(setValue);

        // Safety net for cross-tab sync (home.html in one tab, #chart in
        // another): the native 'storage' event should already cover this,
        // but re-checking on focus/visibility guarantees the balance set in
        // home.html shows up here even if that event is ever missed/delayed.
        const handleVisible = () => {
            if (document.visibilityState === 'visible') resync();
        };
        window.addEventListener('focus', resync);
        document.addEventListener('visibilitychange', handleVisible);

        return () => {
            unsubscribe();
            window.removeEventListener('focus', resync);
            document.removeEventListener('visibilitychange', handleVisible);
        };
    }, []);

    return value;
}

/**
 * Reactive read-only view of the DEMO-only configured/display balance
 * (see `display-balance.ts`). Returns `null` when nothing has been
 * configured, in which case callers should keep showing the real balance.
 */
export function useConfiguredBalance(): number | null {
    return useConfiguredBalanceChannel(getConfiguredBalance, subscribeToConfiguredBalance);
}

/**
 * Same as `useConfiguredBalance`, but for the mock "Real" account
 * (CR0000001 in mock-login.ts) — home.html's "Cuenta Virtual" panel.
 */
export function useConfiguredRealBalance(): number | null {
    return useConfiguredBalanceChannel(getConfiguredRealBalance, subscribeToConfiguredRealBalance);
}

export default useConfiguredBalance;
