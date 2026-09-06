/* ================================================================
 * browser-frame.js — marco visual tipo navegador (Chrome / Safari)
 * ----------------------------------------------------------------
 * Decorativo únicamente. No toca el navegador real ni sus APIs de
 * seguridad. La "dirección" que se muestra es SIEMPRE
 * window.location.hostname — la dirección real donde está corriendo
 * la app, nunca un dominio inventado.
 *
 * Comportamiento:
 * - Chrome  -> solo barra SUPERIOR. El resto de la app (header,
 *   contenido, navegación) se desplaza hacia abajo automáticamente.
 * - Safari  -> solo barra INFERIOR. El contenido y la navegación
 *   propia de la app se acomodan encima de ella automáticamente.
 * El marco NUNCA se superpone: reserva su espacio real (medido con
 * getBoundingClientRect, no un valor fijo) mediante las variables
 * CSS --browser-frame-top-height / --browser-frame-bottom-height,
 * que el resto del CSS (ver browser-frame.css) usa para su padding.
 *
 * Uso: incluir este script (y browser-frame.css) en cualquier
 * página y llamar BrowserFrame.init() al final del <body>.
 * ================================================================ */
(function (window) {
  'use strict';

  var STORAGE_KEY = 'browserAppearance';
  var DEFAULT_MODE = 'chrome';
  var root = document.documentElement;

  function getRealAddress() {
    try {
      var host = window.location.hostname;
      return host && host !== '' ? host : 'localhost';
    } catch (err) {
      return 'localhost';
    }
  }

  function getMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'chrome' || v === 'safari' ? v : DEFAULT_MODE;
    } catch (err) {
      return DEFAULT_MODE;
    }
  }

  function setMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (err) {
      /* localStorage no disponible — el aspecto no persiste, pero no rompe nada */
    }
  }

  function svgIcon(name) {
    var icons = {
      menu: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
      back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>',
      fwd: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
      share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 21h14"/></svg>',
      book: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z"/></svg>',
      tabs: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/></svg>',
      reload: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>',
      lock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4m0 2a2 2 0 0 1 2 2v3H10V6a2 2 0 0 1 2-2"/></svg>',
      aspect: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
    };
    return icons[name] || '';
  }

  var aspectBtnHtml =
    '<button class="bf-icon-btn bf-aspect-btn" aria-label="Aspecto" title="Aspecto" onclick="BrowserFrame.openSelector()">' +
    svgIcon('aspect') +
    '</button>';

  function buildTopBar() {
    var host = getRealAddress();
    var top = document.createElement('div');
    top.className = 'bf-top';
    top.innerHTML =
      aspectBtnHtml +
      '<div class="bf-address"><span class="bf-lock">' + svgIcon('lock') + '</span>' +
      '<span class="bf-host">' + host + '</span></div>' +
      '<button class="bf-icon-btn" aria-label="Menú">' + svgIcon('menu') + '</button>';
    return top;
  }

  function buildBottomBar() {
    var host = getRealAddress();
    var bottom = document.createElement('div');
    bottom.className = 'bf-bottom';
    bottom.innerHTML =
      '<div class="bf-safari-addr-row">' +
      aspectBtnHtml +
      '<div class="bf-address"><span class="bf-lock">' + svgIcon('lock') + '</span>' +
      '<span class="bf-host">' + host + '</span>' +
      '<span class="bf-icon-btn" style="width:14px;height:14px;opacity:.6">' + svgIcon('reload') + '</span></div>' +
      '<span style="width:28px;flex:0 0 auto"></span>' +
      '</div>' +
      '<div class="bf-safari-controls-row">' +
      '<button class="bf-icon-btn" aria-label="Atrás">' + svgIcon('back') + '</button>' +
      '<button class="bf-icon-btn" aria-label="Adelante">' + svgIcon('fwd') + '</button>' +
      '<button class="bf-icon-btn" aria-label="Compartir">' + svgIcon('share') + '</button>' +
      '<button class="bf-icon-btn" aria-label="Marcadores">' + svgIcon('book') + '</button>' +
      '<button class="bf-icon-btn" aria-label="Pestañas">' + svgIcon('tabs') + '</button>' +
      '</div>';
    return bottom;
  }

  /** Mide el frame real (no un valor fijo) y actualiza las variables CSS
   * que el resto de la app usa para reservar su espacio. */
  function measureAndSetVars() {
    var top = document.querySelector('.bf-top');
    var bottom = document.querySelector('.bf-bottom');
    var topH = top ? top.getBoundingClientRect().height : 0;
    var bottomH = bottom ? bottom.getBoundingClientRect().height : 0;
    root.style.setProperty('--browser-frame-top-height', topH + 'px');
    root.style.setProperty('--browser-frame-bottom-height', bottomH + 'px');
  }

  function apply(mode) {
    var body = document.body;
    var existingTop = document.querySelector('.bf-top');
    var existingBottom = document.querySelector('.bf-bottom');
    if (existingTop) existingTop.remove();
    if (existingBottom) existingBottom.remove();

    body.classList.add('bf-active');
    body.classList.remove('bf-chrome', 'bf-safari');
    body.classList.add(mode === 'safari' ? 'bf-safari' : 'bf-chrome');

    // Chrome: solo barra superior. Safari: solo barra inferior.
    // El frame nunca cubre ambos lados a la vez.
    if (mode === 'safari') {
      body.appendChild(buildBottomBar());
    } else {
      body.insertBefore(buildTopBar(), body.firstChild);
    }

    // Medir de inmediato (getBoundingClientRect fuerza un reflow síncrono
    // con el valor ya correcto) — así no hay ni un frame de solapamiento
    // entre insertar la barra y reservarle su espacio real.
    measureAndSetVars();
  }

  function handleViewportChange() {
    requestAnimationFrame(measureAndSetVars);
  }

  /* ---- Selector "Aspecto" (sheet inferior con overlay) ---- */
  function buildSelector() {
    if (document.getElementById('bfOverlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'bf-overlay';
    overlay.id = 'bfOverlay';

    var current = getMode();

    overlay.innerHTML =
      '<div class="bf-sheet">' +
      '  <h3>Aspecto</h3>' +
      '  <div class="bf-option chrome-preview" data-mode="chrome">' +
      '    <div class="bf-preview"><div class="bf-preview-top"></div><div class="bf-preview-body"></div><div class="bf-preview-bottom"></div></div>' +
      '    <div class="bf-option-info"><div class="bf-option-name">Chrome</div><div class="bf-option-desc">Barra de navegador arriba</div></div>' +
      '    <div class="bf-radio">✓</div>' +
      '  </div>' +
      '  <div class="bf-option safari-preview" data-mode="safari">' +
      '    <div class="bf-preview"><div class="bf-preview-top"></div><div class="bf-preview-body"></div><div class="bf-preview-bottom"></div></div>' +
      '    <div class="bf-option-info"><div class="bf-option-name">Safari</div><div class="bf-option-desc">Barra de navegador abajo</div></div>' +
      '    <div class="bf-radio">✓</div>' +
      '  </div>' +
      '  <button class="bf-save-btn" id="bfSaveBtn">GUARDAR</button>' +
      '</div>';

    document.body.appendChild(overlay);

    var options = overlay.querySelectorAll('.bf-option');
    function markSelected(mode) {
      options.forEach(function (opt) {
        opt.classList.toggle('selected', opt.getAttribute('data-mode') === mode);
      });
    }
    markSelected(current);

    var pendingMode = current;
    options.forEach(function (opt) {
      opt.addEventListener('click', function () {
        pendingMode = opt.getAttribute('data-mode');
        markSelected(pendingMode);
      });
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSelector();
    });

    document.getElementById('bfSaveBtn').addEventListener('click', function () {
      setMode(pendingMode);
      apply(pendingMode);
      closeSelector();
    });
  }

  function openSelector() {
    buildSelector();
    var overlay = document.getElementById('bfOverlay');
    if (overlay) overlay.classList.add('open');
  }

  function closeSelector() {
    var overlay = document.getElementById('bfOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function init() {
    root.style.setProperty('--browser-frame-top-height', '0px');
    root.style.setProperty('--browser-frame-bottom-height', '0px');
    apply(getMode());

    // Recalcular ante cualquier cambio real de layout: resize, cambio de
    // orientación, o cuando el navegador muestra/oculta su propia UI
    // (barra de direcciones móvil) y el viewport visual cambia de alto.
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }
  }

  window.BrowserFrame = {
    init: init,
    apply: apply,
    getMode: getMode,
    setMode: setMode,
    openSelector: openSelector,
    closeSelector: closeSelector,
  };
})(window);
