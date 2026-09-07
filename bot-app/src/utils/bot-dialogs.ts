/**
 * In-page replacement for the native `window.alert` / `window.prompt` used
 * by the bot's "Print" and "Text prompt" blocks (see
 * scratch/blocks/Text/text_print.js and text_prompt_ext.js, wired in via
 * services/tradeEngine/Interface/index.js).
 *
 * Why: the native browser dialog always prefixes its message with the
 * page's real origin (e.g. "deriv-59qo.onrender.com dice:"), which cannot
 * be overridden. This custom modal is fully our own markup, so we control
 * every word shown — including making explicit that this is the demo
 * simulator, not the real Deriv platform.
 */

export const DIALOG_LABEL = 'Simulador Deriv (demo) dice:';

let overlayEl: HTMLDivElement | null = null;

function buildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'bot-dialog-overlay');
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '99999',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
        background: '#fff',
        borderRadius: '8px',
        padding: '20px 24px',
        minWidth: '280px',
        maxWidth: '90vw',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontFamily: 'inherit',
    });

    const label = document.createElement('div');
    label.textContent = DIALOG_LABEL;
    Object.assign(label.style, {
        fontWeight: '600',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#333',
    });

    const message = document.createElement('div');
    message.setAttribute('data-testid', 'bot-dialog-message');
    Object.assign(message.style, {
        marginBottom: '16px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: '14px',
    });

    box.appendChild(label);
    box.appendChild(message);
    overlay.appendChild(box);

    overlay.dataset.box = '';
    (overlay as any)._box = box;
    (overlay as any)._message = message;

    return overlay;
}

function mount(): { overlay: HTMLDivElement; box: HTMLElement; message: HTMLElement } {
    overlayEl = buildOverlay();
    document.body.appendChild(overlayEl);
    return {
        overlay: overlayEl,
        box: (overlayEl as any)._box,
        message: (overlayEl as any)._message,
    };
}

function unmount(): void {
    if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
}

function makeButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
        padding: '6px 16px',
        borderRadius: '4px',
        border: 'none',
        background: '#ff444f',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
    });
    return btn;
}

/**
 * Custom "Print" block dialog. Returns a Promise so it can be wired into the
 * bot's interpreter via createAsync (see interpreter.js), which pauses the
 * running strategy until the Promise resolves — the same pause-until-OK
 * behaviour the native window.alert used to give us for free.
 */
export function showBotAlert(msg?: unknown): Promise<void> {
    return new Promise(resolve => {
        const { box, message } = mount();
        message.textContent = msg === undefined ? '' : String(msg);

        const actions = document.createElement('div');
        Object.assign(actions.style, { textAlign: 'right' });

        const okBtn = makeButton('OK');
        okBtn.addEventListener('click', () => {
            unmount();
            resolve();
        });

        actions.appendChild(okBtn);
        box.appendChild(actions);
    });
}

/** Custom "Text prompt" block dialog. Resolves with the entered text, or null if cancelled. */
export function showBotPrompt(msg?: unknown, defaultValue = ''): Promise<string | null> {
    return new Promise(resolve => {
        const { box, message } = mount();
        message.textContent = msg === undefined ? '' : String(msg);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        Object.assign(input.style, {
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 8px',
            marginBottom: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
        });

        const actions = document.createElement('div');
        Object.assign(actions.style, { textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' });

        const cancelBtn = makeButton('Cancelar');
        Object.assign(cancelBtn.style, { background: '#e0e0e0', color: '#333' });
        cancelBtn.addEventListener('click', () => {
            unmount();
            resolve(null);
        });

        const okBtn = makeButton('OK');
        okBtn.addEventListener('click', () => {
            const { value } = input;
            unmount();
            resolve(value);
        });

        box.insertBefore(input, box.children[2] ?? null);
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        box.appendChild(actions);
        input.focus();
    });
}
