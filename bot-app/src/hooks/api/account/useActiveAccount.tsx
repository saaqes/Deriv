import { useMemo } from 'react';
/* [AI] - Analytics removed - utility functions moved to @/utils/account-helpers */
import { isVirtualAccount } from '@/utils/account-helpers';
/* [/AI] */
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { isMockAccountId } from '@/external/deriv-core/auth/mock-login';
import { formatConfiguredBalance } from '@/external/deriv-core/trading/display-balance';
import { useApiBase } from '@/hooks/useApiBase';
import { useConfiguredBalance, useConfiguredRealBalance } from '@/hooks/useConfiguredBalance';
import { Balance } from '@deriv/api-types';

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({
    allBalanceData,
    directBalance,
}: {
    allBalanceData: Balance | null;
    directBalance?: string;
}) => {
    const { accountList, activeLoginid } = useApiBase();
    // DEMO-only cosmetic override (see display-balance.ts). `null` when
    // nothing has been configured from site-standalone, in which case the
    // real balance is shown as before.
    const configuredBalance = useConfiguredBalance();
    // Same idea, for the mock "Real" account (CR0000001) instead.
    const configuredRealBalance = useConfiguredRealBalance();

    const activeAccount = useMemo(
        () => accountList?.find(account => account.loginid === activeLoginid),
        [activeLoginid, accountList]
    );

    const currentBalanceData = allBalanceData?.accounts?.[activeAccount?.loginid ?? ''];

    const modifiedAccount = useMemo(() => {
        if (!activeAccount) return undefined;

        // Use centralized utility to determine if demo account
        const isVirtual = isVirtualAccount(activeAccount.loginid);

        // realBalance: always the actual balance reported by Deriv over the
        // WebSocket connection (or the last known value while a fresh
        // balance update is in flight). Trading/order logic elsewhere reads
        // this same data directly from the client store / api_base and is
        // completely untouched by anything below.
        const realBalance = currentBalanceData?.balance
            ? addComma(currentBalanceData.balance.toFixed(getDecimalPlaces(currentBalanceData.currency)))
            : directBalance
              ? addComma(parseFloat(directBalance).toFixed(getDecimalPlaces(activeAccount.currency)))
              : addComma(parseFloat('0').toFixed(getDecimalPlaces(activeAccount.currency)));

        // displayBalance: what the UI should render. Diverges from
        // realBalance only for one of this simulator's two MOCK accounts
        // (see mock-login.ts) that has a configured balance set from
        // home.html — a genuine real Deriv account (real OAuth login,
        // not `isMockAccountId`) always shows realBalance, no exceptions.
        const isMockAccount = isMockAccountId(activeAccount.loginid);
        const configuredValue = isVirtual ? configuredBalance : configuredRealBalance;
        const isSimulatedDisplay = isMockAccount && configuredValue !== null;
        const displayBalance = isSimulatedDisplay
            ? formatConfiguredBalance(configuredValue as number, activeAccount.currency)
            : `${realBalance} ${getCurrencyDisplayCode(activeAccount.currency)}`.trim();

        return {
            ...activeAccount,
            balance: realBalance,
            displayBalance,
            isSimulatedDisplay,
            currencyLabel: isVirtual ? 'Demo' : activeAccount?.currency,
            icon: <CurrencyIcon currency={activeAccount?.currency?.toLowerCase()} isVirtual={isVirtual} />,
            isVirtual: isVirtual,
            isActive: activeAccount?.loginid === activeLoginid,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount, activeLoginid, allBalanceData, directBalance, configuredBalance, configuredRealBalance]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
