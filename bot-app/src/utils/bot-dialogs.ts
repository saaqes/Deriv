```ts
/**
 * In-page replacement for the native `window.alert` / `window.prompt`.
 *
 * Mantiene el comportamiento de los diálogos nativos, pero permite controlar
 * el texto del encabezado para que aparezca:
 *
 *     bot.deriv.me dice:
 *
 * en lugar del dominio real de la página.
 */

export const DIALOG_LABEL = 'bot.deriv.me dice:';

let overlayEl: HTMLDivElement | null = null;

function buildOverlay(): HTMLDivElement {
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
        fontFamily: 'Arial, Helvetica, sans-serif',
    });

    const box = document.createElement('div');

    Object.assign(box.style, {
        background: '#ffffff',
        border: '1px solid #999',
        borderRadius: '4px',
        padding: '16px',
        width: 'auto',
        minWidth: '300px',
        maxWidth: '420px',
        boxSizing: 'border-box',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        color: '#000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '13px',
    });

    const label = document.createElement('div');
    label.textContent = DIALOG_LABEL;

    Object.assign(label.style, {
        fontWeight: '400',
        marginBottom: '14px',
        fontSize: '13px',
        color: '#000',
    });

    const message = document.createElement('div');
    message.setAttribute('data-testid', 'bot-dialog-message');

    Object.assign(message.style, {
        marginBottom: '18px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: '13px',
        lineHeight: '1.4',
        color: '#000',
    });

    box.appendChild(label);
    box.appendChild(message);
    overlay.appendChild(box);

    (overlay as any)._box = box;
    (overlay as any)._message = message;

    return overlay;
}

function mount(): {
    overlay: HTMLDivElement;
    box: HTMLElement;
    message: HTMLElement;
} {
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
    btn.type = 'button';

    Object.assign(btn.style, {
        padding: '4px 14px',
        minWidth: '70px',
        height: '28px',
        borderRadius: '3px',
        border: '1px solid #999',
        background: '#f2f2f2',
        color: '#000',
        cursor: 'pointer',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '13px',
        lineHeight: 'normal',
        boxSizing: 'border-box',
    });

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#e6e6e6';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = '#f2f2f2';
    });

    return btn;
}

/**
 * Custom "Print" block dialog.
 * Se comporta como un alert nativo:
 * la ejecución queda pausada hasta pulsar OK.
 */
export function showBotAlert(msg?: unknown): Promise<void> {
    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent =
            msg === undefined ? '' : String(msg);

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '4px',
        });

        const okBtn = makeButton('OK');

        okBtn.addEventListener('click', () => {
            unmount();
            resolve();
        });

        actions.appendChild(okBtn);
        box.appendChild(actions);

        okBtn.focus();
    });
}

/**
 * Custom "Text prompt" block dialog.
 * Se comporta como prompt() nativo:
 * devuelve el texto introducido o null al cancelar.
 */
export function showBotPrompt(
    msg?: unknown,
    defaultValue = ''
): Promise<string | null> {
    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent =
            msg === undefined ? '' : String(msg);

        const input = document.createElement('input');

        input.type = 'text';
        input.value = defaultValue;

        Object.assign(input.style, {
            width: '100%',
            height: '28px',
            boxSizing: 'border-box',
            padding: '4px 6px',
            marginBottom: '16px',
            border: '1px solid #999',
            borderRadius: '2px',
            outline: 'none',
            background: '#fff',
            color: '#000',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '13px',
        });

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
        });

        const cancelBtn = makeButton('Cancelar');

        cancelBtn.addEventListener('click', () => {
            unmount();
            resolve(null);
        });

        const okBtn = makeButton('OK');

        okBtn.addEventListener('click', () => {
            const value = input.value;

            unmount();
            resolve(value);
        });

        box.appendChild(input);
        box.appendChild(actions);

        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);

        input.focus();
        input.select();
    });
}
```
