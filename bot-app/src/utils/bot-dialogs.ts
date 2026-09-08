/**
 * Custom in-page dialogs for bot-app.
 *
 * Replaces the native browser alert/prompt so the browser does not display
 * the real website origin (for example: "deriv-59qo.onrender.com says:").
 */

export const DIALOG_LABEL = 'Deriv Bot dice:';

let overlayEl: HTMLDivElement | null = null;

function buildOverlay(): {
    overlay: HTMLDivElement;
    box: HTMLDivElement;
    message: HTMLDivElement;
} {
    const overlay = document.createElement('div');

    overlay.setAttribute('data-testid', 'bot-dialog-overlay');

    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '99999',
    });

    const box = document.createElement('div');

    Object.assign(box.style, {
        background: '#e8e8e8',
        border: '1px solid #999',
        borderRadius: '4px',
        padding: '16px',
        minWidth: '300px',
        maxWidth: '90vw',
        boxSizing: 'border-box',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '13px',
        color: '#000',
    });

    const label = document.createElement('div');

    label.textContent = DIALOG_LABEL;

    Object.assign(label.style, {
        marginBottom: '12px',
        fontSize: '13px',
        fontWeight: '400',
        color: '#000',
    });

    const message = document.createElement('div');

    message.setAttribute('data-testid', 'bot-dialog-message');

    Object.assign(message.style, {
        marginBottom: '16px',
        fontSize: '13px',
        lineHeight: '1.4',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: '#000',
    });

    box.appendChild(label);
    box.appendChild(message);
    overlay.appendChild(box);

    return {
        overlay,
        box,
        message,
    };
}

function mount(): {
    overlay: HTMLDivElement;
    box: HTMLDivElement;
    message: HTMLDivElement;
} {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }

    const dialog = buildOverlay();

    overlayEl = dialog.overlay;

    document.body.appendChild(dialog.overlay);

    return dialog;
}

function unmount(): void {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
}

function makeButton(text: string): HTMLButtonElement {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = text;

    Object.assign(button.style, {
        minWidth: '70px',
        height: '28px',
        padding: '4px 14px',
        border: '1px solid #999',
        borderRadius: '3px',
        background: '#f2f2f2',
        color: '#000',
        cursor: 'pointer',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '13px',
        boxSizing: 'border-box',
    });

    return button;
}

/**
 * Custom replacement for window.alert().
 */
export function showBotAlert(msg?: unknown): Promise<void> {
    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent = msg === undefined ? '' : String(msg);

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
        });

        const okButton = makeButton('OK');

        okButton.addEventListener('click', () => {
            unmount();
            resolve();
        });

        actions.appendChild(okButton);
        box.appendChild(actions);

        okButton.focus();
    });
}

/**
 * Custom replacement for window.prompt().
 */
export function showBotPrompt(
    msg?: unknown,
    defaultValue = ''
): Promise<string | null> {
    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent = msg === undefined ? '' : String(msg);

        const input = document.createElement('input');

        input.type = 'text';
        input.value = defaultValue;

        Object.assign(input.style, {
            width: '100%',
            height: '28px',
            padding: '4px 6px',
            marginBottom: '16px',
            boxSizing: 'border-box',
            border: '1px solid #999',
            borderRadius: '2px',
            background: '#e8e8e8',
            color: '#000',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '13px',
            outline: 'none',
        });

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
        });

        const cancelButton = makeButton('Cancelar');

        cancelButton.addEventListener('click', () => {
            unmount();
            resolve(null);
        });

        const okButton = makeButton('OK');

        okButton.addEventListener('click', () => {
            const value = input.value;

            unmount();
            resolve(value);
        });

        box.appendChild(input);
        box.appendChild(actions);

        actions.appendChild(cancelButton);
        actions.appendChild(okButton);

        input.focus();
        input.select();
    });
}

/**
 * Expose the functions globally because Blockly-generated JavaScript
 * executes them through the window object.
 */
(window as any).showBotAlert = showBotAlert;
(window as any).showBotPrompt = showBotPrompt;
