/* Where does your photo go?
   All text lives in content.json (inlined as content.inline.js so the page works offline).
   Two modes:
   - kiosk (1280px and wider): one screen at a time, tap or swipe, auto-advance, idle reset
   - scroll (phones and tablets): the pictures pin and the steps scroll past
   No network requests are made at run time. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KIOSK = window.innerWidth >= 1280;
  var mqMobile = window.matchMedia('(max-width: 900px)');

  document.documentElement.classList.toggle('kiosk', KIOSK);
  history.scrollRestoration = 'manual';

  // Reload if the window crosses the kiosk breakpoint, so the right layout is built.
  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if ((window.innerWidth >= 1280) !== KIOSK) location.reload(); }, 400);
  });

  if (window.CONTENT) start(window.CONTENT);
  else fetch('content.json').then(function (r) { return r.json(); }).then(start).catch(function (e) {
    console.error(e);
    var p = document.createElement('p'); p.className = 'nojs';
    p.textContent = 'The text for this page could not be loaded. Run: node tools/inline-content.js';
    document.body.insertBefore(p, $('.hero'));
  });

  function tween(from, to, ms, fn, done) {
    if (reduceMotion) { fn(to); if (done) done(); return function () {}; }
    var t0 = performance.now(), raf = 0, dead = false;
    (function f(now) {
      if (dead) return;
      var p = Math.min(1, (now - t0) / ms);
      fn(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(f); else if (done) done();
    })(t0);
    return function () { dead = true; cancelAnimationFrame(raf); };
  }
  function el(n, a) { var e = document.createElementNS(NS, n); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; }

  function start(C) {
    document.title = C.meta.title;
    var UI = C.ui;

    /* ───────── votes and picks (counts, kept in this browser) ───────── */
    var Tally = {
      key: 'dc-tally-v2',
      load: function () { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } },
      save: function (d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {} },
      add: function (kind, val) {
        var d = this.load(), day = new Date().toISOString().slice(0, 10);
        d[day] = d[day] || { votes: {}, picks: {} };
        d[day][kind][val] = (d[day][kind][val] || 0) + 1;
        this.save(d);
      },
      totals: function (kind) {
        var d = this.load(), t = {};
        Object.keys(d).forEach(function (day) { Object.keys(d[day][kind] || {}).forEach(function (k) { t[k] = (t[k] || 0) + d[day][kind][k]; }); });
        return t;
      },
      csv: function () {
        var d = this.load(), rows = ['date,kind,option,count'];
        Object.keys(d).sort().forEach(function (day) {
          ['votes', 'picks'].forEach(function (kind) { Object.keys(d[day][kind] || {}).forEach(function (k) { rows.push(day + ',' + kind + ',"' + k + '",' + d[day][kind][k]); }); });
        });
        return rows.join('\n');
      }
    };
    var Session = { vote: null, pick: null };

    /* ───────── header ───────── */
    var movements = C.movements.map(function (m) {
      m.live = m.steps.filter(function (s) { return !s.hold; });
      return m;
    });
    var nav = $('#chapterNav');
    var segs = movements.map(function (m) { return { id: m.id, label: m.id + ' ' + m.name, color: m.color, href: '#m' + m.id }; });
    segs.push({ id: 'end', label: C.end.label, color: '#AF9ED7', href: '#end' });
    segs.forEach(function (s) {
      var a = document.createElement('a');
      a.className = 'seg'; a.href = s.href; a.style.setProperty('--c', s.color);
      a.setAttribute('aria-label', s.label);
      a.innerHTML = '<i><b></b></i><span>' + esc(s.label) + '</span>';
      nav.appendChild(a); s.el = a; s.fill = $('b', a);
    });
    $('#heroTitle').textContent = C.hero.title;
    $('#heroCta span').textContent = C.hero.cta;
    $('#endLine').textContent = C.end.line;
    $('#endAgain').textContent = C.end.again;

    /* ───────── steps ───────── */
    var chapters = [];
    movements.forEach(function (m) {
      var sec = $('#m' + m.id);
      var ch = { data: m, sec: sec, stage: $('.stage', sec), stepsEl: $('.steps', sec), stepEls: [], pips: [], active: -1, timers: [], cancel: null };
      sec.style.setProperty('--c', m.color);
      m.live.forEach(function (st) {
        var e = document.createElement('article');
        e.className = 'step'; e.id = 's-' + st.id.replace('.', '-'); e.setAttribute('aria-label', st.title);
        e.innerHTML = stepHTML(st);
        ch.stepsEl.appendChild(e); ch.stepEls.push(e);
      });
      ch.later = function (fn, ms) { ch.timers.push(setTimeout(fn, ms)); };
      chapters.push(ch);
    });
    var byId = {};
    chapters.forEach(function (c) { byId[c.data.id] = c; });

    function stepHTML(st) {
      var h = '<h2 class="step-title">' + esc(st.title) + '</h2>';
      if (st.hint) h += '<p class="hint">' + esc(st.hint) + '</p>';
      if (st.control) h += controlHTML(st.control, st);
      var label = st.source ? st.source.label + (st.source.note ? ' · ' + st.source.note : '') + ' · ' + UI.more : (st.drawer ? UI.more : '');
      if (st.drawer) h += '<button type="button" class="chip" data-drawer="' + st.drawer + '">' + esc(label) + '</button>';
      return h;
    }
    function controlHTML(c) {
      if (c.type === 'grid') return '<div class="ctl"><button type="button" class="pill" data-act="grid" aria-pressed="false">' + esc(c.cut) + '</button></div>';
      if (c.type === 'layers') {
        return '<div class="ctl" role="group" aria-label="' + esc(c.label) + '">' +
          c.layers.map(function (l) { return '<button type="button" class="pill" data-layer="' + l.key + '" style="--pc:' + l.color + '" aria-pressed="false">' + esc(l.label) + '</button>'; }).join('') +
          '</div><div class="ctl"><button type="button" class="btn btn-line" data-act="look">' + esc(c.look) + '</button></div>';
      }
      if (c.type === 'modes') {
        return '<div class="seg-ctl" role="group" aria-label="' + esc(c.label) + '">' +
          C.map.modes.map(function (m) { return '<button type="button" class="pill" data-mode="' + m.key + '" aria-pressed="false">' + esc(m.label) + '</button>'; }).join('') + '</div>';
      }
      if (c.type === 'vote') {
        return '<div class="ctl" role="group" aria-label="Your answer">' +
          c.options.map(function (o) { return '<button type="button" class="pill" data-vote="' + esc(o) + '" aria-pressed="false">' + esc(o) + '</button>'; }).join('') +
          '</div><div class="split" id="voteSplit" aria-live="polite" hidden></div>';
      }
      return '';
    }

    /* ───────── drawer ───────── */
    var drawer = $('#drawer'), drawerBody = $('#drawerBody'), drawerTrigger = null;
    function openDrawer(key, trigger) {
      var d = C.drawers[key]; if (!d) return;
      var h = '<h2>' + esc(d.title) + '</h2>';
      (d.blocks || []).forEach(function (b) { h += '<h3>' + esc(b.h) + '</h3><p' + (b.pending ? ' class="pending"' : '') + '>' + esc(b.p) + '</p>'; });
      if (d.cite) h += '<p class="cite">' + esc(d.cite) + '</p>';
      drawerBody.innerHTML = h; drawerBody.scrollTop = 0; drawer.scrollTop = 0;
      drawerTrigger = trigger || null;
      drawer.removeAttribute('inert'); drawer.setAttribute('aria-hidden', 'false'); drawer.classList.add('open');
      Deck.pause();
      setTimeout(function () { $('#drawerClose').focus({ preventScroll: true }); }, 60);
    }
    function closeDrawer() {
      if (!drawer.classList.contains('open')) return;
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); drawer.setAttribute('inert', '');
      if (drawerTrigger && document.contains(drawerTrigger)) drawerTrigger.focus({ preventScroll: true });
      drawerTrigger = null;
      Deck.resume();
    }
    $('#drawerClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    document.addEventListener('click', function (e) { var t = e.target.closest('[data-drawer]'); if (t) openDrawer(t.dataset.drawer, t); });

    /* ───────── narration (off by default) ───────── */
    var Narr = {
      on: false, text: '', timer: 0, ok: 'speechSynthesis' in window,
      say: function (text) {
        this.text = text; if (!this.on || !this.ok) return;
        var self = this; clearTimeout(this.timer);
        this.timer = setTimeout(function () {
          speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(self.text), v = speechSynthesis.getVoices().filter(function (x) { return /^en/i.test(x.lang); })[0];
          u.rate = .92; u.volume = .9; if (v) u.voice = v; speechSynthesis.speak(u);
        }, 450);
      },
      stop: function () { clearTimeout(this.timer); if (this.ok) speechSynthesis.cancel(); }
    };
    var narrateBtn = $('#narrate');
    function syncNarrate() { narrateBtn.setAttribute('aria-pressed', Narr.on ? 'true' : 'false'); narrateBtn.setAttribute('aria-label', Narr.on ? UI.narrateOn : UI.narrateOff); }
    syncNarrate();
    if (!Narr.ok) narrateBtn.hidden = true;
    narrateBtn.addEventListener('click', function () { Narr.on = !Narr.on; syncNarrate(); if (Narr.on) Narr.say(Narr.text); else Narr.stop(); });
    if (Narr.ok) setInterval(function () { if (Narr.on && speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 5000);
    Narr.text = C.hero.title;

    /* ═══════════════════ pictures ═══════════════════ */
    var V = {};

    /* 2 · inside */
    (function () {
      var cut = $('#cut'), card = $('#serverCard'), layerSel = null, gridOff = false;
      $('#tagBat').textContent = C.cutaway.batteries; $('#tagGen').textContent = C.cutaway.generators; $('#tagOff').textContent = C.cutaway.powerCut;
      $('#serverTitle').textContent = C.cutaway.server.title;
      $('#serverParts').innerHTML = C.cutaway.server.parts.map(function (p) { return '<li><i class="' + (p.photo ? 'has-photo' : '') + '" style="background:' + p.color + '"></i>' + esc(p.label) + '</li>'; }).join('');
      function toggleCard(show) { card.hidden = show === undefined ? !card.hidden : !show; }
      $$('[data-rack]', cut).forEach(function (r) {
        r.addEventListener('click', function () { toggleCard(true); });
        r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(true); } });
      });
      $('#serverClose').addEventListener('click', function () { toggleCard(false); });
      var allLit = '';
      function setGrid(off) {
        gridOff = off; cut.dataset.grid = off ? 'off' : 'on';
        var b = $('[data-act="grid"]');
        if (b) { var c = byId['2'].data.live.filter(function (s) { return s.control && s.control.type === 'grid'; })[0].control; b.textContent = off ? c.restore : c.cut; b.setAttribute('aria-pressed', off ? 'true' : 'false'); }
      }
      document.addEventListener('click', function (e) {
        if (e.target.closest('[data-act="grid"]')) { cut.classList.remove('flicker'); byId['2'].timers.forEach(clearTimeout); setGrid(!gridOff); }
        if (e.target.closest('[data-act="look"]')) openLook();
        var ly = e.target.closest('[data-layer]');
        if (ly) {
          var key = ly.dataset.layer; layerSel = layerSel === key ? null : key;
          $$('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.layer === layerSel ? 'true' : 'false'); });
          cut.dataset.lit = layerSel ? (layerSel === 'power' ? 'power backup' : layerSel) : allLit;
        }
      });
      V.cutaway = {
        enter: function (st, ch) {
          cut.classList.remove('flicker'); cut.dataset.lit = st.lit || ''; cut.dataset.grid = 'on'; gridOff = false;
          if (st.state === 'loop') allLit = st.lit;
          layerSel = null; $$('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          toggleCard(st.state === 'server');
          if (st.state === 'power') {
            setGrid(false);
            ch.later(function () { cut.classList.add('flicker'); ch.later(function () { cut.classList.remove('flicker'); setGrid(true); }, 1700); }, 1800);
          }
        }
      };
    })();

    /* 3 · growing */
    (function () {
      var g = $('#homeDots');
      for (var i = 0; i < 200; i++) {
        var c = el('circle', { 'class': 'hd', cx: 85 + (i % 20) * 50, cy: 140 + Math.floor(i / 20) * 50, r: 16 });
        c.style.setProperty('--k', i); g.appendChild(c);
      }
      $('#rkNormal').textContent = C.racks.normal; $('#rkAi').textContent = C.racks.ai; $('#homesKey').textContent = C.racks.homesKey;
      $('#y24').textContent = C.racks.y2024; $('#y30').textContent = C.racks.y2030; $('#twoX').textContent = C.racks.twice;
    })();

    /* 4 · gain */
    (function () { $('#gnUnused').textContent = C.gain.unused; $('#gnWorld').textContent = C.gain.world; })();

    /* 5 · cost */
    (function () {
      var svg = $('.viz.chain'), N = { mine: 1, make: 4, water: 4, dam: 5, waste: 6, rules: 6 };
      var colors = ['#FDC9B4', '#FDE688', '#A6D4F9', '#CDC1EA', '#A6D4F9', '#E7B9A9'];
      $$('.nd', svg).forEach(function (n, i) { n.classList.add('n' + i); n.style.setProperty('--nf', colors[i]); $('.nl', n).textContent = C.chain.nodes[i]; });
      $$('.lk', svg).forEach(function (n, i) { n.classList.add('l' + i); });
      var wb = $('#wasteBlocks');
      for (var i = 0; i < 50; i++) {
        var r = el('rect', { 'class': 'blk' + (i >= 39 ? ' hot' : ''), x: 174 + (i % 10) * 78, y: 140 + Math.floor(i / 10) * 66, width: 70, height: 58, rx: 5 });
        if (i >= 39) r.style.setProperty('--k', i - 39);
        wb.appendChild(r);
      }
      $('#wRec').textContent = C.chain.recycled; $('#wNot').textContent = C.chain.notRecycled; $('#rulesAsOf').textContent = C.chain.asOf;
      var rows = $('.rules-rows', svg);
      C.chain.rules.forEach(function (t, i) {
        var y = 130 + i * 130, g = el('g');
        g.appendChild(el('rect', { 'class': 'box', x: 395, y: y, width: 56, height: 56, rx: 8 }));
        var tx = el('text', { x: 475, y: y + 42 }); tx.textContent = t; g.appendChild(tx);
        g.appendChild(el('path', { 'class': 'blank', d: 'M475 ' + (y + 80) + ' H735' }));
        rows.appendChild(g);
      });
      V.chain = { enter: function (st) {
        var n = N[st.state] || 0;
        $$('.nd', svg).forEach(function (x, i) { x.classList.toggle('lit', i < n); });
        $$('.lk', svg).forEach(function (x, i) { x.classList.toggle('lit', i < n - 1); });
      } };
    })();

    /* 6 · Nepal: map, balance, vote, wall */
    var mapApi = (function () {
      var stage = byId['6'].stage, g = $('#markers'), legend = $('#legend'), M = C.map.markers, countShown = 0, cancelCount = null;
      $('#mapAsOf').textContent = C.map.asOf;
      function shape(kind) {
        var m = el('g', { 'class': 'mark' }), ink = '#3A3548';
        if (kind === 'solid') m.appendChild(el('circle', { r: 16, fill: ink }));
        else if (kind === 'dr') { m.appendChild(el('circle', { r: 7, fill: ink })); m.appendChild(el('circle', { r: 16, fill: 'none', stroke: ink, 'stroke-width': 3 })); }
        else if (kind === 'area') m.appendChild(el('circle', { r: 9, fill: '#FFFEF9', stroke: ink, 'stroke-width': 3, 'stroke-dasharray': '4 4' }));
        else m.appendChild(el('circle', { r: 14, fill: '#FFFEF9', stroke: ink, 'stroke-width': 3.5 }));
        return m;
      }
      Object.keys(M).forEach(function (k) {
        var d = M[k], mk = el('g', { 'class': 'mk', tabindex: 0, role: 'button', 'data-key': k, transform: 'translate(' + d.x + ' ' + d.y + ')', 'aria-label': d.label + ': details' });
        mk.appendChild(el('circle', { 'class': 'halo2', r: 28 })); mk.appendChild(shape(d.kind)); mk.appendChild(el('circle', { 'class': 'hit', r: 36 }));
        var t = el('text', { x: d.lx - d.x, y: d.ly - d.y + 24, 'text-anchor': d.anchor || 'start' }); t.textContent = d.label; mk.appendChild(t);
        mk.addEventListener('click', function () { showDetail(k); });
        mk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(k); } });
        g.appendChild(mk);
      });
      C.map.legend.forEach(function (l, i) {
        var item = el('g', { transform: 'translate(' + (40 + i * 250) + ' 756)' }), s = shape(l.kind); s.setAttribute('transform', 'translate(14 -9)');
        item.appendChild(s); var t = el('text', { x: 40, y: 0 }); t.textContent = l.label; item.appendChild(t); legend.appendChild(item);
      });
      var card = $('#detailCard');
      function showDetail(k) {
        var d = M[k];
        $$('.mk', g).forEach(function (m) { m.classList.toggle('sel', m.dataset.key === k); });
        $('#detailH').textContent = d.label; $('#detailP').textContent = d.detail; $('#detailS').textContent = d.src; card.hidden = false;
      }
      function hideDetail() { card.hidden = true; $$('.mk', g).forEach(function (m) { m.classList.remove('sel'); }); }
      $('#detailClose').addEventListener('click', hideDetail);
      function showMarkers(keys) { $$('.mk', g).forEach(function (m) { m.classList.toggle('show', keys.indexOf(m.dataset.key) > -1); }); }
      function setMode(key) {
        var m = C.map.modes.filter(function (x) { return x.key === key; })[0];
        $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === key ? 'true' : 'false'); });
        $('#countT').textContent = m.text; $('#countCard').classList.add('on');
        if (cancelCount) cancelCount();
        cancelCount = tween(countShown, +m.count, 400, function (v) { $('#countN').textContent = Math.round(v); countShown = v; });
        showMarkers(m.show); hideDetail();
      }
      document.addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
      V.map = { enter: function (st) {
        hideDetail(); $('#countCard').classList.remove('on'); countShown = 0;
        $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        if (st.state === 'today') showMarkers(C.map.today);
        else if (st.state === 'planned') showMarkers(C.map.planned);
        else showMarkers([]);
        if (st.state === 'balance') renderSplit();
      } };

      // balance panel
      var B = C.balance;
      function col(cls, title, items) { return '<h3>' + esc(title) + '</h3><ul>' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }
      $('#balGain').className = 'bal-col gain'; $('#balGain').innerHTML = col('gain', B.gainTitle, B.gains);
      $('#balCost').className = 'bal-col cost'; $('#balCost').innerHTML = col('cost', B.costTitle, B.costs);

      // vote
      function renderSplit() {
        var box = $('#voteSplit'); if (!box) return;
        if (Session.vote === null) { box.hidden = true; return; }
        var t = Tally.totals('votes'), total = 0, opts = byId['6'].data.live.filter(function (s) { return s.control && s.control.type === 'vote'; })[0].control.options;
        opts.forEach(function (o) { total += t[o] || 0; });
        box.innerHTML = '<p class="split-h">' + esc(B.split) + '</p>' + opts.map(function (o) {
          var pct = total ? Math.round(100 * (t[o] || 0) / total) : 0;
          return '<div class="split-row' + (o === Session.vote ? ' mine' : '') + '"><span>' + esc(o) + '</span><span class="split-bar"><i style="width:' + pct + '%"></i></span><span>' + pct + '%</span></div>';
        }).join('');
        box.hidden = false;
      }
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-vote]'); if (!b || Session.vote !== null) return;
        Session.vote = b.dataset.vote; Tally.add('votes', Session.vote);
        $$('[data-vote]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); x.disabled = x !== b; });
        renderSplit();
      });
      return { clearVote: function () { $$('[data-vote]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); x.disabled = false; }); var s = $('#voteSplit'); if (s) s.hidden = true; } };
    })();

    var wallApi = (function () {
      var wall = $('#wall'), W = C.wall;
      var building = '<div class="wall-mid"><svg viewBox="0 0 600 500" aria-hidden="true"><polygon class="o" fill="#FBF9F3" points="40,200 300,70 560,200 300,330"/><polygon class="o" fill="#F3F0EA" points="40,200 300,330 300,470 40,340"/><polygon class="o" fill="#E9E5DD" points="300,330 560,200 560,340 300,470"/><path d="M70 300 L270 400 M70 260 L270 360 M330 400 L530 300 M330 360 L530 260" stroke="#9A93A6" stroke-width="5" fill="none"/></svg></div>';
      function card(c, i) {
        return '<article class="q-card" style="--q:' + c.color + '" data-card="' + i + '">' +
          '<button type="button" class="q-flip" aria-expanded="false"><strong>' + esc(c.title) + '</strong><small>' + esc(W.tap) + '</small></button>' +
          '<div class="q-back"><h3>' + esc(c.title) + '</h3><ul>' + c.qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' +
          '<div class="q-actions"><button type="button" class="q-pick">' + esc(W.pick) + '</button><button type="button" class="q-close">' + esc(UI.close) + '</button><span class="q-pct"></span></div></div></article>';
      }
      wall.innerHTML = '<div class="wall-col">' + W.cards.slice(0, 3).map(function (c, i) { return card(c, i); }).join('') + '</div>' + building +
        '<div class="wall-col">' + W.cards.slice(3).map(function (c, i) { return card(c, i + 3); }).join('') + '</div>';
      function pcts() {
        var t = Tally.totals('picks'), total = 0; W.cards.forEach(function (c) { total += t[c.key] || 0; });
        $$('.q-card').forEach(function (k) {
          var c = W.cards[+k.dataset.card], p = $('.q-pct', k);
          p.textContent = Session.pick && total ? Math.round(100 * (t[c.key] || 0) / total) + '% ' + W.others : '';
        });
      }
      document.addEventListener('click', function (e) {
        var k = e.target.closest('.q-card'); if (!k) return; var c = W.cards[+k.dataset.card];
        if (e.target.closest('.q-flip')) { k.classList.add('open'); $('.q-flip', k).setAttribute('aria-expanded', 'true'); }
        else if (e.target.closest('.q-close')) { k.classList.remove('open'); $('.q-flip', k).setAttribute('aria-expanded', 'false'); $('.q-flip', k).focus({ preventScroll: true }); }
        else if (e.target.closest('.q-pick') && !Session.pick) {
          Session.pick = c.key; Tally.add('picks', c.key);
          $$('.q-card').forEach(function (x) { var on = x === k; x.classList.toggle('picked', on); var b = $('.q-pick', x); b.disabled = true; if (on) b.textContent = W.picked; });
          pcts();
        }
      });
      if (!KIOSK && mqMobile.matches) {
        var holder = document.createElement('div'); holder.className = 'wall-cards';
        $$('.q-card', wall).forEach(function (c) { holder.appendChild(c); });
        var last = byId['6'].stepEls[byId['6'].stepEls.length - 1]; last.appendChild(holder);
      }
      return { clear: function () { $$('.q-card').forEach(function (x) { x.classList.remove('open', 'picked'); $('.q-flip', x).setAttribute('aria-expanded', 'false'); var b = $('.q-pick', x); b.disabled = false; b.textContent = W.pick; $('.q-pct', x).textContent = ''; }); } };
    })();

    /* ═══════════════════ engine ═══════════════════ */
    var heroEl = $('#top'), endSec = $('#end'), end2 = $('#end-2'), look = $('#look'), bar = $('#bar');

    function activate(ch, idx) {
      ch.active = idx;
      ch.timers.forEach(clearTimeout); ch.timers = [];
      if (ch.cancel) { ch.cancel(); ch.cancel = null; }
      ch.stepEls.forEach(function (e, i) { e.classList.toggle('on', i === idx); });
      var st = ch.data.live[idx];
      ch.stage.dataset.state = st.state; ch.stage.dataset.photo = st.photo ? '1' : '0';
      var v = V[ch.data.visual]; if (v && v.enter) v.enter(st, ch);
      Narr.say(st.title);
    }

    /* ── kiosk deck ── */
    var Deck = (function () {
      var screens = [{ kind: 'hero', el: heroEl, ms: 0 }];
      chapters.forEach(function (ch) { ch.data.live.forEach(function (st, i) { screens.push({ kind: 'step', ch: ch, idx: i, el: ch.sec, ms: st.wait ? 12000 : 6000 }); }); });
      screens.push({ kind: 'end1', el: endSec, ms: 8000 }, { kind: 'end2', el: end2, ms: 10000 });
      var cur = 0, T = 0, remaining = 0, startedAt = 0, paused = 0, inLook = false, backIdx = 0;
      var navEl = $('#deckNav'), nextBtn = $('#deckNext'), backBtn = $('#deckBack'), ring = $('#ringFg');

      function arm(ms) {
        clearTimeout(T); nextBtn.classList.remove('run');
        if (!ms) return;
        remaining = ms; startedAt = performance.now();
        void ring.getBoundingClientRect();
        nextBtn.style.setProperty('--ring-dur', ms + 'ms'); nextBtn.classList.add('run'); nextBtn.classList.toggle('paused', !!paused);
        if (!paused) T = setTimeout(function () { next(true); }, ms);
      }
      function show(i) {
        cur = Math.max(0, Math.min(screens.length - 1, i)); inLook = false; look.hidden = true;
        var sc = screens[cur];
        $$('.screen').forEach(function (e) { e.classList.remove('is-on'); });
        sc.el.classList.add('is-on');
        if (sc.kind === 'step') { activate(sc.ch, sc.idx); }
        else { Narr.say(sc.kind === 'hero' ? C.hero.title : (sc.kind === 'end2' ? C.end.line : '')); }
        var mi = sc.kind === 'step' ? chapters.indexOf(sc.ch) : (sc.kind === 'hero' ? -1 : segs.length - 1);
        segs.forEach(function (s, k) {
          var f = mi < 0 ? 0 : (k < mi ? 1 : (k > mi ? 0 : (sc.kind === 'step' ? (sc.idx + 1) / sc.ch.data.live.length : 1)));
          s.fill.style.width = (f * 100) + '%';
          if (k === mi) s.el.setAttribute('aria-current', 'true'); else s.el.removeAttribute('aria-current');
        });
        document.body.dataset.header = sc.kind === 'end2' ? 'dark' : 'light';
        navEl.classList.toggle('dark', sc.kind === 'end2');
        navEl.hidden = false; backBtn.hidden = cur === 0; nextBtn.hidden = cur === 0;
        nextBtn.style.setProperty('--c', sc.ch ? sc.ch.data.color : '#AF9ED7');
        paused = paused && drawer.classList.contains('open') ? paused : 0;
        arm(sc.ms); Idle.arm();
      }
      function next(auto) {
        if (inLook) { closeLook(); return; }
        if (cur >= screens.length - 1) { reset(); return; }
        show(cur + 1);
      }
      function prev() { if (inLook) { closeLook(); return; } if (cur > 0) show(cur - 1); }
      function pause() { if (paused) return; paused = 1; clearTimeout(T); remaining -= performance.now() - startedAt; nextBtn.classList.add('paused'); }
      function resume() { if (!KIOSK || !paused) return; if (drawer.classList.contains('open') || inLook || Idle.visible()) return; paused = 0; nextBtn.classList.remove('paused'); startedAt = performance.now(); if (remaining > 0 && screens[cur].ms) T = setTimeout(function () { next(true); }, remaining); }
      function reset() {
        Session.vote = null; Session.pick = null; mapApi.clearVote(); wallApi.clear();
        Narr.on = false; Narr.stop(); syncNarrate();
        closeDrawerSilently(); look.hidden = true; inLook = false; paused = 0;
        Idle.hide(); show(0);
      }
      function firstOf(mi) { for (var i = 0; i < screens.length; i++) if (screens[i].ch === chapters[mi]) return i; return 0; }
      function showLookScreen() {
        backIdx = cur; inLook = true; clearTimeout(T); nextBtn.classList.remove('run');
        $$('.screen').forEach(function (e) { e.classList.remove('is-on'); });
        look.hidden = false; look.classList.add('is-on');
      }
      function leaveLook() { show(backIdx); }
      return { screens: screens, show: show, next: next, prev: prev, pause: pause, resume: resume, reset: reset, firstOf: firstOf, arm: arm, current: function () { return cur; }, showLookScreen: showLookScreen, leaveLook: leaveLook, isLook: function () { return inLook; }, isPaused: function () { return !!paused; } };
    })();

    function closeDrawerSilently() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); drawer.setAttribute('inert', ''); }

    /* ── idle reset ── */
    var Idle = (function () {
      var t = 0, c = 0, ci = 0, box = $('#idle'), shown = false;
      $('#idleT').textContent = UI.idle.title; $('#idleGo').textContent = UI.idle.continue;
      function arm() { clearTimeout(t); if (!KIOSK) return; t = setTimeout(show, 60000); }
      function show() {
        if (Deck.current() === 0 && !Deck.isLook()) { arm(); return; }
        shown = true; box.hidden = false; Deck.pause(); c = 10; tick();
        ci = setInterval(function () { c--; if (c <= 0) { clearInterval(ci); Deck.reset(); } else tick(); }, 1000);
      }
      function tick() { $('#idleN').textContent = UI.idle.restart.replace('{n}', c); }
      function hide() { clearInterval(ci); if (!shown) return; shown = false; box.hidden = true; }
      function bump() { if (shown) { hide(); Deck.resume(); } arm(); }
      $('#idleGo').addEventListener('click', function (e) { e.stopPropagation(); bump(); });
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { if (!shown) arm(); }, { passive: true, capture: true }); });
      return { arm: arm, hide: hide, bump: bump, visible: function () { return shown; } };
    })();

    /* ── kiosk input: tap or swipe ── */
    if (KIOSK) {
      var INTERACTIVE = 'button, a, input, label, [role="button"], [tabindex], .mk, .rack, .q-card, .cost, .drawer, .idle, .bar, .deck-nav, .staff, .viewer, .server-card, .detail-card';
      var down = null;
      document.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: e.target }; var hit = e.target.closest(INTERACTIVE); if (hit && !e.target.closest('.drawer, .idle, .bar, .deck-nav') && Deck.screens[Deck.current()].ms && !Deck.isPaused()) Deck.arm(6000); }, true);
      document.addEventListener('pointerup', function (e) {
        if (!down) return; var dx = e.clientX - down.x, dy = e.clientY - down.y, t = down.t; down = null;
        if (Idle.visible()) return;
        if (drawer.classList.contains('open')) { if (!t.closest('.drawer') && !t.closest('[data-drawer]')) closeDrawer(); return; }
        if (t.closest('.viewer')) return;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 90) { if (dx < 0) Deck.next(); else Deck.prev(); return; }
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && !t.closest(INTERACTIVE)) Deck.next();
      });
      $('#deckNext').addEventListener('click', function () { Deck.next(); });
      $('#deckBack').addEventListener('click', function () { Deck.prev(); });
      $('#heroCta').addEventListener('click', function (e) { e.preventDefault(); Deck.next(); });
      $('#endAgain').addEventListener('click', function (e) { e.preventDefault(); Deck.reset(); });
      segs.forEach(function (s, k) { s.el.addEventListener('click', function (e) { e.preventDefault(); Deck.show(k < chapters.length ? Deck.firstOf(k) : Deck.screens.length - 2); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') Deck.next(); else if (e.key === 'ArrowLeft') Deck.prev(); });
      Deck.show(0);
    }

    /* ── scroll mode (phones, tablets) ── */
    var ticking = false;
    function probeY() {
      var vh = window.innerHeight, bh = bar.offsetHeight, top = bh;
      if (mqMobile.matches) { var st = $('.stage', chapters[0].sec); top = bh + (st ? st.offsetHeight : 0); }
      return top + (vh - top) / 2;
    }
    function goToStep(ch, i) {
      var e = ch.stepEls[i]; if (!e) return;
      var r = e.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - probeY(), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    function update() {
      ticking = false;
      var p = probeY(), bh = bar.offsetHeight, current = null;
      chapters.forEach(function (ch, ci) {
        var r = ch.sec.getBoundingClientRect();
        segs[ci].fill.style.width = (clamp((p - r.top) / r.height, 0, 1) * 100) + '%';
        if (r.top <= p && r.bottom > p) {
          current = segs[ci]; var idx = 0;
          for (var i = 0; i < ch.stepEls.length; i++) { if (ch.stepEls[i].getBoundingClientRect().top <= p) idx = i; }
          if (idx !== ch.active) activate(ch, idx);
        }
      });
      var e1 = endSec.getBoundingClientRect(), e2 = end2.getBoundingClientRect();
      segs[segs.length - 1].fill.style.width = (clamp((p - e1.top) / (e2.bottom - e1.top), 0, 1) * 100) + '%';
      if (e1.top <= p && e2.bottom > p) current = segs[segs.length - 1];
      segs.forEach(function (s) { if (s === current) s.el.setAttribute('aria-current', 'true'); else s.el.removeAttribute('aria-current'); });
      var dark = false, y = bh / 2;
      $$('[data-theme="dark"]').forEach(function (s) { var r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) dark = true; });
      document.body.dataset.header = dark ? 'dark' : 'light';
    }
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    if (!KIOSK) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule); window.addEventListener('load', schedule);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
      update();
    }

    /* ── the chain runs backwards (end) ── */
    (function () {
      var svg = $('#reverse'), nodes = $$('.rv', svg), dot = $('.rv-dot', svg), dotC = $('circle', dot), cancel = null;
      svg.setAttribute('aria-label', C.end.journeyLabel);
      var xs = [170, 430, 690, 950, 1210, 1470, 1730];
      function run() {
        nodes.forEach(function (n) { n.classList.remove('lit'); }); dot.classList.add('go');
        if (cancel) cancel();
        if (reduceMotion) { nodes.forEach(function (n) { n.classList.add('lit'); }); dot.classList.remove('go'); return; }
        cancel = tween(xs[0], xs[6], KIOSK ? 6800 : 7600, function (x) {
          dotC.setAttribute('cx', x); nodes.forEach(function (n, i) { if (x >= xs[i] - 2) n.classList.add('lit'); });
          if (endSec.scrollWidth > endSec.clientWidth) endSec.scrollLeft = (x / 1920) * endSec.scrollWidth - endSec.clientWidth / 2;
        }, function () { dot.classList.remove('go'); });
      }
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) run();
        else { if (cancel) cancel(); nodes.forEach(function (n) { n.classList.remove('lit'); }); dot.classList.remove('go'); }
      }, { threshold: .55 }).observe(endSec);
      new IntersectionObserver(function (en) { end2.classList.toggle('in', en[0].isIntersecting); }, { threshold: .35 }).observe(end2);
    })();

    /* ── staff export ── */
    if (/[?&]staff/.test(location.search)) {
      var sb = $('#staffExport'); sb.hidden = false; sb.textContent = UI.staffExport;
      sb.addEventListener('click', function () {
        var blob = new Blob([Tally.csv()], { type: 'text/csv' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'votes-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      });
    }

    /* ═══════════════════ 3D · look closer ═══════════════════ */
    var viewerReady = false, viewerLoading = false, M3 = C.model3d;
    $('#lookTitle').textContent = M3.title; $('#lookSub').textContent = M3.sub; $('#lookBackLabel').textContent = M3.back;
    $('#viewerFsLabel').textContent = M3.fullscreen; $('#viewerMsg').textContent = M3.loading;
    function openLook() {
      if (KIOSK) Deck.showLookScreen(); else { look.hidden = false; look.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
      if (!viewerReady && !viewerLoading) loadViewer(); else window.dispatchEvent(new Event('resize'));
    }
    function closeLook() {
      if (KIOSK) { look.classList.remove('is-on'); Deck.leaveLook(); return; }
      look.hidden = true; goToStep(byId['2'], byId['2'].stepEls.length - 1);
    }
    $('#lookBack').addEventListener('click', closeLook);
    function loadViewer() {
      viewerLoading = true;
      var s = document.createElement('script'); s.src = 'vendor/three.min.js';
      s.onload = function () { try { initViewer(window.THREE); viewerReady = true; $('#viewerMsg').hidden = true; } catch (e) { console.error(e); fail(); } };
      s.onerror = fail; document.head.appendChild(s);
      function fail() { viewerLoading = false; $('#viewerMsg').textContent = M3.failed; }
    }

    function initViewer(THREE) {
      var wrap = $('#viewer'), canvas = $('#viewerCanvas'), tip = $('#viewerTip'), card = $('#viewerCard'), COMP = {};
      Object.keys(M3.components).forEach(function (k) { var d = M3.components[k]; COMP[k] = { label: d.label, hex: d.hex, desc: d.desc, color: parseInt(d.hex.replace('#', ''), 16) }; });
      var INK = 0x4A4558;
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
      var scene = new THREE.Scene(); scene.background = new THREE.Color(0xF6F3EC); scene.fog = new THREE.Fog(0xF6F3EC, 34, 64);
      var camera = new THREE.PerspectiveCamera(45, 1, .1, 200);
      scene.add(new THREE.AmbientLight(0xffffff, .62));
      var sun = new THREE.DirectionalLight(0xffffff, .62); sun.position.set(10, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
      ['left', 'bottom'].forEach(function (k) { sun.shadow.camera[k] = -20; }); ['right', 'top'].forEach(function (k) { sun.shadow.camera[k] = 20; });
      sun.shadow.camera.far = 80; scene.add(sun);
      var fill = new THREE.DirectionalLight(0xAF9ED7, .25); fill.position.set(-8, 6, -8); scene.add(fill);
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ color: 0xEDE8DF, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      scene.add(new THREE.GridHelper(26, 26, 0xD9D4CC, 0xE3DED5));
      function mat(c, e) { return new THREE.MeshStandardMaterial({ color: c, emissive: e || 0, emissiveIntensity: e ? .25 : 0, roughness: .75, metalness: .05 }); }
      function box(w, h, d, c, x, y, z, e) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, e)); m.position.set(x, y, z); return m; }
      function build(type, x, z) {
        var def = COMP[type], col = def.color, g = new THREE.Group(), i;
        g.userData = { type: type, def: def };
        if (type === 'server_rack') { g.add(box(1, 2.2, .7, col, 0, 1.1, 0)); for (i = 0; i < 5; i++) g.add(box(.85, .06, .02, INK, 0, .4 + i * .35, .36)); g.add(box(.05, 1.6, .04, 0x3DDC97, -.42, 1.1, .36, 0x3DDC97)); }
        else if (type === 'cooling_unit') { g.add(box(1.2, 1.8, .9, col, 0, .9, 0)); for (i = 0; i < 6; i++) g.add(box(1.1, .06, .08, INK, 0, .3 + i * .25, .46)); var f = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .08, 16), mat(INK)); f.rotation.x = Math.PI / 2; f.position.set(0, 1.5, .48); g.add(f); }
        else if (type === 'ups') { g.add(box(.9, 2, .7, col, 0, 1, 0)); for (i = 0; i < 4; i++) g.add(box(.7, .25, .08, INK, 0, .4 + i * .38, .36)); var l = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 8), mat(0xFFB800, 0xFFB800)); l.position.set(.3, 1.9, .36); g.add(l); }
        else if (type === 'generator') { g.add(box(2.2, .15, 1.1, INK, 0, .07, 0)); g.add(box(2, 1.1, 1, col, 0, .7, 0)); var p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .7, 8), mat(INK)); p.position.set(.7, 1.6, 0); g.add(p); for (i = 0; i < 4; i++) g.add(box(.04, .12, .8, INK, -.7 + i * .3, .7, .5)); }
        else if (type === 'network_core') { g.add(box(1.6, .6, 1.6, col, 0, .3, 0)); for (i = 0; i < 8; i++) g.add(box(.1, .07, .04, INK, -.6 + i * .17, .35, .82)); var s = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), mat(0x00AEEF, 0x00AEEF)); s.position.set(.65, .55, .82); g.add(s); }
        else if (type === 'pdu') { g.add(box(.25, 1.8, .25, col, 0, .9, 0)); for (i = 0; i < 6; i++) g.add(box(.2, .1, .06, INK, 0, .3 + i * .25, .15)); }
        else if (type === 'fire_suppression') { var b = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.1, 12), mat(col)); b.position.y = .55; g.add(b); var v = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .25, 8), mat(INK)); v.position.y = 1.22; g.add(v); var n = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 8), mat(INK)); n.position.y = 1.38; g.add(n); }
        else if (type === 'security_desk') { g.add(box(1.8, .08, .8, col, 0, .75, 0)); g.add(box(.8, .08, .8, col, -.5, .75, .8)); g.add(box(.08, .75, .08, INK, -.8, .37, 0)); g.add(box(.08, .75, .08, INK, .8, .37, 0)); g.add(box(.6, .4, .04, INK, 0, 1.1, -.1)); g.add(box(.54, .34, .01, 0x77C0F7, 0, 1.1, -.08, 0x77C0F7)); }
        g.position.set(x, 0, z); return g;
      }
      var all = [];
      M3.layout.forEach(function (row) { row.positions.forEach(function (pos) {
        var g = build(row.type, pos[0], pos[1]);
        g.traverse(function (c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.group = g; all.push(c); } });
        scene.add(g);
      }); });
      var sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(11, 9.5, 14.5)), target = new THREE.Vector3(), goal = new THREE.Vector3();
      function place() { sph.phi = clamp(sph.phi, .15, Math.PI / 2.1); sph.radius = clamp(sph.radius, 6, 50); camera.position.setFromSpherical(sph).add(target); camera.lookAt(target); }
      place();
      var ptrs = {}, pinch = 0, down = null;
      var pc = function () { return Object.keys(ptrs).length; };
      canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, n: pc() }; canvas.style.cursor = 'grabbing';
        if (pc() === 2) { var k = Object.keys(ptrs).map(function (i) { return ptrs[i]; }); pinch = Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
      });
      canvas.addEventListener('pointermove', function (e) {
        var pr = ptrs[e.pointerId]; if (!pr) { hover(e); return; }
        var dx = e.clientX - pr.x, dy = e.clientY - pr.y; pr.x = e.clientX; pr.y = e.clientY;
        if (pc() === 1) { sph.theta -= dx * .008; sph.phi -= dy * .008; place(); }
        else if (pc() === 2) { var k = Object.keys(ptrs).map(function (i) { return ptrs[i]; }), d = Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); if (pinch) { sph.radius *= pinch / d; place(); } pinch = d; }
      });
      function up(e) {
        var moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
        if (ptrs[e.pointerId] && pc() === 1 && down && down.n === 1 && !moved && e.type === 'pointerup') pick(e);
        delete ptrs[e.pointerId]; pinch = 0; canvas.style.cursor = 'grab';
      }
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', function (e) { if (!(e.ctrlKey || e.metaKey || document.fullscreenElement || wrap.classList.contains('fs-mode'))) return; e.preventDefault(); sph.radius *= 1 + e.deltaY * .001; place(); }, { passive: false });
      var ray = new THREE.Raycaster(), m2 = new THREE.Vector2(), saved = [];
      function hitAt(e) { var r = canvas.getBoundingClientRect(); m2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(m2, camera); var h = ray.intersectObjects(all); return h.length ? h[0].object.userData.group : null; }
      function hover(e) {
        var g = hitAt(e);
        if (g) { var r = wrap.getBoundingClientRect(); tip.textContent = g.userData.def.label; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top - 6) + 'px'; tip.classList.add('show'); canvas.style.cursor = 'pointer'; }
        else { tip.classList.remove('show'); canvas.style.cursor = 'grab'; }
      }
      function clearHl() { saved.forEach(function (s) { s.m.emissive.setHex(s.e); s.m.emissiveIntensity = s.i; }); saved = []; }
      function highlight(g) { clearHl(); g.traverse(function (c) { if (!c.isMesh) return; saved.push({ m: c.material, e: c.material.emissive.getHex(), i: c.material.emissiveIntensity }); if (c.material.emissive.getHex() === 0) { c.material.emissive.setHex(g.userData.def.color); c.material.emissiveIntensity = .38; } else c.material.emissiveIntensity = .7; }); }
      function show(def) { $('#vcSwatch').style.background = def.hex; $('#vcName').textContent = def.label; $('#vcDesc').textContent = def.desc; card.hidden = false; }
      function pick(e) { var g = hitAt(e); if (g) { highlight(g); show(g.userData.def); } else { clearHl(); card.hidden = true; } }
      $('#viewerCardClose').addEventListener('click', function () { card.hidden = true; clearHl(); });
      var chips = $('#viewerChips');
      Object.keys(COMP).forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'vchip'; b.style.setProperty('--vc', COMP[k].hex + '66'); b.textContent = COMP[k].label;
        b.addEventListener('click', function () { var f = null; scene.traverse(function (o) { if (!f && o.isGroup && o.userData.type === k) f = o; }); if (f) { highlight(f); show(COMP[k]); goal.set(f.position.x * .5, 0, f.position.z * .5); } });
        chips.appendChild(b);
      });
      function size() { var w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      size(); window.addEventListener('resize', size);
      var raf = 0;
      function frame() { raf = requestAnimationFrame(frame); if (target.distanceToSquared(goal) > .0004) { target.lerp(goal, .1); place(); } renderer.render(scene, camera); }
      new IntersectionObserver(function (en) { if (en[0].isIntersecting) { size(); if (!raf) frame(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } }).observe(canvas);
      var fs = $('#viewerFs'), fsl = $('#viewerFsLabel'), manual = false;
      function label(on) { fsl.textContent = on ? M3.exit : M3.fullscreen; }
      function setManual(on) { manual = on; wrap.classList.toggle('fs-mode', on); document.body.classList.toggle('fs-lock', on); label(on); setTimeout(size, 60); }
      fs.addEventListener('click', function () {
        if (manual) return setManual(false);
        if (document.fullscreenElement) return document.exitFullscreen();
        if (!wrap.requestFullscreen) return setManual(true);
        Promise.resolve(wrap.requestFullscreen()).then(function () { setTimeout(size, 100); }).catch(function () { setManual(true); });
      });
      document.addEventListener('fullscreenchange', function () { if (!manual) { label(!!document.fullscreenElement); setTimeout(size, 100); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && manual) setManual(false); });
    }
  }
})();
