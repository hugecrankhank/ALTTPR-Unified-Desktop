/*
 * Tablet layout (iPad landscape and other wide screens), built on Hutch's own
 * tablet view (his mobile.html + tracker/js/mobile.js):
 *
 *   ┌──────────────── items (two rows) ───────────────┐
 *   │ Light World map │     emulator     │ Dark World map │
 *   └──────────────── twelve dungeons ─────────────────┘
 *
 * Hutch's version does the hard part. Opened with ?mobile=1:
 *   - the item tracker lays itself out as the top and bottom bands, leaves the
 *     middle empty and posts {type:'mobile-mid', top, height} to its parent;
 *   - the map tracker hides its bars and shows Light World left, Dark World
 *     right, with a gap between them kept free for the game.
 * The gap is resizable while playing with the −/+ buttons in the item
 * tracker's bottom bar (stored as 'alttp-mobile-gap'), and the map refits.
 *
 * This file does what his mobile.html does (puts the map in the middle band)
 * and one thing more: it puts the emulator in the gap between the two maps,
 * and follows the gap whenever it changes.
 * Loaded before the main script, which hands it the tracker URLs.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'unified-ipad-layout';
  var GAP_KEY = 'alttp-mobile-gap';   // Hutch's key (js/mobile.js)
  var on = null;           // current mode (null until first load)
  var urls = null;
  var mid = null;          // the middle band the item tracker last reported

  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function wantTablet() {
    var p = pref();
    if (p === 'tablet') return true;
    if (p === 'classic') return false;
    return window.innerWidth >= 1000 && window.innerWidth > window.innerHeight;
  }

  // ── the map goes in the band the item tracker leaves empty ────────────────
  window.addEventListener('message', function (e) {
    if (!on || !e.data || e.data.type !== 'mobile-mid') return;
    if (e.source !== $('tab-items').contentWindow) return;
    mid = { top: Math.round(e.data.top), height: Math.max(0, Math.round(e.data.height)) };
    var m = $('tab-map');
    m.style.top = mid.top + 'px';
    m.style.height = mid.height + 'px';
    placeGameSoon();
  });

  // ── the game goes in the gap between the two maps ─────────────────────────
  var MARGIN = 6;          // breathing room between the game and each map
  function placeGame() {
    if (!on || !mid) return;
    var gw = $('game-wrap'), f = $('tab-map'), d;
    try { d = f.contentDocument; } catch (e) { return; }
    var lw = d && d.getElementById('lw'), dw = d && d.getElementById('dw');
    var left, right;
    if (lw && dw && lw.offsetWidth) {
      left = lw.getBoundingClientRect().right + MARGIN;
      right = dw.getBoundingClientRect().left - MARGIN;
    } else {
      // map not laid out yet: fall back to Hutch's own sum
      var W = f.clientWidth, H = mid.height, g = 0.34;
      try { var v = parseFloat(localStorage.getItem(GAP_KEY)); if (!isNaN(v)) g = v; } catch (e) {}
      var each = Math.floor(Math.min(H, W * (1 - g) / 2));
      left = each + MARGIN; right = W - each - MARGIN;
    }
    var w = Math.max(0, Math.floor(right - left));
    // The emulator letterboxes the SNES picture inside this box, so the game
    // keeps its shape whatever size the gap is.
    gw.style.left = Math.round(left) + 'px';
    gw.style.top = mid.top + 'px';
    gw.style.width = w + 'px';
    gw.style.height = mid.height + 'px';
    if (gw.__lastW !== w || gw.__lastH !== mid.height) {
      gw.__lastW = w; gw.__lastH = mid.height;
      // the emulator canvas follows its container; nudge it
      window.dispatchEvent(new Event('resize'));
    }
  }
  var placeTimer = null;
  function placeGameSoon() { clearTimeout(placeTimer); placeTimer = setTimeout(placeGame, 40); }

  function clearGame() {
    var gw = $('game-wrap');
    ['left', 'top', 'width', 'height'].forEach(function (k) { gw.style[k] = ''; });
    gw.__lastW = gw.__lastH = null;
  }

  // ── frame setup ────────────────────────────────────────────────────────────
  function setupFrames() {
    $('tab-map').addEventListener('load', function () {
      if (!on) return;
      var f = this;
      try { if (window.UnifiedApp && window.UnifiedApp.installMapDedupe) window.UnifiedApp.installMapDedupe(f.contentWindow); } catch (e) {}
      try {
        var w = f.contentWindow;
        // follow the maps whenever Hutch refits them (gap −/+, rotation, band size)
        var watch = function () {
          var lw = w.document.getElementById('lw');
          if (lw && w.ResizeObserver) new w.ResizeObserver(placeGameSoon).observe(lw);
        };
        setTimeout(watch, 200);
        w.addEventListener('resize', placeGameSoon);
      } catch (e) {}
      setTimeout(placeGame, 120); setTimeout(placeGame, 900);
    });
  }

  function withMobile(u) { return u + (u.indexOf('?') === -1 ? '?' : '&') + 'mobile=1'; }

  function load() {
    if (!urls) return;
    var blank = 'about:blank';
    mid = null;
    if (on) {
      $('items-frame').src = blank;
      $('map-frame').src = blank;
      $('tab-items').src = withMobile(urls.items);
      $('tab-map').src = withMobile(urls.map);
    } else {
      ['tab-items', 'tab-map'].forEach(function (id) { $(id).src = blank; });
      $('items-frame').src = urls.items;
      $('map-frame').src = urls.map;
    }
  }

  function apply(force) {
    var t = wantTablet();
    if (t === on && !force) { placeGameSoon(); return; }
    on = t;
    document.body.classList.toggle('tablet', on);
    if (!on) clearGame();
    load();
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 120);
  }

  window.UnifiedTablet = {
    active: function () { return !!on; },
    setUrls: function (u) { urls = u; if (on === null) apply(true); else load(); },
    setPref: function (p) { try { localStorage.setItem(KEY, p); } catch (e) {} apply(false); },
    pref: pref,
    fit: placeGame,
  };

  setupFrames();
  // the gap −/+ in the item tracker writes this key; follow it here too
  window.addEventListener('storage', function (e) { if (e.key === GAP_KEY) placeGameSoon(); });
  window.addEventListener('resize', function (e) {
    // ignore the resize events we send the emulator ourselves
    if (e && e.isTrusted === false) return;
    if (on !== null) apply(false);
  });
  window.addEventListener('orientationchange', function () { setTimeout(function () { apply(false); }, 300); });
})();
