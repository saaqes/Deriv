export const popover_zindex = Object.freeze({
    QUICK_STRATEGY: 99999,
    TOOLBAR: 100,
    TRANSACTION: 10,
    SUMMARY_TOOLTIPS: 5,
    // Era 6 — más bajo que .controls__section (z-index: 8, la barra de
    // Run/Stop), así que la pestaña/flecha para abrir Transactions
    // quedaba tapada por la barra de Run en cuanto sus cajas se tocaban
    // un poco en móvil. Ahora queda siempre por encima.
    RUN_PANEL: 9,
});
