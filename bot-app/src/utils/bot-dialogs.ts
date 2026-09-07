export const DIALOG_LABEL = 'bot.deriv.me dice:';

export function showBotAlert(msg?: unknown): Promise<void> {
    window.alert(msg === undefined ? '' : String(msg));
    return Promise.resolve();
}

export function showBotPrompt(
    msg?: unknown,
    defaultValue = ''
): Promise<string | null> {
    return Promise.resolve(
        window.prompt(
            msg === undefined ? '' : String(msg),
            defaultValue
        )
    );
}
