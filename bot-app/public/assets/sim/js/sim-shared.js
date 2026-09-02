/*
 * TradeLab Sim — módulo compartido
 * ---------------------------------
 * Este proyecto es un SIMULADOR EDUCATIVO independiente. No es la
 * aplicación oficial de Deriv (ni de ningún otro bróker), no gestiona
 * dinero real y no está afiliado a Deriv Investments Ltd.
 *
 * Los "saldos" que administra este módulo son enteramente virtuales:
 * se guardan solo en este navegador (localStorage) y cualquier
 * ganancia o pérdida que se muestre en el simulador es ficticia.
 *
 * Se usa el mismo storage key en todas las páginas (home, options,
 * bot builder, chart) para que el saldo virtual se vea igual en
 * cualquier pantalla.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'tradelab-sim-balances';
  var DEFAULT_BALANCES = { demo: 10006.76, virtual: 0 };

  function loadBalances() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          demo: typeof parsed.demo === 'number' ? parsed.demo : DEFAULT_BALANCES.demo,
          virtual: typeof parsed.virtual === 'number' ? parsed.virtual : DEFAULT_BALANCES.virtual,
        };
      }
    } catch (err) {
      console.warn('[TradeLab Sim] No se pudo leer el saldo guardado, usando valores por defecto.', err);
    }
    return Object.assign({}, DEFAULT_BALANCES);
  }

  function saveBalances(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // Avisa a otras pestañas/páginas abiertas del mismo simulador.
      window.dispatchEvent(new CustomEvent('tradelab-sim:balances-updated', { detail: data }));
      return true;
    } catch (err) {
      console.error('[TradeLab Sim] Error al guardar el saldo virtual.', err);
      return false;
    }
  }

  function formatMoney(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Suma, resta o fija el saldo de una cuenta virtual ('demo' | 'virtual'). */
  function applyAction(account, action, rawAmount) {
    var amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount < 0) return { ok: false, reason: 'invalid' };

    var data = loadBalances();
    if (!(account in data)) return { ok: false, reason: 'unknown-account' };

    if (action === 'sumar') {
      data[account] = data[account] + amount;
    } else if (action === 'restar') {
      if (amount > data[account]) return { ok: false, reason: 'insufficient' };
      data[account] = data[account] - amount;
    } else if (action === 'fijar') {
      data[account] = amount;
    } else {
      return { ok: false, reason: 'unknown-action' };
    }

    saveBalances(data);
    return { ok: true, data: data };
  }

  /** Inserta el aviso fijo de "esto es un simulador" al inicio del <body>. */
  function mountDisclaimerBanner() {
    if (document.getElementById('tlSimBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'tlSimBanner';
    banner.setAttribute('role', 'note');
    banner.style.cssText = [
      'position:relative',
      'z-index:5000',
      'background:#3d2f00',
      'color:#ffd23f',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      'font-size:11.5px',
      'font-weight:600',
      'line-height:1.35',
      'text-align:center',
      'padding:6px 10px',
      'box-sizing:border-box',
    ].join(';');
    banner.textContent =
      '⚠ TradeLab Sim — simulador educativo con fondos virtuales. No es Deriv ni ninguna plataforma real, y no representa ganancias reales.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  global.TradeLabSim = {
    STORAGE_KEY: STORAGE_KEY,
    loadBalances: loadBalances,
    saveBalances: saveBalances,
    formatMoney: formatMoney,
    applyAction: applyAction,
    mountDisclaimerBanner: mountDisclaimerBanner,
  };
})(window);
