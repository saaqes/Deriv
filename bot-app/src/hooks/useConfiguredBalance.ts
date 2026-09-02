import { useEffect, useState } from 'react';
import { getConfiguredBalance, subscribeToConfiguredBalance } from '@/external/deriv-core/trading/display-balance';

/**
 * Reactive read-only view of the DEMO-only configured/display balance
 * (see `display-balance.ts`). Returns `null` when nothing has been
 * configured, in which case callers should keep showing the real balance.
 */
export function useConfiguredBalance(): number | null {
    const [configuredBalance, setConfiguredBalanceState] = useState<number | null>(() => getConfiguredBalance());

    useEffect(() => {
        // Re-sync on mount in case the value changed between initial render
        // and effect setup (e.g. captureConfiguredBalanceFromUrl running in
        // main.tsx before this component mounted).
        setConfiguredBalanceState(getConfiguredBalance());
        return subscribeToConfiguredBalance(setConfiguredBalanceState);
    }, []);

    return configuredBalance;
}

export default useConfiguredBalance;
