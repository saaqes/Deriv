/**
 * Datos de respaldo ("modo simulado total") para el Chart.
 *
 * CONTEXTO: en el entorno del usuario, la obtención real de
 * `active_symbols`/`trading_times` (que depende de que el WebSocket a
 * Deriv responda a tiempo) nunca termina de resolverse de forma
 * consistente, dejando el Chart esperando "obteniendo datos" de forma
 * indefinida pese a varias correcciones sobre la causa de ese bloqueo.
 *
 * Para garantizar que el Chart SIEMPRE pueda renderizar — sin depender de
 * esa respuesta en particular — se usa esta lista estática de Índices de
 * Volatilidad (symbols sintéticos estándar de Deriv, abiertos 24/7, sin
 * necesidad de autenticación real) como respaldo inmediato. El resto de
 * la app (compra/venta vía fake-broker, precios/ticks en vivo) sigue
 * funcionando exactamente igual: este respaldo solo cubre la LISTA de
 * símbolos y sus horarios, nunca los precios ni las operaciones.
 *
 * Si la obtención real de active_symbols/trading_times SÍ llega más
 * tarde, se sigue intentando en segundo plano y reemplaza este respaldo
 * de forma transparente (ver useSmartChartAdaptor.ts).
 */
import type { ActiveSymbols, TradingTimesMap } from '@deriv-com/smartcharts-champion';

export const FALLBACK_DEFAULT_SYMBOL = 'R_100';

export const FALLBACK_ACTIVE_SYMBOLS: ActiveSymbols = [
    { code: 'R_10', name: 'Volatility 10 Index' },
    { code: 'R_25', name: 'Volatility 25 Index' },
    { code: 'R_50', name: 'Volatility 50 Index' },
    { code: 'R_75', name: 'Volatility 75 Index' },
    { code: 'R_100', name: 'Volatility 100 Index' },
    { code: '1HZ10V', name: 'Volatility 10 (1s) Index' },
    { code: '1HZ25V', name: 'Volatility 25 (1s) Index' },
    { code: '1HZ50V', name: 'Volatility 50 (1s) Index' },
    { code: '1HZ75V', name: 'Volatility 75 (1s) Index' },
    { code: '1HZ100V', name: 'Volatility 100 (1s) Index' },
].map(({ code, name }) => ({
    display_name: name,
    market: 'synthetic_index',
    market_display_name: 'Derived',
    subgroup: 'synthetics',
    subgroup_display_name: 'Synthetics',
    submarket: 'random_index',
    submarket_display_name: 'Continuous Indices',
    symbol: code,
    symbol_type: 'stockindex',
    pip: code.includes('V') ? 0.001 : 0.01,
    // Índices sintéticos: operan 24/7, nunca cerrados.
    exchange_is_open: 1,
    is_trading_suspended: 0,
    delay_amount: 0,
})) as unknown as ActiveSymbols;

export const FALLBACK_TRADING_TIMES: TradingTimesMap = FALLBACK_ACTIVE_SYMBOLS.reduce((acc, s: any) => {
    acc[s.symbol] = { isOpen: true, openTime: '00:00:00', closeTime: '23:59:59' };
    return acc;
}, {} as TradingTimesMap);
