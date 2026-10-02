// @ts-nocheck — dev-only paper-trading shim, same conventions as fake-broker.ts.
/**
 * Generador de precios simulados ("modo simulado total").
 *
 * CONTEXTO: fake-broker.ts dejaba pasar `ticks`/`ticks_history`/`proposal`
 * al API real de Deriv ("datos de mercado reales") — correcto en general,
 * pero si esa conexión real nunca entrega datos a tiempo en el entorno del
 * usuario (red, firewall, lo que sea), el bot se queda para siempre en
 * "esperando señal para comprar un contrato": la promesa de
 * `ticks_history` (ver ticks_service.js -> requestTicks) nunca se
 * resuelve, así que el intérprete de estrategia nunca recibe un tick con
 * el que evaluar sus condiciones.
 *
 * Este módulo genera un precio local tipo random-walk por símbolo —
 * sin depender de NINGUNA respuesta del servidor real — para que el Chart
 * y el motor de estrategias del bot SIEMPRE tengan datos con los que
 * operar. Solo se usa cuando hay una cuenta mock activa (ver
 * isMockLoginAvailable() en fake-broker.ts); nunca sustituye datos reales
 * en producción con cuenta real.
 */

const BASE_PRICE: Record<string, number> = {
    R_10: 8500,
    R_25: 950,
    R_50: 260,
    R_75: 105000,
    R_100: 1550,
    '1HZ10V': 8500,
    '1HZ25V': 950,
    '1HZ50V': 260,
    '1HZ75V': 105000,
    '1HZ100V': 1550,
};

// Volatilidad aproximada por tick, como fracción del precio — más alta
// cuanto mayor el número del índice, imitando el comportamiento real de
// los Índices de Volatilidad de Deriv.
const VOLATILITY: Record<string, number> = {
    R_10: 0.001,
    R_25: 0.0025,
    R_50: 0.005,
    R_75: 0.0075,
    R_100: 0.01,
    '1HZ10V': 0.001,
    '1HZ25V': 0.0025,
    '1HZ50V': 0.005,
    '1HZ75V': 0.0075,
    '1HZ100V': 0.01,
};

const PIP_SIZE: Record<string, number> = {
    R_10: 0.001,
    R_25: 0.001,
    R_50: 0.01,
    R_75: 0.01,
    R_100: 0.01,
    '1HZ10V': 0.001,
    '1HZ25V': 0.001,
    '1HZ50V': 0.01,
    '1HZ75V': 0.01,
    '1HZ100V': 0.01,
};

const DEFAULT_BASE = 1000;
const DEFAULT_VOLATILITY = 0.005;
const DEFAULT_PIP = 0.01;

type SymbolState = { price: number };
const state = new Map<string, SymbolState>();

function getState(symbol: string): SymbolState {
    let s = state.get(symbol);
    if (!s) {
        s = { price: BASE_PRICE[symbol] ?? DEFAULT_BASE };
        state.set(symbol, s);
    }
    return s;
}

export function pipSizeFor(symbol: string): number {
    return PIP_SIZE[symbol] ?? DEFAULT_PIP;
}

function round(price: number, symbol: string): number {
    const pip = pipSizeFor(symbol);
    const decimals = Math.max(0, String(pip).split('.')[1]?.length ?? 2);
    return Number(price.toFixed(decimals));
}

/** Avanza el precio un paso aleatorio y devuelve el nuevo valor. */
export function stepPrice(symbol: string): number {
    const s = getState(symbol);
    const vol = VOLATILITY[symbol] ?? DEFAULT_VOLATILITY;
    const change = (Math.random() - 0.5) * 2 * vol * s.price;
    s.price = Math.max(pipSizeFor(symbol), s.price + change);
    s.price = round(s.price, symbol);
    return s.price;
}

/** Precio actual sin avanzarlo (lectura). */
export function currentPrice(symbol: string): number {
    return getState(symbol).price;
}

/**
 * Genera `count` ticks sintéticos terminando "ahora", caminando hacia
 * atrás desde el precio actual para que el último valor coincida con el
 * que se seguirá usando en vivo.
 */
export function buildTickHistory(symbol: string, count: number): { times: number[]; prices: number[] } {
    const vol = VOLATILITY[symbol] ?? DEFAULT_VOLATILITY;
    const nowSec = Math.floor(Date.now() / 1000);
    const n = Math.max(1, Math.min(count || 1000, 5000));
    const prices: number[] = new Array(n);
    const times: number[] = new Array(n);

    let price = currentPrice(symbol);
    prices[n - 1] = price;
    times[n - 1] = nowSec;
    for (let i = n - 2; i >= 0; i--) {
        const change = (Math.random() - 0.5) * 2 * vol * price;
        price = Math.max(pipSizeFor(symbol), price - change);
        prices[i] = round(price, symbol);
        times[i] = nowSec - (n - 1 - i);
    }
    return { times, prices };
}

/**
 * Genera `count` velas sintéticas de `granularitySec` segundos cada una,
 * terminando en la vela "actual" (en curso), coherente con buildTickHistory.
 */
export function buildCandleHistory(
    symbol: string,
    count: number,
    granularitySec: number
): Array<{ open: number; high: number; low: number; close: number; epoch: number }> {
    const vol = VOLATILITY[symbol] ?? DEFAULT_VOLATILITY;
    const n = Math.max(1, Math.min(count || 1000, 5000));
    const nowSec = Math.floor(Date.now() / 1000);
    const currentBucket = Math.floor(nowSec / granularitySec) * granularitySec;

    const candles: Array<{ open: number; high: number; low: number; close: number; epoch: number }> = new Array(n);
    let close = currentPrice(symbol);

    for (let i = n - 1; i >= 0; i--) {
        const epoch = currentBucket - (n - 1 - i) * granularitySec;
        const open = Math.max(pipSizeFor(symbol), close - (Math.random() - 0.5) * 2 * vol * close);
        const high = Math.max(open, close) + Math.random() * vol * close;
        const low = Math.min(open, close) - Math.random() * vol * close;
        candles[i] = {
            open: round(open, symbol),
            high: round(high, symbol),
            low: round(low, symbol),
            close: round(close, symbol),
            epoch,
        };
        close = open; // la vela anterior termina donde esta empieza
    }
    return candles;
}

/** Limpia el estado guardado (uso en tests). */
export function resetFakeMarketData(): void {
    state.clear();
}
