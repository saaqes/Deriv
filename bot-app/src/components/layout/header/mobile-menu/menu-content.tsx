import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { LegacyChevronRight1pxIcon } from '@deriv/quill-icons/Legacy';
import { MenuItem, Text, useDevice } from '@deriv-com/ui';
import useMobileMenuConfig from './use-mobile-menu-config';

type TMenuContentProps = {
    enableThemeToggle?: boolean;
    onOpenSubmenu?: (submenu: string) => void;
    onOpenTutorials?: () => void;
    onOpenLanguage?: () => void;
    enableLanguageSettings?: boolean;
    onLogout?: () => void;
};

const MenuContent = observer(
    ({
        enableThemeToggle = true,
        onOpenSubmenu,
        onOpenTutorials,
        onOpenLanguage,
        enableLanguageSettings = true,
        onLogout,
    }: TMenuContentProps) => {
        const { isDesktop } = useDevice();
        const { client, dashboard } = useStore();
        const textSize = isDesktop ? 'sm' : 'md';
        const { config } = useMobileMenuConfig(
            client,
            onLogout,
            enableThemeToggle,
            onOpenTutorials,
            onOpenLanguage,
            enableLanguageSettings
        );

        return (
            <div className='mobile-menu__content'>
                <div className='mobile-menu__content__items'>
                    {config.map((section, index) => {
                        const removeBorderBottom = section.items.find(({ removeBorderBottom }) => removeBorderBottom);
                        const isLastSection = index === config.length - 1;
                        const isTutorialsSection = section.items.some(
                            item => item.onClick === onOpenTutorials && onOpenTutorials
                        );
                        const isTutorialsActive = isTutorialsSection && dashboard?.active_tab === DBOT_TABS.TUTORIAL;

                        return (
                            <div
                                className={clsx('mobile-menu__content__items--padding', {
                                    'mobile-menu__content__items--bottom-border': !removeBorderBottom && !isLastSection,
                                })}
                                data-testid='dt_menu_item'
                                key={index}
                            >
                                {section.title && (
                                    <Text
                                        className='mobile-menu__content__items__section-title'
                                        size={textSize}
                                        weight='bold'
                                    >
                                        {section.title}
                                    </Text>
                                )}
                                {section.items.map(
                                    (
                                        {
                                            LeftComponent,
                                            RightComponent,
                                            as,
                                            href,
                                            label,
                                            onClick,
                                            submenu,
                                            target,
                                            isActive,
                                        },
                                        itemIndex
                                    ) => {
                                        const is_deriv_logo = label === 'Deriv.com';
                                        const isRowActive = isActive || (onClick === onOpenTutorials && isTutorialsActive);
                                        if (as === 'a') {
                                            return (
                                                <MenuItem
                                                    as='a'
                                                    className={clsx('mobile-menu__content__items__item', {
                                                        'mobile-menu__content__items__icons': !is_deriv_logo,
                                                        'mobile-menu__content__items__item--active': isRowActive,
                                                    })}
                                                    disableHover
                                                    href={href}
                                                    key={`${index}-${itemIndex}-${label}`}
                                                    leftComponent={
                                                        <LeftComponent
                                                            className='mobile-menu__content__items--right-margin'
                                                            height={16}
                                                            width={16}
                                                        />
                                                    }
                                                    target={target}
                                                >
                                                    <Text size={textSize}>{label}</Text>
                                                </MenuItem>
                                            );
                                        }
                                        return (
                                            <MenuItem
                                                as='button'
                                                className={clsx('mobile-menu__content__items__item', {
                                                    'mobile-menu__content__items__icons': !is_deriv_logo,
                                                    'mobile-menu__content__items__item--active': isRowActive,
                                                })}
                                                disableHover
                                                key={`${index}-${itemIndex}-${label}`}
                                                leftComponent={
                                                    <LeftComponent
                                                        className='mobile-menu__content__items--right-margin'
                                                        iconSize='xs'
                                                    />
                                                }
                                                onClick={() => {
                                                    if (submenu && onOpenSubmenu) {
                                                        onOpenSubmenu(submenu);
                                                    } else if (onClick) {
                                                        onClick();
                                                    }
                                                }}
                                                rightComponent={
                                                    submenu ? (
                                                        <LegacyChevronRight1pxIcon
                                                            className='mobile-menu__content__items--chevron'
                                                            iconSize='xs'
                                                        />
                                                    ) : (
                                                        RightComponent
                                                    )
                                                }
                                            >
                                                <Text size={textSize}>{label}</Text>
                                            </MenuItem>
                                        );
                                    }
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
);

export default MenuContent;
