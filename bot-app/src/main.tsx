import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
// Removed AnalyticsInitializer import - analytics dependency removed
// See migrate-docs/ANALYTICS_IMPLEMENTATION_GUIDE.md for re-implementation
import { initiateMockLogin } from './external/deriv-core/auth/mock-login';
import { installFakeBroker } from './external/deriv-core/trading/fake-broker';
import { captureConfiguredBalanceFromUrl } from './external/deriv-core/trading/display-balance';
import {
    applyBrandFontFromConfig,
    applyDocumentTitle,
    applyFaviconFromLogo,
    applyPrimaryColorFromConfig,
} from './utils/document-branding';
import { applyReact19DomPolyfills } from './utils/react19-dom-polyfills';
import { performVersionCheck } from './utils/version-check';
import './styles/index.scss';

applyReact19DomPolyfills();

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Pick up a DEMO-only display balance handed off from site-standalone via
// ?tlbal=<amount> (see display-balance.ts). Purely cosmetic — never affects
// the real Deriv balance, real accounts, or trading logic.
captureConfiguredBalanceFromUrl();

// This app is an educational simulator (see mock-login.ts) — clicking "Run"
// must never be blocked by "Please log in." (fake-broker.ts rejects a buy
// when no mock account is active yet). header.tsx also auto-activates the
// simulated session, but only once it mounts and its effect runs; doing it
// here too, synchronously before React even renders, closes the race where
// a fast click on Run lands before that effect has had a chance to fire.
// Unconditional on purpose: stale/incomplete real-auth data left over in
// localStorage from an earlier attempt must never be able to block the
// simulator from working.
initiateMockLogin('demo');
installFakeBroker();

// Apply deploy-time document branding (tab title, favicon, web font, and primary color).
applyDocumentTitle();
applyFaviconFromLogo();
applyBrandFontFromConfig();
applyPrimaryColorFromConfig();

// Removed AnalyticsInitializer() call - analytics dependency removed

// App Builder preview branding (incl. PREVIEW_READY handshake) is handled by the
// src/preview/ listener, mounted from app-content only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true') and stripped from standalone partner deploys.
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
