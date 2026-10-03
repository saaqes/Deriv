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
  var DEFAULT_MODE = 'none';
  var root = document.documentElement;

  function getRealAddress() {
    try {
      var host = window.location.hostname;
      return host && host !== '' ? host : 'localhost';
    } catch (err) {
      return 'localhost';
    }
  }

  // Texto de la barra simulada — NO depende de window.location. Es un
  // valor propio de la app, editable por el usuario, guardado en su
  // propia clave de localStorage. Nunca toca la URL real del navegador.
  var SIM_TEXT_KEY = 'simulatedNavigationText';
  var DEFAULT_SIM_TEXT = 'deriv simulado';

  function getSimulatedText() {
    try {
      var v = localStorage.getItem(SIM_TEXT_KEY);
      return v && v.trim() !== '' ? v : DEFAULT_SIM_TEXT;
    } catch (err) {
      return DEFAULT_SIM_TEXT;
    }
  }

  function setSimulatedText(value) {
    var clean = (value || '').trim();
    if (clean === '') clean = DEFAULT_SIM_TEXT;
    try {
      localStorage.setItem(SIM_TEXT_KEY, clean);
    } catch (err) {
      /* localStorage no disponible — el valor solo dura la sesión actual */
    }
    return clean;
  }

  // Ruta simulada dinámica ("/#chart", "/#bot_builder", "/#dashboard", ...)
  // — se LEE de location.hash (la misma navegación hash/SPA que ya usa
  // la app real, ver main.tsx), nunca se escribe ni se modifica.
  function getSimulatedRoute() {
    try {
      var h = window.location.hash; // incluye el "#", ej. "#chart"
      return h && h.length > 1 ? '/' + h : '';
    } catch (err) {
      return '';
    }
  }

  // Detecta si la página actual es home.html, leyendo únicamente
  // location.pathname (solo lectura, no se modifica nada).
  function isHomePage() {
    try {
      return /(^|\/)home\.html$/.test(window.location.pathname);
    } catch (err) {
      return false;
    }
  }

  // Prefijo NO editable ("home " o "") — se muestra aparte de
  // .bf-host para que editar el texto nunca borre ni guarde este
  // prefijo como si fuera parte del DEFAULT_SIM_TEXT del usuario.
  function getSimulatedPrefix() {
    return isHomePage() ? 'home ' : '';
  }

  function getMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'chrome' || v === 'safari' || v === 'none' ? v : DEFAULT_MODE;
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
      controls: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="3" y1="8" x2="21" y2="8"/><circle cx="9" cy="8" r="2" fill="currentColor" stroke="none"/><line x1="3" y1="16" x2="21" y2="16"/><circle cx="16" cy="16" r="2" fill="currentColor" stroke="none"/></svg>',
      home: '<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 500.000000 500.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)" fill="currentColor" stroke="none"><path d="M2436 4989 c2 -4 -3 -12 -11 -19 -8 -7 -15 -9 -15 -6 0 4 -10 -3 -22 -14 -13 -12 -35 -28 -50 -36 -16 -8 -28 -19 -28 -25 0 -6 -5 -7 -12 -3 -7 4 -8 3 -4 -4 4 -7 -6 -20 -26 -31 -18 -11 -42 -28 -53 -39 -39 -38 -108 -78 -113 -64 -2 6 -8 9 -13 6 -6 -3 -2 -12 8 -21 10 -8 12 -12 6 -8 -7 3 -30 -10 -50 -29 -68 -62 -133 -107 -145 -100 -7 4 -8 3 -4 -4 4 -6 -4 -16 -16 -23 -13 -7 -35 -25 -51 -40 -15 -15 -36 -31 -47 -34 -11 -4 -18 -11 -15 -16 4 -5 0 -9 -8 -9 -8 0 -22 -9 -32 -20 -10 -12 -25 -18 -32 -16 -7 3 -15 0 -19 -6 -5 -7 -2 -8 7 -4 8 5 1 -3 -15 -15 -16 -13 -40 -34 -53 -46 -26 -25 -38 -30 -27 -11 4 7 3 8 -5 4 -6 -4 -9 -12 -6 -17 4 -5 -1 -9 -10 -9 -10 0 -13 -5 -9 -12 5 -8 2 -9 -9 -5 -11 4 -17 1 -17 -8 0 -8 -3 -14 -7 -13 -5 1 -18 -3 -29 -10 -12 -6 -24 -9 -26 -6 -3 2 -11 -3 -19 -13 -12 -14 -12 -15 0 -9 9 6 12 4 9 -5 -3 -8 -15 -19 -27 -25 -12 -6 -33 -22 -47 -35 -14 -13 -28 -22 -31 -21 -2 2 -8 0 -11 -4 -4 -4 0 -4 8 0 8 4 7 1 -3 -8 -11 -8 -25 -12 -33 -9 -8 3 -14 -1 -14 -10 0 -8 -15 -26 -34 -41 -37 -28 -52 -33 -40 -14 5 7 3 8 -5 4 -7 -5 -10 -15 -7 -23 5 -11 2 -13 -9 -9 -9 3 -13 2 -10 -4 3 -6 -1 -10 -10 -10 -8 0 -18 -7 -21 -15 -4 -8 -10 -15 -15 -15 -5 0 -18 -8 -28 -17 -41 -38 -52 -44 -63 -37 -7 4 -8 3 -4 -4 6 -10 -38 -51 -59 -53 -5 -1 -16 -10 -22 -19 -7 -10 -21 -17 -30 -15 -10 2 -18 4 -18 5 0 1 -9 3 -21 4 -11 1 -21 -3 -21 -10 0 -9 5 -10 18 -3 12 6 20 5 24 -1 4 -6 11 -7 17 -4 7 4 8 2 4 -4 -4 -6 -14 -8 -23 -5 -12 5 -14 3 -8 -7 6 -10 4 -12 -8 -7 -10 4 -16 2 -14 -6 1 -7 -4 -11 -11 -9 -8 1 -11 -1 -8 -6 3 -5 -5 -15 -16 -23 -12 -8 -30 -22 -40 -31 -10 -10 -20 -18 -23 -18 -3 0 -16 -7 -30 -16 -13 -9 -29 -13 -34 -10 -5 4 -13 1 -17 -5 -4 -7 -3 -9 4 -5 6 3 13 2 17 -4 3 -5 0 -10 -9 -10 -8 0 -16 -3 -18 -8 -6 -14 -86 -72 -99 -72 -7 0 -10 -3 -6 -6 6 -6 0 -13 -43 -49 -13 -11 -20 -14 -16 -8 5 9 2 11 -8 7 -9 -3 -13 -10 -10 -15 3 -5 -2 -9 -10 -9 -9 0 -16 -4 -16 -10 0 -5 -5 -10 -11 -10 -5 0 -7 5 -3 12 4 7 3 8 -5 4 -9 -6 -9 -11 1 -24 7 -9 8 -13 2 -9 -7 4 -17 0 -24 -8 -7 -8 -17 -12 -23 -8 -5 3 -7 1 -3 -5 3 -6 -3 -14 -15 -17 -23 -8 -139 -115 -139 -129 0 -5 -10 -18 -23 -30 -12 -12 -23 -29 -25 -36 -2 -8 -8 -18 -14 -21 -5 -3 -9 -9 -8 -13 3 -14 -12 -66 -19 -62 -4 3 -5 -10 -3 -29 2 -18 -1 -36 -7 -39 -6 -4 -11 -15 -11 -24 0 -11 3 -13 8 -5 4 6 6 -599 5 -1345 l-3 -1357 26 -70 c14 -39 27 -85 28 -102 2 -18 6 -36 11 -40 4 -5 4 3 0 16 -5 16 -4 21 4 17 6 -4 11 -14 11 -22 0 -8 4 -12 10 -9 5 3 10 1 10 -5 0 -7 16 -27 35 -46 20 -19 33 -39 29 -45 -4 -8 0 -7 15 0 18 10 20 9 14 -5 -4 -10 -2 -15 4 -11 5 3 31 -5 58 -18 40 -21 61 -25 124 -23 42 1 58 3 36 5 -177 17 -328 149 -369 323 -23 97 -24 2736 -1 2823 33 128 78 183 274 330 75 56 204 154 286 217 83 64 259 199 393 300 134 102 382 290 550 418 169 129 379 288 467 355 88 67 191 145 229 174 l68 53 -35 -2 c-19 -2 -33 -6 -31 -9z"/><path d="M2513 4993 c5 -4 109 -84 232 -178 435 -331 952 -724 1125 -856 96 -73 308 -233 470 -357 162 -123 312 -243 333 -265 21 -23 52 -71 70 -107 l32 -65 3 -1405 c2 -1282 1 -1408 -14 -1455 -52 -157 -189 -274 -344 -294 l-65 -8 88 -2 c58 -1 87 3 87 10 0 6 7 8 16 5 8 -3 13 -2 9 3 -3 5 8 12 25 16 16 4 30 11 30 16 0 5 5 9 11 9 5 0 7 -5 3 -12 -5 -7 -3 -8 5 -4 7 5 10 10 7 13 -7 7 36 53 45 47 4 -2 11 1 15 7 5 8 2 10 -7 5 -8 -4 -5 0 5 8 11 9 17 16 13 16 -4 0 6 12 22 28 16 15 29 32 30 37 4 30 14 46 27 41 11 -4 12 -1 5 13 -7 12 -6 22 2 30 9 9 12 339 12 1434 0 1258 -2 1428 -16 1475 -8 29 -19 49 -23 45 -4 -4 -5 6 -2 22 3 17 3 24 0 17 -7 -16 -34 3 -34 24 0 8 -4 14 -9 14 -10 0 -27 39 -22 54 1 5 -4 4 -13 -3 -12 -10 -15 -9 -20 6 -3 10 -19 27 -36 38 -32 22 -42 42 -12 26 14 -7 19 -6 19 3 0 8 -10 12 -25 10 -33 -3 -53 5 -45 20 3 6 3 8 -2 4 -4 -4 -22 2 -39 14 -39 28 -60 48 -49 48 4 0 -16 14 -44 30 -54 31 -60 39 -43 56 6 6 3 10 -9 10 -11 0 -17 -4 -15 -8 3 -4 1 -8 -4 -8 -13 0 -82 72 -77 80 3 5 -3 6 -14 3 -10 -3 -27 3 -37 14 -11 10 -32 24 -47 31 -19 8 -27 18 -23 27 3 10 0 12 -11 8 -12 -5 -14 -3 -8 8 4 8 5 11 0 7 -4 -4 -20 1 -35 12 -16 11 -34 20 -40 20 -8 0 -10 8 -7 21 3 12 3 18 0 15 -4 -3 -13 0 -21 7 -13 10 -14 9 -7 -3 4 -8 -4 -4 -18 9 -15 13 -24 28 -20 34 3 6 1 7 -5 3 -7 -4 -21 -1 -33 7 -13 9 -16 17 -10 22 6 3 11 1 11 -5 0 -6 5 -8 11 -5 6 4 8 9 5 12 -5 5 -15 7 -64 12 -7 0 -11 5 -7 10 3 5 0 13 -6 17 -8 4 -9 3 -5 -4 10 -16 -2 -15 -19 2 -8 7 -11 16 -8 20 4 3 -4 6 -17 6 -13 0 -21 3 -17 6 7 7 -58 54 -74 54 -6 0 -7 5 -4 10 3 6 0 10 -7 10 -19 0 -88 66 -80 76 4 4 1 4 -6 0 -7 -4 -9 -12 -6 -18 5 -7 2 -8 -5 -4 -7 5 -10 14 -7 22 3 9 0 11 -11 7 -11 -4 -14 -2 -9 5 6 11 -5 16 -26 13 -4 0 -9 8 -13 18 -3 10 -19 24 -35 31 -16 7 -27 16 -24 21 3 5 2 9 -3 8 -21 -4 -33 2 -33 16 0 8 -6 14 -12 12 -7 -1 -12 3 -11 10 2 8 -4 10 -14 6 -10 -4 -14 -2 -9 5 3 6 -2 13 -13 17 -10 3 -28 13 -39 23 -55 46 -63 52 -73 52 -8 0 -8 4 0 14 9 11 7 12 -11 9 -17 -3 -29 5 -45 29 -13 18 -23 27 -23 21 0 -7 -22 4 -50 25 -27 20 -50 43 -50 50 0 6 -5 12 -11 12 -5 0 -7 6 -3 13 5 9 4 9 -6 0 -11 -10 -16 -9 -27 5 -9 11 -12 11 -7 2 10 -20 -39 29 -55 55 -11 18 -12 18 -7 1 6 -16 4 -17 -9 -6 -8 7 -12 17 -8 23 4 6 0 8 -10 4 -10 -3 -17 -2 -17 3 0 5 -16 17 -35 26 -19 9 -33 19 -31 23 2 3 -2 12 -10 19 -8 7 -14 10 -14 7 0 -4 -15 5 -32 19 -18 15 -38 30 -44 35 -5 4 -31 24 -56 44 -26 19 -44 38 -40 42 4 4 0 6 -8 3 -8 -2 -23 5 -33 16 -10 12 -15 14 -11 6 4 -8 -11 3 -34 24 -22 22 -39 43 -36 48 3 4 -3 5 -12 1 -10 -4 -15 -2 -11 3 3 6 -10 11 -31 12 -20 2 -33 0 -29 -5z"/></g></svg>',
      plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      dots: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    };
    return icons[name] || '';
  }

  // Cuadrito con número — imita el botón "cantidad de pestañas" de Chrome
  // (un cuadrado redondeado con el número dentro, en vez de un ícono).
  // Puramente decorativo, el número es fijo (no cuenta pestañas reales).
  function tabsCountHtml(n) {
    return '<span class="bf-tabs-count">' + n + '</span>';
  }

  var aspectBtnHtml =
    '<button class="bf-icon-btn bf-aspect-btn" aria-label="Aspecto" title="Aspecto" onclick="BrowserFrame.openSelector()">' +
    svgIcon('home') +
    '</button>';

  function buildTopBar() {
    var prefix = getSimulatedPrefix();
    var host = getSimulatedText();
    var route = getSimulatedRoute();
    var top = document.createElement('div');
    top.className = 'bf-top';
    top.innerHTML =
      aspectBtnHtml +
      '<div class="bf-address"><span class="bf-lock">' + svgIcon('controls') + '</span>' +
      '<span class="bf-prefix">' + prefix + '</span>' +
      '<span class="bf-host" contenteditable="true" spellcheck="false">' + host + '</span>' +
      '<span class="bf-route">' + route + '</span></div>' +
      '<button class="bf-icon-btn" aria-label="Nueva pestaña">' + svgIcon('plus') + '</button>' +
      '<button class="bf-icon-btn" aria-label="Pestañas">' + tabsCountHtml(2) + '</button>' +
      '<button class="bf-icon-btn" aria-label="Menú">' + svgIcon('dots') + '</button>';
    return top;
  }

  function buildBottomBar() {
    var prefix = getSimulatedPrefix();
    var host = getSimulatedText();
    var route = getSimulatedRoute();
    var bottom = document.createElement('div');
    bottom.className = 'bf-bottom';
    bottom.innerHTML =
      '<div class="bf-safari-addr-row">' +
      aspectBtnHtml +
      '<div class="bf-address"><span class="bf-lock">' + svgIcon('lock') + '</span>' +
      '<span class="bf-prefix">' + prefix + '</span>' +
      '<span class="bf-host" contenteditable="true" spellcheck="false">' + host + '</span>' +
      '<span class="bf-route">' + route + '</span>' +
      '<span class="bf-icon-btn" style="width:14px;height:14px;opacity:.6;margin-left:6px">' + svgIcon('reload') + '</span></div>' +
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

  // Solo el menú de las páginas estáticas (home.html/options.html) se
  // mueve realmente en el DOM — ahí lo controlo por completo y es
  // seguro. El menú de la app React (.mobile-bottom-nav / .app-footer)
  // NO se mueve: esa app calcula alturas internas (el panel de Run,
  // el dashboard) asumiendo que su menú es position:fixed y no ocupa
  // espacio de flujo: moverlo rompía esos cálculos (Run/Reset se
  // cortaban). Para esos casos se usa un desplazamiento calculado en
  // su lugar, sin tocar el DOM.
  var REAL_MOVE_SELECTOR = '.bottom-nav';
  var OFFSET_ONLY_SELECTORS = ['.mobile-bottom-nav', '.app-footer'];
  var STACK_ID = 'bfSafariStack';

  function findOffsetOnlyNav() {
    for (var i = 0; i < OFFSET_ONLY_SELECTORS.length; i++) {
      var el = document.querySelector(OFFSET_ONLY_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  /** Caso "página estática": saca el menú de su position:fixed y lo
   * mueve, en el DOM real, al mismo contenedor apilado (flex-column)
   * que la barra Safari — en ese orden: menú primero, Safari después.
   * Caso "app React": el menú se queda donde está (fixed); solo se le
   * calcula un `bottom` para que la barra Safari (también fixed,
   * independiente) quede justo debajo sin superponerse. */
  function placeSafariBar(safariBar) {
    var realMoveNav = document.querySelector(REAL_MOVE_SELECTOR);

    if (realMoveNav) {
      var stack = document.createElement('div');
      stack.id = STACK_ID;
      stack.className = 'bf-safari-stack';
      realMoveNav.classList.add('bf-nav-in-stack');
      stack.appendChild(realMoveNav); // lo saca de donde estaba y lo mete aquí, EN ESE ORDEN
      stack.appendChild(safariBar); // Safari va DESPUÉS del menú, nunca antes
      document.body.appendChild(stack);
      return;
    }

    // App React: no mover nada del DOM existente, solo agregar la
    // barra Safari como su propio elemento fixed independiente.
    var offsetNav = findOffsetOnlyNav();
    if (offsetNav) offsetNav.classList.add('bf-nav-offset');
    document.body.appendChild(safariBar);
  }

  /** Deshace lo anterior (modo Chrome, donde no hace falta coordinar
   * nada con una barra inferior porque no existe). */
  function unstackNav() {
    var stackedNav = document.querySelector('.bf-nav-in-stack');
    if (stackedNav) {
      stackedNav.classList.remove('bf-nav-in-stack');
      document.body.appendChild(stackedNav);
    }
    var stack = document.getElementById(STACK_ID);
    if (stack) stack.remove();

    var offsetNav = document.querySelector('.bf-nav-offset');
    if (offsetNav) offsetNav.classList.remove('bf-nav-offset');
  }

  /** Mide el frame real (no un valor fijo) y actualiza las variables CSS
   * que el resto de la app usa para reservar su espacio. */
  function measureAndSetVars() {
    var top = document.querySelector('.bf-top');
    var stack = document.getElementById(STACK_ID);
    var bar = document.querySelector('.bf-bottom');
    var topH = top ? top.getBoundingClientRect().height : 0;
    // Caso página estática: el bloque apilado completo (menú + barra).
    // Caso app React: la barra Safari sola (el menú no se movió, se le
    // aplica su propio offset — ver CSS .bf-nav-offset).
    var bottomH = stack ? stack.getBoundingClientRect().height : bar ? bar.getBoundingClientRect().height : 0;
    root.style.setProperty('--browser-frame-top-height', topH + 'px');
    root.style.setProperty('--browser-frame-bottom-height', bottomH + 'px');

    // Altura real del header propio de la app (donde está el saldo,
    // .app-header en la app React / .header-top en home.html), para
    // que ningún panel/contenido pueda crecer por encima de él, sin
    // importar el modo de aspecto seleccionado ni la pestaña activa.
    var MIN_HEADER_HEIGHT = 72; // px — mínimo garantizado.
    var appHeader = document.querySelector('.app-header') || document.querySelector('.header-top');
    var measuredHeaderH = appHeader ? appHeader.getBoundingClientRect().height : 0;
    // Si no se encuentra o mide menos que el mínimo (p.ej. en una
    // pestaña donde el selector no aplica), usar el mínimo — sin
    // esto, el tope efectivo sería "toda la pantalla".
    var appHeaderH = measuredHeaderH > MIN_HEADER_HEIGHT ? measuredHeaderH : MIN_HEADER_HEIGHT;
    root.style.setProperty('--app-header-height', appHeaderH + 'px');

    // Altura real del drawer (.dc-drawer, ver drawer.scss) — cambia
    // entre cerrado (solo la flecha, 3.6rem) y abierto (crece hacia
    // abajo). El área del gráfico/Volatility usa esto para reservar
    // exactamente ese espacio y quedar SIEMPRE debajo del drawer, sin
    // que este la tape mientras no está expandido sobre ella.
    var drawerEl = document.querySelector('.dc-drawer');
    var drawerH = drawerEl ? drawerEl.getBoundingClientRect().height : 0;
    root.style.setProperty('--drawer-toggle-height', drawerH + 'px');
  }

  function apply(mode) {
    var body = document.body;
    var existingTop = document.querySelector('.bf-top');
    if (existingTop) existingTop.remove();
    unstackNav();
    var existingBottom = document.querySelector('.bf-bottom');
    if (existingBottom) existingBottom.remove();

    body.classList.remove('bf-active', 'bf-chrome', 'bf-safari');

    if (mode === 'none') {
      // Sin marco: no se agrega ninguna clase ni barra, así que
      // ninguna de las reglas de browser-frame.css (padding-top,
      // padding-bottom, desplazamientos del menú/Run/drawer, etc.) se
      // activa. El layout queda exactamente como si este sistema no
      // existiera — limpio y organizado, tal cual estaba antes de
      // elegir Chrome o Safari.
      measureAndSetVars();
      return;
    }

    body.classList.add('bf-active');
    body.classList.add(mode === 'safari' ? 'bf-safari' : 'bf-chrome');

    // Chrome: solo barra superior (el menú de la app se queda donde
    // siempre estuvo, fixed, no hace falta tocarlo).
    // Safari: solo barra inferior, apilada DEBAJO del menú real en el
    // mismo contenedor de flujo — nunca fixed+offset calculado.
    if (mode === 'safari') {
      placeSafariBar(buildBottomBar());
    } else {
      body.insertBefore(buildTopBar(), body.firstChild);
    }

    wireEditableHost();

    // Medir de inmediato (getBoundingClientRect fuerza un reflow síncrono
    // con el valor ya correcto) — así no hay ni un frame de solapamiento
    // entre insertar la barra y reservarle su espacio real.
    measureAndSetVars();
  }

  // Hace editable el texto de la barra simulada (.bf-host, ya
  // contenteditable en el HTML). Solo cambia ESTE texto propio de la
  // app — nunca window.location ni la URL real del navegador.
  function wireEditableHost() {
    var hosts = document.querySelectorAll('.bf-host');
    for (var i = 0; i < hosts.length; i++) {
      (function (el) {
        var valueBeforeEdit = el.textContent;

        el.addEventListener('focus', function () {
          valueBeforeEdit = el.textContent;
        });

        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            el.blur(); // dispara 'blur' -> guarda
          } else if (e.key === 'Escape') {
            e.preventDefault();
            el.textContent = valueBeforeEdit;
            el.blur();
          }
        });

        el.addEventListener('blur', function () {
          var saved = setSimulatedText(el.textContent);
          el.textContent = saved;
          // Mantiene todas las demás barras (top/bottom) sincronizadas
          // con el mismo texto, si hubiera más de una en el DOM.
          var all = document.querySelectorAll('.bf-host');
          for (var j = 0; j < all.length; j++) {
            all[j].textContent = saved;
          }
        });
      })(hosts[i]);
    }
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
      '  <div class="bf-option none-preview" data-mode="none">' +
      '    <div class="bf-preview"><div class="bf-preview-body" style="height:100%"></div></div>' +
      '    <div class="bf-option-info"><div class="bf-option-name">Ninguno</div><div class="bf-option-desc">Sin marco de navegador (predeterminado)</div></div>' +
      '    <div class="bf-radio">✓</div>' +
      '  </div>' +
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

  /** window.matchMedia('(display-mode: standalone)') cubre PWA
   * instaladas en Android/desktop; navigator.standalone es el
   * equivalente específico de iOS Safari. */
  function isRunningAsPwa() {
    try {
      if (window.navigator.standalone === true) return true;
      return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    } catch (err) {
      return false;
    }
  }

  function applyPwaClass() {
    document.body.classList.toggle('bf-pwa-standalone', isRunningAsPwa());
  }

  function init() {
    root.style.setProperty('--browser-frame-top-height', '0px');
    root.style.setProperty('--browser-frame-bottom-height', '0px');
    root.style.setProperty('--app-header-height', '72px');
    applyPwaClass();
    apply(getMode());

    // Recalcular ante cualquier cambio real de layout: resize, cambio de
    // orientación, o cuando el navegador muestra/oculta su propia UI
    // (barra de direcciones móvil) y el viewport visual cambia de alto.
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    // Navegación por posición dentro de .mobile-bottom-nav: el mismo
    // orden que usa hash=['dashboard','bot_builder','chart',...] en
    // main.tsx. No se usa el texto del botón (se traduce según el
    // idioma) ni un id — solo su posición, que es estable.
    var NAV_ITEM_HASH_BY_INDEX = { 1: 'dashboard', 2: 'bot_builder', 3: 'chart' };

    // Captura el click ANTES de que la app procese su propio manejador
    // (fase de captura, en el document) — así la barra simulada se
    // actualiza en el mismo instante del click, sin esperar al ciclo
    // de render de React ni a que la app dispare su propio hashchange.
    document.addEventListener('click', function (e) {
      var nav = e.target.closest ? e.target.closest('.mobile-bottom-nav') : null;
      var item = e.target.closest ? e.target.closest('.mobile-bottom-nav__item') : null;
      if (!nav || !item) return;

      var children = Array.prototype.slice.call(nav.children);
      var index = children.indexOf(item);
      var targetHash = NAV_ITEM_HASH_BY_INDEX[index];
      if (!targetHash) return; // Home (0) y Menu (4): no cambian de hash

      // Actualiza el hash real de la URL — asignar .hash es SPA/
      // client-side puro, nunca recarga la página. Si ya es el mismo
      // hash, no se toca nada (evita un cambio duplicado).
      if (window.location.hash !== '#' + targetHash) {
        window.location.hash = targetHash;
      }

      // Actualiza el texto de la barra en el MISMO instante del click,
      // sin esperar el evento 'hashchange' (que también se disparará
      // enseguida y confirmará/sincronizará el mismo valor).
      var newRoute = '/#' + targetHash;
      var routeEls = document.querySelectorAll('.bf-route');
      for (var i = 0; i < routeEls.length; i++) {
        routeEls[i].textContent = newRoute;
      }
    }, true);

    // Respaldo: sigue escuchando 'hashchange' para cubrir Atrás/
    // Adelante del navegador y cualquier cambio de hash que no venga
    // de un click en estos botones (ej. navegación interna de la app).
    // Actualiza SOLO el texto de la ruta simulada (.bf-route) cuando la
    // app navega entre secciones (#dashboard, #chart, #bot_builder...).
    // Nunca toca .bf-host (el texto editable) ni .bf-prefix.
    window.addEventListener('hashchange', function () {
      var newRoute = getSimulatedRoute();
      var routeEls = document.querySelectorAll('.bf-route');
      for (var i = 0; i < routeEls.length; i++) {
        routeEls[i].textContent = newRoute;
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }
    if (window.matchMedia) {
      try {
        window.matchMedia('(display-mode: standalone)').addEventListener('change', applyPwaClass);
      } catch (err) {
        /* Safari antiguo sin addEventListener en MediaQueryList — no crítico. */
      }
    }

    // La app React (.app-header) todavía no existe cuando este script
    // corre — React la monta después. Un MutationObserver recalcula en
    // cuanto aparece (y ante cualquier cambio posterior de su tamaño,
    // p.ej. si el header cambia de alto entre pestañas), sin depender
    // de ganchos específicos de React.
    if (window.MutationObserver) {
      var pending = false;
      var observer = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          measureAndSetVars();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // .dc-drawer anima su alto (transition: height 0.3s) al abrir o
    // cerrar — medir justo al cambiar la clase captura un valor a
    // mitad de la animación, no el final. Este listener delegado
    // vuelve a medir exactamente cuando la transición de altura
    // termina, sin importar qué elemento la disparó.
    document.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'height' && e.target && e.target.classList && e.target.classList.contains('dc-drawer')) {
        measureAndSetVars();
      }
    });
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
