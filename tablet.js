/*
 * Tablet layout (iPad landscape and other wide screens):
 *
 *   ┌──────────────── items ────────────────┐
 *   │ Light map │     emulator     │ Dark map │
 *   └────────── keys / crystals ────────────┘
 *
 * The Hutch trackers are single pages, so the layout loads them more than
 * once and shows a different part of each copy:
 *   - item tracker A shows only the items (top band). It's the "owner": it
 *     is the only copy that talks to the maps.
 *   - item tracker B shows only the dungeon boxes (bottom band). Its own
 *     broadcasts are muted, and taps on it are replayed on A so both copies
 *     stay identical (autotracking already keeps them in step).
 *   - the map tracker runs twice, one showing the Light World, one the Dark.
 * Loaded before the main script, which hands it the tracker URLs.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'unified-ipad-layout';
  var on = null;           // current mode (null until first load)
  var urls = null;

  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function wantTablet() {
    var p = pref();
    if (p === 'tablet') return true;
    if (p === 'classic') return false;
    return window.innerWidth >= 1000 && window.innerWidth > window.innerHeight;
  }

  // ── styles injected into the tracker copies ────────────────────────────────
  var BASE_CSS =
    'html,body{margin:0!important;padding:0!important;background:#000!important;overflow:hidden!important}' +
    '.tracker-bottom-bar{display:none!important}' +
    '.tracker-container{margin:0!important;position:static!important;left:auto!important;top:auto!important;' +
    'transform:none!important;width:max-content!important}';

  var ITEMS_CSS = BASE_CSS +
    '.tracker-container{display:grid!important;grid-template-columns:auto auto auto;grid-template-rows:auto auto;' +
    'align-items:center;column-gap:6px}' +
    '.tracker-container>.tracker-row:nth-child(1){grid-column:1;grid-row:1/span 2;display:grid!important;' +
    'grid-template-columns:repeat(3,auto);align-content:center;justify-items:center}' +
    '.tracker-container>.tracker-row:nth-child(2){grid-column:2;grid-row:1}' +
    '.tracker-container>.tracker-row:nth-child(3){grid-column:3;grid-row:1}' +
    '.tracker-container>.tracker-row:nth-child(4){grid-column:2;grid-row:2}' +
    '.tracker-container>.tracker-row:nth-child(5){grid-column:3;grid-row:2}' +
    '.tracker-container>.tracker-row:nth-child(n+6){display:none!important}' +
    '.tracker-container .dungeon-slot,.tracker-container .stats-slot{display:none!important}';

  var DUNGEON_CSS = BASE_CSS +
    '.tracker-container{display:flex!important;flex-wrap:nowrap!important;align-items:center;gap:4px}' +
    '.tracker-container>.tracker-row{display:contents!important}' +
    '.tracker-container .item-slot,.tracker-container .bottle-grid,.tracker-container .check-count-box,' +
    '.tracker-container .heart-count-slot,.tracker-container .go-mode{display:none!important}';

  function mapCss(hide) {
    return 'html,body{background:#000!important;overflow:hidden!important}' +
      '#topbar,#bottombar{display:none!important}' +
      '#maps-outer{padding:0!important;margin:0!important;height:100vh!important;display:flex!important;' +
      'align-items:center;justify-content:center;overflow:hidden!important}' +
      '#maps{gap:0!important;margin:0!important}' +
      '#' + hide + '{display:none!important}';
  }

  function inject(frame, css) {
    try {
      var d = frame.contentDocument;
      if (!d || !d.head) return false;
      var s = d.getElementById('unified-tablet-css');
      if (!s) { s = d.createElement('style'); s.id = 'unified-tablet-css'; d.head.appendChild(s); }
      s.textContent = css;
      return true;
    } catch (e) { return false; }
  }

  // ── fitting ────────────────────────────────────────────────────────────────
  function natural(frame) {
    try {
      var c = frame.contentDocument.querySelector('.tracker-container');
      if (!c) return null;
      return { w: Math.ceil(c.scrollWidth), h: Math.ceil(c.scrollHeight) };
    } catch (e) { return null; }
  }

  function place(frame, nat, boxW, boxH, maxScale) {
    var k = Math.min(boxW / nat.w, boxH / nat.h, maxScale);
    frame.style.width = nat.w + 'px';
    frame.style.height = nat.h + 'px';
    frame.style.transform = 'scale(' + k + ')';
    frame.style.left = Math.max(0, (boxW - nat.w * k) / 2) + 'px';
    frame.style.top = Math.max(0, (boxH - nat.h * k) / 2) + 'px';
    return nat.h * k;
  }

  function fitMapFrame(frame, show) {
    try {
      var d = frame.contentDocument, w = frame.contentWindow;
      var wrap = d.getElementById(show);
      if (!wrap) return;
      var size = Math.floor(Math.min(frame.clientWidth, frame.clientHeight));
      if (size < 60) return;
      wrap.style.width = size + 'px';
      wrap.style.height = size + 'px';
      var pct = size / 512 * 100;
      if (w.ZOOM_STEPS) {
        var idx = 0;
        w.ZOOM_STEPS.forEach(function (z, i) { if (z <= pct + 0.5) idx = i; });
        w.zoomIdx = idx;
      }
      d.documentElement.style.setProperty('--mk', pct < 75 ? (pct / 75).toFixed(3) : '1');
    } catch (e) {}
  }

  function fit() {
    if (!on) return;
    var main = document.querySelector('main');
    var W = main.clientWidth, H = main.clientHeight;
    if (!W || !H) return;
    var items = natural($('tab-items')) || { w: 984, h: 112 };
    var dungeons = natural($('tab-dungeons')) || { w: 830, h: 60 };
    // bands take what they need, within limits, and the middle gets the rest
    var topH = Math.min(items.h * Math.min(W / items.w, 1.6), H * 0.2);
    var botH = Math.min(dungeons.h * Math.min(W / dungeons.w, 1.6), H * 0.16);
    var midH = H - topH - botH;
    var center = Math.min(midH * 4 / 3, W * 0.52);   // leave the maps room
    var side = Math.floor((W - center) / 2);
    center = W - side * 2;
    main.style.setProperty('--top', Math.floor(topH) + 'px');
    main.style.setProperty('--bot', Math.floor(botH) + 'px');
    main.style.setProperty('--side', side + 'px');
    main.style.setProperty('--center', center + 'px');
    place($('tab-items'), items, W, Math.floor(topH), 1.6);
    place($('tab-dungeons'), dungeons, W, Math.floor(botH), 1.6);
    fitMapFrame($('tab-map-lw'), 'lw');
    fitMapFrame($('tab-map-dw'), 'dw');
  }
  var fitTimer = null;
  function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 60); }

  // ── taps on the dungeon band are replayed on the items copy ────────────────
  function pathOf(el, root) {
    var p = [];
    while (el && el !== root) {
      var parent = el.parentElement;
      if (!parent) return null;
      p.unshift(Array.prototype.indexOf.call(parent.children, el));
      el = parent;
    }
    return el === root ? p : null;
  }
  function follow(root, path) {
    var el = root;
    for (var i = 0; i < path.length && el; i++) el = el.children[path[i]];
    return el;
  }
  function mirrorInput(srcFrame, dstFrame) {
    try {
      var sd = srcFrame.contentDocument;
      ['click', 'contextmenu', 'mousedown', 'mouseup'].forEach(function (type) {
        sd.addEventListener(type, function (e) {
          if (!e.isTrusted) return;
          try {
            var sroot = sd.querySelector('.tracker-container');
            var droot = dstFrame.contentDocument.querySelector('.tracker-container');
            var path = sroot && droot && pathOf(e.target, sroot);
            var t = path && follow(droot, path);
            if (!t) return;
            var Ev = dstFrame.contentWindow.MouseEvent;
            t.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, button: e.button, buttons: e.buttons,
              shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey }));
          } catch (x) {}
        }, true);
      });
    } catch (e) {}
  }

  // ── frame setup ────────────────────────────────────────────────────────────
  function setupFrames() {
    $('tab-items').addEventListener('load', function () {
      if (!on) return;
      inject(this, ITEMS_CSS);
      fitSoon(); setTimeout(fit, 800);
      try {
        var w = this.contentWindow, c = w.document.querySelector('.tracker-container');
        if (c && w.ResizeObserver) new w.ResizeObserver(fitSoon).observe(c);
      } catch (e) {}
    });
    $('tab-dungeons').addEventListener('load', function () {
      if (!on) return;
      var f = this;
      inject(f, DUNGEON_CSS);
      // only copy A talks to the maps
      try { f.contentWindow._itemsBc = { postMessage: function () {}, close: function () {} }; } catch (e) {}
      mirrorInput(f, $('tab-items'));
      fitSoon(); setTimeout(fit, 800);
      try {
        var w = f.contentWindow, c = w.document.querySelector('.tracker-container');
        if (c && w.ResizeObserver) new w.ResizeObserver(fitSoon).observe(c);
      } catch (e) {}
    });
    [['tab-map-lw', 'dw', 'lw'], ['tab-map-dw', 'lw', 'dw']].forEach(function (m) {
      $(m[0]).addEventListener('load', function () {
        if (!on) return;
        var f = this;
        inject(f, mapCss(m[1]));
        try { if (window.UnifiedApp && window.UnifiedApp.installMapDedupe) window.UnifiedApp.installMapDedupe(f.contentWindow); } catch (e) {}
        var again = function () { fitMapFrame(f, m[2]); };
        setTimeout(again, 60); setTimeout(again, 800);
        try { f.contentWindow.addEventListener('resize', function () { setTimeout(again, 60); }); } catch (e) {}
      });
    });
  }

  function load() {
    if (!urls) return;
    var blank = 'about:blank';
    if (on) {
      $('items-frame').src = blank;
      $('map-frame').src = blank;
      $('tab-items').src = urls.items;
      $('tab-dungeons').src = urls.items;
      $('tab-map-lw').src = urls.map;
      $('tab-map-dw').src = urls.map;
    } else {
      ['tab-items', 'tab-dungeons', 'tab-map-lw', 'tab-map-dw'].forEach(function (id) { $(id).src = blank; });
      $('items-frame').src = urls.items;
      $('map-frame').src = urls.map;
    }
  }

  function apply(force) {
    var t = wantTablet();
    if (t === on && !force) { fitSoon(); return; }
    on = t;
    document.body.classList.toggle('tablet', on);
    load();
    fitSoon();
    // the emulator canvas follows its container; nudge it after a switch
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 120);
  }

  window.UnifiedTablet = {
    active: function () { return !!on; },
    setUrls: function (u) { urls = u; if (on === null) apply(true); else load(); },
    setPref: function (p) { try { localStorage.setItem(KEY, p); } catch (e) {} apply(false); },
    pref: pref,
    fit: fit,
  };

  setupFrames();
  // the randomizer bar opening/closing changes the space the layout gets
  if (window.ResizeObserver) document.addEventListener('DOMContentLoaded', function () {
    var m = document.querySelector('main');
    if (m) new ResizeObserver(function () { if (on) fitSoon(); }).observe(m);
  });
  window.addEventListener('resize', function () { if (on !== null) apply(false); fitSoon(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { apply(false); }, 300); });
})();
