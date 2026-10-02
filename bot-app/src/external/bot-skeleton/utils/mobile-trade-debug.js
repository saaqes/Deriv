// Bandera única para activar/desactivar los logs de diagnóstico de
// compra/conexión en móvil ([TradeLab][MobileTrade] ...). Se usa desde
// api-base.ts y Purchase.js para poder seguir el flujo RUN -> Purchase ->
// WebSocket -> contract.purchase_received/failed en Android Chrome /
// iPhone Safari sin llenar la consola en uso normal.
//
// Cambiar a `true` temporalmente para depurar un problema de compra o de
// reconexión del WebSocket en un dispositivo móvil; dejar en `false` en uso
// normal (incluida producción).
export const DEBUG_MOBILE_TRADE = false;

export const mobileTradeLog = (...args) => {
    if (!DEBUG_MOBILE_TRADE) return;
    // eslint-disable-next-line no-console
    console.log('[TradeLab][MobileTrade]', ...args);
};
