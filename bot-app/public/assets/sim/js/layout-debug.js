/* ================================================================
 * layout-debug.js — panel de diagnóstico en pantalla
 * ----------------------------------------------------------------
 * Sin acceso a un inspector (Mac + Safari, o Chrome DevTools remoto),
 * esta es la alternativa: lee la posición y tamaño REALES de los
 * elementos problemáticos directamente del navegador y los muestra
 * como texto sobre la pantalla — los mismos datos que un inspector,
 * pero listos para capturar con una simple captura de pantalla.
 *
 * NO modifica el layout de la app. Es de solo lectura.
 *
 * Uso: se activa tocando 5 veces seguidas en la esquina superior
 * izquierda de la pantalla (evita que aparezca por accidente).
 * ================================================================ */
(function (window) {
  'use strict';

  var TARGETS = [
    { label: 'HEADER (saldo)', selectors: ['.app-header', '.header-top'] },
    { label: 'VOLATILITY BAR', selectors: ['[class*="market-symbol"]', '[class*="symbol-select"]', '[class*="chart-title"]'] },
    { label: 'DRAWER (toggle)', selectors: ['.dc-drawer'] },
    { label: 'DRAWER TOGGLE', selectors: ['.dc-drawer__toggle'] },
    { label: 'RUN (controls)', selectors: ['.controls__section'] },
    { label: 'BOTTOM NAV', selectors: ['.mobile-bottom-nav', '.bottom-nav', '.app-footer'] },
    { label: 'CHART CONTAINER', selectors: ['#chart-container', '[class*="chart-wrapper"]', '[class*="ciq-chart"]'] },
  ];

  function findFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function describe(el) {
    if (!el) return 'NO ENCONTRADO';
    var r = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    return (
      'top:' + Math.round(r.top) + 'px  bottom:' + Math.round(r.bottom) + 'px\n' +
      'left:' + Math.round(r.left) + 'px  right:' + Math.round(r.right) + 'px\n' +
      'width:' + Math.round(r.width) + 'px  height:' + Math.round(r.height) + 'px\n' +
      'position:' + cs.position + '  z-index:' + cs.zIndex + '\n' +
      'display:' + cs.display + '  visibility:' + cs.visibility + '  opacity:' + cs.opacity + '\n' +
      'overflow:' + cs.overflow
    );
  }

  function buildPanel() {
    var vv = window.visualViewport;
    var lines = [];
    lines.push('VIEWPORT: ' + window.innerWidth + 'x' + window.innerHeight +
      (vv ? '  (visual: ' + Math.round(vv.width) + 'x' + Math.round(vv.height) + ')' : ''));
    lines.push('safe-area-top/bottom (CSS env, vía elemento de prueba abajo)');
    lines.push('');

    TARGETS.forEach(function (t) {
      var el = findFirst(t.selectors);
      lines.push('— ' + t.label + (el ? ' [' + (el.className || el.tagName) + ']' : '') + ' —');
      lines.push(describe(el));
      lines.push('');
    });

    var overlay = document.createElement('div');
    overlay.id = 'bfDebugOverlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '999999',
      background: 'rgba(0,0,0,0.92)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '11px',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
      padding: '12px',
      paddingTop: 'calc(12px + env(safe-area-inset-top))',
      paddingBottom: 'calc(50px + env(safe-area-inset-bottom))',
      overflowY: 'auto',
      boxSizing: 'border-box',
    });
    overlay.textContent = lines.join('\n');

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'CERRAR';
    Object.assign(closeBtn.style, {
      position: 'fixed',
      left: '12px',
      right: '12px',
      bottom: 'calc(12px + env(safe-area-inset-bottom))',
      padding: '14px',
      background: '#ff444f',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      fontWeight: 'bold',
      zIndex: '1000000',
    });
    closeBtn.addEventListener('click', function () {
      overlay.remove();
      closeBtn.remove();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(closeBtn);
  }

  function init() {
    var tapZone = document.createElement('div');
    Object.assign(tapZone.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '60px',
      height: '60px',
      zIndex: '999998',
      background: 'transparent',
    });
    document.body.appendChild(tapZone);

    var taps = 0;
    var lastTap = 0;
    tapZone.addEventListener('click', function () {
      var now = Date.now();
      if (now - lastTap > 800) taps = 0;
      taps++;
      lastTap = now;
      if (taps >= 5) {
        taps = 0;
        buildPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
