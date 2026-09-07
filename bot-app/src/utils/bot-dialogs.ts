export const DIALOG_LABEL = 'bot.deriv.me dice:';

function createDialog(
    messageText: string,
    inputMode = false,
    defaultValue = ''
): Promise<string | null> {
    return new Promise(resolve => {
        const overlay = document.createElement('div');

        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '99999'
        });

        const dialog = document.createElement('div');

        Object.assign(dialog.style, {
            background: 'white',
            padding: '16px',
            border: '1px solid #999',
            borderRadius: '4px',
            minWidth: '300px',
            maxWidth: '90%',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            color: '#000',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
        });

        const label = document.createElement('div');
        label.textContent = DIALOG_LABEL;

        Object.assign(label.style, {
            marginBottom: '12px'
        });

        const message = document.createElement('div');
        message.textContent = messageText;

        Object.assign(message.style, {
            marginBottom: '14px',
            whiteSpace: 'pre-wrap'
        });

        dialog.appendChild(label);
        dialog.appendChild(message);

        let input: HTMLInputElement | null = null;

        if (inputMode) {
            input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue;

            Object.assign(input.style, {
                width: '100%',
                boxSizing: 'border-box',
                padding: '5px',
                marginBottom: '14px'
            });

            dialog.appendChild(input);
        }

        const buttons = document.createElement('div');

        Object.assign(buttons.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
        });

        if (inputMode) {
            const cancel = document.createElement('button');
            cancel.textContent = 'Cancelar';

            cancel.onclick = () => {
                overlay.remove();
                resolve(null);
            };

            buttons.appendChild(cancel);
        }

        const ok = document.createElement('button');
        ok.textContent = 'OK';

        ok.onclick = () => {
            const value = input ? input.value : null;

            overlay.remove();
            resolve(value);
        };

        buttons.appendChild(ok);
        dialog.appendChild(buttons);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        if (input) {
            input.focus();
            input.select();
        } else {
            ok.focus();
        }
    });
}

export function showBotAlert(msg?: unknown): Promise<void> {
    return createDialog(
        msg === undefined ? '' : String(msg)
    ).then(() => undefined);
}

export function showBotPrompt(
    msg?: unknown,
    defaultValue = ''
): Promise<string | null> {
    return createDialog(
        msg === undefined ? '' : String(msg),
        true,
        defaultValue
    );
}

