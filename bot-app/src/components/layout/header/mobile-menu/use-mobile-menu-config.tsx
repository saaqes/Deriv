import { ComponentProps, ReactNode, useMemo } from 'react';
import { standalone_routes } from '@/components/shared';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import RootStore from '@/stores/root-store';
import { generateUrlWithRedirect } from '@/utils/url-redirect-utils';
import {
    LegacyGuide1pxIcon,
    LegacyLanguage1pxIcon,
    LegacyLogout1pxIcon,
    LegacyOpenPositionIcon,
    LegacyProfitTableIcon,
    LegacyStatementIcon,
    LegacyTheme1pxIcon,
} from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';

export type TSubmenuSection = 'accountSettings' | 'cashier' | 'reports';

type TMenuConfigItem = {
    LeftComponent: React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    submenu?: TSubmenuSection;
    target?: ComponentProps<'a'>['target'];
    isActive?: boolean;
};

export type TMenuSection = {
    title?: string;
    items: TMenuConfigItem[];
};

const useMobileMenuConfig = (
    client?: RootStore['client'],
    onLogout?: () => void,
    enableThemeToggle: boolean = true,
    onOpenTutorials?: () => void,
    onOpenLanguage?: () => void,
    enableLanguageSettings: boolean = true
) => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    const menuConfig = useMemo((): TMenuSection[] => {
        return [
            {
                title: localize('Guide'),
                items: onOpenTutorials
                    ? [
                          {
                              as: 'button',
                              label: localize('Tutorials'),
                              LeftComponent: LegacyGuide1pxIcon,
                              onClick: onOpenTutorials,
                          },
                      ]
                    : [],
            },
            {
                title: localize('Reports'),
                items: [
                    {
                        as: 'a',
                        label: localize('Open positions'),
                        LeftComponent: LegacyOpenPositionIcon,
                        href: generateUrlWithRedirect(standalone_routes.positions),
                    },
                    {
                        as: 'a',
                        label: localize('Trade table'),
                        LeftComponent: LegacyProfitTableIcon,
                        href: generateUrlWithRedirect(standalone_routes.profit),
                    },
                    {
                        as: 'a',
                        label: localize('Statement'),
                        LeftComponent: LegacyStatementIcon,
                        href: generateUrlWithRedirect(standalone_routes.statement),
                    },
                ],
            },
            {
                title: localize('Settings'),
                items: [
                    enableLanguageSettings &&
                        onOpenLanguage && {
                            as: 'button',
                            label: localize('Language'),
                            LeftComponent: LegacyLanguage1pxIcon,
                            onClick: onOpenLanguage,
                        },
                    enableThemeToggle && {
                        as: 'button',
                        label: localize('Dark theme'),
                        LeftComponent: LegacyTheme1pxIcon,
                        RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
                    },
                ].filter(Boolean) as TMenuConfigItem[],
            },
            {
                items: [
                    client?.is_logged_in &&
                        onLogout && {
                            as: 'button',
                            label: localize('Log out'),
                            LeftComponent: LegacyLogout1pxIcon,
                            onClick: onLogout,
                            removeBorderBottom: true,
                        },
                ].filter(Boolean) as TMenuConfigItem[],
            },
        ].filter(section => section.items.length > 0) as TMenuSection[];
    }, [
        client,
        onLogout,
        is_dark_mode_on,
        toggleTheme,
        localize,
        enableThemeToggle,
        enableLanguageSettings,
        onOpenTutorials,
        onOpenLanguage,
    ]);

    const hasMenuItems = menuConfig.some(section => section.items.length > 0);

    return {
        config: menuConfig,
        hasMenuItems,
    };
};

export default useMobileMenuConfig;
