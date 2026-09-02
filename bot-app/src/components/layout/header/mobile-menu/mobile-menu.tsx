// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
// Updated to use brand configuration for mobile menu elements visibility
// Controls language settings and theme toggle via brand.config.json
import { useState } from 'react';
import classNames from 'classnames';
import brandConfig from '@/../brand.config.json';
import { standalone_routes } from '@/components/shared';
import { DBOT_TABS } from '@/constants/bot-contents';
import useModalManager from '@/hooks/useModalManager';
// [AI] Import useStore to check if menu has items
import { useStore } from '@/hooks/useStore';
// [/AI]
import { getActiveTabUrl } from '@/utils/getActiveTabUrl';
import { FILTERED_LANGUAGES } from '@/utils/languages';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyHomeNewIcon, LegacyMenuHamburger1pxIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { Drawer, MobileLanguagesDrawer, useDevice } from '@deriv-com/ui';
import NetworkStatus from './../../footer/NetworkStatus';
import ServerTime from './../../footer/ServerTime';
import BackButton from './back-button';
import MenuContent from './menu-content';
import MenuHeader from './menu-header';
// [AI] Import hook to check if menu has items
import useMobileMenuConfig from './use-mobile-menu-config';
// [/AI]
import './mobile-menu.scss';

type TMobileMenuProps = {
    onLogout?: () => void;
};

const MobileMenu = ({ onLogout }: TMobileMenuProps) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const { currentLang = 'EN', localize, switchLanguage } = useTranslations();
    const { hideModal, isModalOpenFor, showModal } = useModalManager();
    const { isDesktop } = useDevice();
    // [AI] Get client from store to check menu items
    const { client, dashboard } = useStore() ?? {};
    // [/AI]
    const { active_tab, setActiveTab } = dashboard ?? {};

    // Get mobile menu configuration from brand.config.json
    const enableLanguageSettings = brandConfig.platform.footer?.enable_language_settings ?? true;
    const enableThemeToggle = brandConfig.platform.footer?.enable_theme_toggle ?? true;

    // Check if menu has any items to determine if mobile menu should be shown
    const { hasMenuItems } = useMobileMenuConfig(
        client,
        onLogout,
        enableThemeToggle,
        () => {},
        () => {},
        enableLanguageSettings
    );

    const openDrawer = () => setIsDrawerOpen(true);
    const closeDrawer = () => {
        setIsDrawerOpen(false);
        // Clear the language modal query param so it doesn't linger in the URL
        // (and re-open the language view) when the drawer is closed via the
        // close button or by clicking outside.
        if (isLanguageSettingVisible) hideModal();
    };

    const openLanguageSetting = () => showModal('MobileLanguagesDrawer');
    const isLanguageSettingVisible = Boolean(isModalOpenFor('MobileLanguagesDrawer'));

    const goToTab = (tab_index: number) => {
        if (isDrawerOpen) closeDrawer();
        setActiveTab?.(tab_index);
    };
    const openTutorials = () => goToTab(DBOT_TABS.TUTORIAL);

    if (isDesktop) return null;

    return (
        <>
            {/* Bottom navigation bar: Home, Dashboard, Bot builder, Chart, Menu */}
            <nav className='mobile-bottom-nav'>
                <a
                    className='mobile-bottom-nav__item'
                    href={standalone_routes.traders_hub}
                    rel='noopener noreferrer'
                >
                    <LegacyHomeNewIcon iconSize='xs' fill='var(--text-general)' />
                    <span>{localize('Home')}</span>
                </a>
                <button
                    className={classNames('mobile-bottom-nav__item', {
                        'mobile-bottom-nav__item--active': !isDrawerOpen && active_tab === DBOT_TABS.DASHBOARD,
                    })}
                    onClick={() => goToTab(DBOT_TABS.DASHBOARD)}
                >
                    <LabelPairedObjectsColumnCaptionRegularIcon height='24px' width='24px' fill='var(--text-general)' />
                    <span>{localize('Dashboard')}</span>
                </button>
                <button
                    className={classNames('mobile-bottom-nav__item', {
                        'mobile-bottom-nav__item--active': !isDrawerOpen && active_tab === DBOT_TABS.BOT_BUILDER,
                    })}
                    onClick={() => goToTab(DBOT_TABS.BOT_BUILDER)}
                >
                    <LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' fill='var(--text-general)' />
                    <span>{localize('Bot builder')}</span>
                </button>
                <button
                    className={classNames('mobile-bottom-nav__item', {
                        'mobile-bottom-nav__item--active': !isDrawerOpen && active_tab === DBOT_TABS.CHART,
                    })}
                    onClick={() => goToTab(DBOT_TABS.CHART)}
                >
                    <LabelPairedChartLineCaptionRegularIcon height='24px' width='24px' fill='var(--text-general)' />
                    <span>{localize('Chart')}</span>
                </button>
                {hasMenuItems && (
                    <button
                        className={classNames('mobile-bottom-nav__item', {
                            'mobile-bottom-nav__item--active': isDrawerOpen,
                        })}
                        onClick={openDrawer}
                    >
                        <LegacyMenuHamburger1pxIcon iconSize='xs' fill='var(--text-general)' />
                        <span>{localize('Menu')}</span>
                    </button>
                )}
            </nav>

            {hasMenuItems && (
                <div className='mobile-menu'>
                    <Drawer isOpen={isDrawerOpen} onCloseDrawer={closeDrawer} width='100%'>
                        <Drawer.Header onCloseDrawer={closeDrawer}>
                            {/* Language now lives in the Settings list below, so the
                                drawer header no longer needs its own globe button —
                                just the close (X), matching the target design. */}
                            <MenuHeader hideLanguageSetting openLanguageSetting={openLanguageSetting} />
                        </Drawer.Header>

                        <Drawer.Content>
                            {/* [AI] Conditionally render language drawer based on brand config */}
                            {enableLanguageSettings && isLanguageSettingVisible ? (
                                <>
                                    <div className='mobile-menu__back-btn'>
                                        <BackButton buttonText={localize('Language')} onClick={hideModal} />
                                    </div>

                                    <MobileLanguagesDrawer
                                        isOpen
                                        languages={FILTERED_LANGUAGES}
                                        onClose={hideModal}
                                        onLanguageSwitch={code => {
                                            try {
                                                switchLanguage(code);
                                                hideModal();
                                                // Page reload is necessary because Blockly is outside React lifecycle
                                                // and won't re-render with new language without full page refresh
                                                // Use replace() to navigate to the active tab URL which will reload the page
                                                window.location.replace(getActiveTabUrl());
                                            } catch (error) {
                                                console.error('Failed to switch language:', error);
                                                hideModal();
                                            }
                                        }}
                                        selectedLanguage={currentLang}
                                        wrapperClassName='mobile-menu__language-drawer'
                                    />
                                </>
                            ) : (
                                <MenuContent
                                    enableThemeToggle={enableThemeToggle}
                                    enableLanguageSettings={enableLanguageSettings}
                                    onOpenTutorials={openTutorials}
                                    onOpenLanguage={openLanguageSetting}
                                    onLogout={() => {
                                        closeDrawer();
                                        onLogout?.();
                                    }}
                                />
                            )}
                            {/* [/AI] */}
                        </Drawer.Content>

                        <Drawer.Footer className='mobile-menu__footer'>
                            <ServerTime />
                            <NetworkStatus />
                        </Drawer.Footer>
                    </Drawer>
                </div>
            )}
        </>
    );
};

export default MobileMenu;
