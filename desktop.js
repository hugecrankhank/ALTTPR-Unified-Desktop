/*
 * Desktop layout and pop-out windows.
 *
 * The Desktop layout is the classic one (game on the left, the tracker column
 * on the right) with three additions:
 *
 *   - the tracker column can be resized by dragging its left edge;
 *   - the Items and Map panels can each be popped out into a window of their
 *     own (popout.html), to place anywhere, resize freely, or capture in OBS;
 *   - "Game only" hides everything but the game, for a clean capture.
 *
 * As panels leave, the game grows into the space. Closing a pop-out window (or
 * pressing its Dock button) puts the panel back in the column.
 *
 * Why exactly one copy of each panel: Hutch's tracker is built for several
 * windows that talk over one BroadcastChannel, but it expects a single item
 * tracker and a single map. Two item trackers would each send their own item
 * list to the map and disagree after a manual click. So a panel that pops out
 * is removed from this page, and docking it closes its window.
 *
 * How a pop-out window tracks the game: the tracker page inside it loads
 * bridge/sni-shim.js, which looks for the emulator through window.parent and
 * then window.opener, i.e. this page. Nothing else is needed; the tracker
 * reads game memory exactly as it does when docked.
 *
 * The pop-out windows ask this page for their tracker URL once a second
 * (claim). That one call is also how they reconnect after this page reloads
 * (a new ROM reloads it, since EmulatorJS can't swap games in place), how they
 * learn about a new seed or new tracker settings, and how a window this page no
 * longer expects closes itself.
 *
 * Loaded after tablet.js and before the main script.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PANELS = ['items', 'map'];
  var OUT_KEY = 'unified-desktop-out';        // which panels are popped out
  var GEOM_KEY = 'unified-desktop-geom-';     // + panel: window size and place
  var WIDTH_KEY = 'unified-desktop-dock-w';   // width of the tracker column
  var DEFAULT_SIZE = { items: { w: 520, h: 470 }, map: { w: 940, h: 500 } };
  var NAMES = { items: 'Items', map: 'Map' };

  // A new id for every load of this page. A pop-out that sees it change
  // reloads its tracker, so it starts the new game along with the docked ones.
  var pageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  var active = false;        // Desktop layout on?
  var urls = null;           // { items, map } from the main script
  var out = {};              // panel -> true while popped out
  var wins = {};             // panel -> its window, once it has claimed
  var waiting = {};          // panel -> deadline to claim after a reload

  try { out = JSON.parse(localStorage.getItem(OUT_KEY) || '{}') || {}; } catch (e) { out = {}; }
  // Popped out when this page last closed: those windows may still be open,
  // and get a few seconds to reconnect before their panels come back.
  PANELS.forEach(function (p) { if (out[p]) waiting[p] = Date.now() + 4000; });

  function saveOut() { try { localStorage.setItem(OUT_KEY, JSON.stringify(out)); } catch (e) {} }
  function isOut(p) { return active && !!out[p]; }

  function frameOf(p) { return p === 'items' ? $('items-frame') : $('map-frame'); }

  // ── the page around the panels ─────────────────────────────────────────────
  function paint() {
    var b = document.body;
    PANELS.forEach(function (p) {
      b.classList.toggle(p + '-out', isOut(p));
      var btn = $('pop-' + p);
      if (btn) {
        btn.classList.toggle('on', isOut(p));
        btn.title = isOut(p) ? NAMES[p] + ' is in its own window. Click to put it back here.'
                             : 'Open the ' + NAMES[p].toLowerCase() + ' tracker in its own window';
      }
    });
    b.classList.toggle('all-out', isOut('items') && isOut('map'));
    // With one panel out, the other gets the whole column.
    var fr = $('frames');
    if (fr && active) {
      if (isOut('items') && !isOut('map')) fr.className = 'map-only';
      else if (isOut('map') && !isOut('items')) fr.className = 'items-only';
      else if (!isOut('items') && !isOut('map')) {
        var on = document.querySelector('aside .tabs button.on');
        fr.className = on && on.dataset.view !== 'both' ? on.dataset.view : '';
      }
    }
    // the game and the panels refit to the new space
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }

  // ── popping out ────────────────────────────────────────────────────────────
  function geom(p) {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(GEOM_KEY + p) || 'null'); } catch (e) {}
    var d = DEFAULT_SIZE[p];
    g = g || {};
    var w = Math.max(200, Math.round(g.w || d.w)), h = Math.max(150, Math.round(g.h || d.h));
    var f = 'popup=yes,resizable=yes,width=' + w + ',height=' + h;
    if (typeof g.x === 'number' && typeof g.y === 'number') f += ',left=' + Math.round(g.x) + ',top=' + Math.round(g.y);
    else {
      // first time: beside the main window
      var x = (window.screenX || 0) + (window.outerWidth || 1200) - w - 40 - (p === 'map' ? 0 : 60);
      var y = (window.screenY || 0) + (p === 'map' ? 120 : 60);
      f += ',left=' + Math.max(0, x) + ',top=' + Math.max(0, y);
    }
    return f;
  }

  function popOut(p) {
    if (!active || PANELS.indexOf(p) < 0) return null;
    // Must run inside a click: browsers only allow a pop-up from one.
    var w = window.open('popout.html?panel=' + p, 'alttpr-desktop-' + p, geom(p));
    if (!w) { blocked(); return null; }
    out[p] = true; wins[p] = w; delete waiting[p];
    saveOut();
    // only one copy of each panel: the docked one goes
    frameOf(p).src = 'about:blank';
    paint();
    try { w.focus(); } catch (e) {}
    return w;
  }

  function dock(p, keepWindow) {
    if (!out[p]) return;
    var w = wins[p];
    out[p] = false; delete wins[p]; delete waiting[p];
    saveOut();
    if (w && !keepWindow) { try { w.close(); } catch (e) {} }
    if (active && urls) frameOf(p).src = urls[p];
    paint();
  }

  function toggle(p) { if (isOut(p)) dock(p); else popOut(p); }

  function blocked() {
    var n = $('popup-note');
    if (!n) return;
    n.hidden = false;
    clearTimeout(n.__t);
    n.__t = setTimeout(function () { n.hidden = true; }, 9000);
  }

  // Watch the windows: one closed with its own close button docks its panel,
  // and one that hasn't reconnected after a reload is given up on.
  setInterval(function () {
    var now = Date.now();
    PANELS.forEach(function (p) {
      if (!out[p]) return;
      var w = wins[p];
      if (w) { var closed = true; try { closed = w.closed; } catch (e) {} if (closed) dock(p, true); return; }
      if (waiting[p] && now > waiting[p]) dock(p, true);
    });
  }, 500);

  // ── what the pop-out windows call ──────────────────────────────────────────
  // claim: "I'm the window for panel p; what should I show?"
  //   { url, key } while the panel is out here: key changes with every new
  //   load of this page and every new tracker URL, and the window reloads its
  //   tracker when it does. null when this page doesn't expect the window:
  //   it closes itself.
  function claim(p, w) {
    if (!active || !out[p] || !urls) return null;
    if (wins[p] && wins[p] !== w) {
      var gone = true; try { gone = wins[p].closed; } catch (e) {}
      if (!gone) return null;   // another window already holds this panel
    }
    if (wins[p] !== w) { wins[p] = w; delete waiting[p]; paint(); }
    return { url: urls[p], key: pageId + '|' + urls[p] };
  }

  // ── the tracker column's width ─────────────────────────────────────────────
  function setDockWidth(px) {
    var max = Math.max(300, window.innerWidth - 320);
    px = Math.max(300, Math.min(max, Math.round(px)));
    document.documentElement.style.setProperty('--tracker-w', px + 'px');
    return px;
  }
  function initSplit() {
    var saved = parseFloat(localStorage.getItem(WIDTH_KEY));
    if (!isNaN(saved)) setDockWidth(saved);
    var s = $('dock-split');
    if (!s) return;
    var dragging = false, shield = null, last = null;
    s.addEventListener('pointerdown', function (e) {
      if (!active) return;
      dragging = true; s.setPointerCapture(e.pointerId);
      // the iframes would swallow the pointer while it passes over them
      shield = document.createElement('div');
      shield.style.cssText = 'position:fixed;inset:0;z-index:99;cursor:col-resize';
      document.body.appendChild(shield);
      e.preventDefault();
    });
    s.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      last = setDockWidth(window.innerWidth - e.clientX);
      window.dispatchEvent(new Event('resize'));
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (shield) { shield.remove(); shield = null; }
      if (last) try { localStorage.setItem(WIDTH_KEY, String(last)); } catch (e) {}
    }
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('dblclick', function () {
      try { localStorage.removeItem(WIDTH_KEY); } catch (e) {}
      document.documentElement.style.removeProperty('--tracker-w');
      window.dispatchEvent(new Event('resize'));
    });
  }

  // ── game only ──────────────────────────────────────────────────────────────
  function gameOnly(on) {
    if (on === undefined) on = !document.body.classList.contains('game-only');
    document.body.classList.toggle('game-only', !!on);
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('game-only')) gameOnly(false);
  });

  // ── Hutch's other windows ──────────────────────────────────────────────────
  // His broadcast view (made for stream overlays) and timer. Opened from here,
  // they find the game the same way the pop-outs do.
  function openExtra(which) {
    var w = null;
    if (which === 'broadcast') {
      var bg = 'black';
      try { bg = localStorage.getItem('alttp-tracker-bg') || 'black'; } catch (e) {}
      w = window.open('tracker/broadcast.html?bg=' + encodeURIComponent(bg), 'alttp-broadcast', 'popup=yes,width=500,height=230,resizable=yes');
    } else if (which === 'timer') {
      w = window.open('tracker/timer.html', 'alttp-timer', 'popup=yes,width=340,height=150,resizable=yes');
    }
    if (!w) blocked();
  }

  document.addEventListener('DOMContentLoaded', function () {
    PANELS.forEach(function (p) {
      var b = $('pop-' + p);
      if (b) b.addEventListener('click', function () { toggle(p); });
    });
    var g = $('game-only-btn'); if (g) g.addEventListener('click', function () { gameOnly(true); });
    var x = $('exit-game-only'); if (x) x.addEventListener('click', function () { gameOnly(false); });
    var bc = $('open-broadcast'); if (bc) bc.addEventListener('click', function () { openExtra('broadcast'); });
    var tm = $('open-timer'); if (tm) tm.addEventListener('click', function () { openExtra('timer'); });
    document.querySelectorAll('aside .tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTimeout(paint, 0); });
    });
    initSplit();
    paint();
  });

  window.UnifiedDesktop = {
    // Called by tablet.js whenever the layout changes.
    setActive: function (on) {
      on = !!on;
      if (on === active) return;
      active = on;
      if (!on) {
        // Leaving Desktop: every panel comes home, and its window closes.
        // (Switching to Classic keeps these frames, so they're reloaded
        // here; switching to Tablet or Stacked blanks them right after.)
        PANELS.forEach(function (p) {
          var w = wins[p];
          if (w) { try { w.close(); } catch (e) {} }
          if (out[p] && urls) frameOf(p).src = urls[p];
          delete wins[p]; delete waiting[p];
        });
        out = {}; saveOut();
        document.body.classList.remove('game-only');
      }
      paint();
    },
    active: function () { return active; },
    // Called by tablet.js with the tracker URLs each time it (re)loads them.
    setUrls: function (u) { urls = u; },
    isOut: isOut,
    popOut: popOut,
    dock: dock,
    claim: claim,
    gameOnly: gameOnly,
    openExtra: openExtra,
  };
})();
