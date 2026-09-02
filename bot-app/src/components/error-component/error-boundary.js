import React from 'react';
import PropTypes from 'prop-types';

// How many render-error recoveries we'll silently absorb before giving up
// (guards against a genuine infinite crash loop freezing the tab).
const MAX_RECOVERIES_PER_WINDOW = 5;
const WINDOW_MS = 2000;

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
        this.recent_recoveries = [];
    }

    componentDidCatch = (error, info) => {
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);

        // Recover silently instead of showing the "Sorry for the
        // interruption" screen or reloading the page: log it for debugging
        // and let React mount the tree again on the next tick, so the app
        // keeps running without interrupting whatever the user was doing.
        console.error('[ErrorBoundary] Recovered from a render error without interrupting the page:', error, info);

        const now = Date.now();
        this.recent_recoveries = [...this.recent_recoveries.filter(t => now - t < WINDOW_MS), now];

        if (this.recent_recoveries.length > MAX_RECOVERIES_PER_WINDOW) {
            // Genuinely crash-looping — stop trying so the tab doesn't
            // freeze, but still never show the reload prompt.
            console.error('[ErrorBoundary] Repeated render errors — pausing recovery attempts.');
            this.setState({ hasError: true });
            return;
        }

        this.forceUpdate();
    };

    render = () => (this.state.hasError ? null : this.props.children);
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
