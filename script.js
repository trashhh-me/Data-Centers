/* Where does the internet live?
   Text lives in content.json. This file builds the page from it, drives the
   scroll story, and handles the little interactions. No framework. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var NS = 'http://www.w3.org/2000/svg';
  var mqMobile = window.matchMedia('(max-width: 900px)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  history.scrollRestoration = 'manual';

  fetch('content.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function (e) {
      console.error(e);
      var p = document.createElement('p');
      p.className = 'nojs';
      p.textContent = 'The text for this page could not be loaded (content.json). If you opened the file directly, serve the folder instead, for example: python3 -m http.server';
      document.body.insertBefore(p, $('.hero'));
    });

  /* tween helper: returns a cancel function */
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

  function start(C) {
    document.title = C.meta.title;
    var UI = C.ui;

    /* ───────── hero ───────── */
    $('#heroEyebrow').textContent = C.hero.eyebrow;
    $('#heroTitle').textContent = C.hero.title;
    $('#heroSub').textContent = C.hero.sub;
    $('#heroCta span').textContent = C.hero.cta;
    (function () {
      var w = $('#heroWord'), i = 0, words = C.hero.words;
      w.textContent = words[0];
      if (reduceMotion) return;
      setInterval(function () {
        i = (i + 1) % words.length;
        var n = w.cloneNode(false); n.textContent = words[i];
        w.parentNode.replaceChild(n, w); w = n;
      }, 1800);
    })();

    /* ───────── steps ───────── */
    var chapters = [];
    C.chapters.forEach(function (cd) {
      var sec = $('#ch-' + cd.id);
      var ch = { data: cd, sec: sec, stage: $('.stage', sec), stepsEl: $('.steps', sec), stepEls: [], pips: [], active: -1, timers: [], cancel: null };
      sec.style.setProperty('--c', cd.color);
      cd.steps.forEach(function (st, i) {
        var el = document.createElement('article');
        el.className = 'step' + (st.small ? ' small' : '');
        el.id = 's-' + st.id.replace('.', '-');
        el.setAttribute('aria-label', st.id);
        el.innerHTML = stepHTML(st);
        ch.stepsEl.appendChild(el);
        ch.stepEls.push(el);
      });
      var pipList = $('.pips', sec);
      if (pipList) {
        cd.steps.forEach(function (st, i) {
          var li = document.createElement('li');
          var b = document.createElement('button');
          b.type = 'button'; b.setAttribute('aria-label', 'Step ' + st.id);
          b.addEventListener('click', function () { goToStep(ch, i); });
          li.appendChild(b); pipList.appendChild(li); ch.pips.push(b);
        });
        pipList.setAttribute('aria-label', UI.stepNav);
      }
      ch.later = function (fn, ms) { ch.timers.push(setTimeout(fn, ms)); };
      chapters.push(ch);
    });
    var byId = {};
    chapters.forEach(function (c) { byId[c.data.id] = c; });

    function stepHTML(st) {
      var h = '<p class="eyebrow">' + esc(st.eyebrow) + '</p>';
      var title = esc(st.title).replace('{time}', '<span class="clock-time" data-clock-time>00:00</span>');
      h += '<h2 class="step-title">' + title + '</h2>';
      if (st.lead) h += '<p class="lead">' + esc(st.lead) + '</p>';
      if (st.note) h += '<p class="note">' + esc(st.note) + '</p>';
      if (st.hint) h += '<p class="hint">' + esc(st.hint) + '</p>';
      if (st.quote) {
        h += '<div class="quote"><p>' + esc(st.quote.term) + '</p><p>' + esc(st.quote.text) + '</p>' +
          '<button type="button" class="chip" data-drawer="' + st.quote.source.drawer + '">' + esc(st.quote.source.label) + '</button></div>';
      }
      if (st.control) h += controlHTML(st.control);
      if (st.source) h += '<button type="button" class="chip" data-drawer="' + st.source.drawer + '">' + esc(st.source.label) + '</button>';
      return h;
    }

    function controlHTML(c) {
      var h = '';
      if (c.type === 'grid') {
        h = '<div class="ctl"><button type="button" class="pill" data-act="grid" aria-pressed="false">' + esc(c.cut) + '</button></div>';
      } else if (c.type === 'layers') {
        h = '<div class="ctl" role="group" aria-label="' + esc(c.label) + '"><span class="ctl-label">' + esc(c.label) + '</span>' +
          c.layers.map(function (l) { return '<button type="button" class="pill" data-layer="' + l.key + '" style="--pc:' + l.color + '" aria-pressed="false">' + esc(l.label) + '</button>'; }).join('') +
          '</div><div class="ctl"><button type="button" class="btn btn-line" data-act="look">' + esc(c.look) + '</button></div>';
      } else if (c.type === 'clock') {
        h = '<div class="ctl"><input class="range" type="range" min="0" max="1440" step="5" value="0" aria-label="' + esc(c.label) + '" data-clock-range></div>';
      } else if (c.type === 'trace') {
        h = '<div class="ctl"><button type="button" class="pill" data-act="trace" aria-pressed="false">' + esc(c.show) + '</button></div>';
      } else if (c.type === 'guess') {
        h = '<div class="ctl" role="group" aria-label="Your guess">' +
          c.options.map(function (o) { return '<button type="button" class="pill" data-guess="' + esc(o) + '" aria-pressed="false">' + esc(o) + '</button>'; }).join('') +
          '</div><p class="answer" id="guessAnswer" aria-live="polite"></p>';
      } else if (c.type === 'modes') {
        h = '<div class="seg-ctl" role="group" aria-label="' + esc(c.label) + '">' +
          C.map.modes.map(function (m) { return '<button type="button" class="pill" data-mode="' + m.key + '" aria-pressed="false">' + esc(m.label) + '</button>'; }).join('') + '</div>';
      } else if (c.type === 'paths') {
        h = '<div class="ctl" role="group" aria-label="' + esc(c.label) + '">' +
          C.afterlife.paths.map(function (p, i) { return '<button type="button" class="pill" style="--pc:#FDC9B4" data-path="' + i + '" aria-pressed="false">' + esc(p.label) + '</button>'; }).join('') +
          '</div><div class="answer-box" id="pathAnswer" aria-live="polite"></div>';
      }
      return h;
    }

    /* ───────── drawer ───────── */
    var drawer = $('#drawer'), drawerBody = $('#drawerBody'), drawerTrigger = null;
    $('#drawerEyebrow').textContent = UI.explainer;
    function openDrawer(key, trigger) {
      var d = C.drawers[key]; if (!d) return;
      var h = '<h2>' + esc(d.title) + '</h2>';
      (d.blocks || []).forEach(function (b) { h += '<h3>' + esc(b.h) + '</h3><p>' + esc(b.p) + '</p>'; });
      if (d.terms) {
        h += '<h3>Words you will meet</h3><dl>' + d.terms.map(function (t) { return '<dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) + '</dd>'; }).join('') + '</dl>';
      }
      if (d.cite) h += '<p class="cite">' + esc(d.cite) + '</p>';
      drawerBody.innerHTML = h;
      drawerTrigger = trigger || null;
      drawer.removeAttribute('inert'); drawer.setAttribute('aria-hidden', 'false');
      drawer.classList.add('open');
      setTimeout(function () { $('#drawerClose').focus({ preventScroll: true }); }, 60);
    }
    function closeDrawer() {
      if (!drawer.classList.contains('open')) return;
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); drawer.setAttribute('inert', '');
      if (drawerTrigger && document.contains(drawerTrigger)) drawerTrigger.focus({ preventScroll: true });
      drawerTrigger = null;
    }
    $('#drawerClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); } });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-drawer]');
      if (t) openDrawer(t.dataset.drawer, t);
    });

    /* ───────── narration (off by default) ───────── */
    var Narr = {
      on: false, text: '', timer: 0, token: 0,
      ok: 'speechSynthesis' in window,
      voice: function () {
        var v = speechSynthesis.getVoices();
        return v.find(function (x) { return /^en/i.test(x.lang) && /Google/.test(x.name); }) || v.find(function (x) { return /^en/i.test(x.lang); }) || v[0] || null;
      },
      say: function (text) {
        this.text = text;
        if (!this.on || !this.ok) return;
        var self = this; clearTimeout(this.timer);
        this.timer = setTimeout(function () {
          speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(self.text), v = self.voice();
          u.rate = .92; u.volume = .9; if (v) u.voice = v;
          speechSynthesis.speak(u);
        }, 450);
      },
      stop: function () { clearTimeout(this.timer); if (this.ok) speechSynthesis.cancel(); }
    };
    var narrateBtn = $('#narrate');
    function syncNarrate() {
      narrateBtn.setAttribute('aria-pressed', Narr.on ? 'true' : 'false');
      narrateBtn.setAttribute('aria-label', Narr.on ? UI.narrateOn : UI.narrateOff);
    }
    syncNarrate();
    if (!Narr.ok) narrateBtn.hidden = true;
    narrateBtn.addEventListener('click', function () {
      Narr.on = !Narr.on; syncNarrate();
      if (Narr.on) Narr.say(Narr.text); else Narr.stop();
    });
    if (Narr.ok) {
      speechSynthesis.getVoices();
      // Chrome drops long utterances unless nudged.
      setInterval(function () { if (Narr.on && speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 5000);
      document.addEventListener('visibilitychange', function () { if (document.hidden) Narr.stop(); });
    }
    Narr.text = C.hero.title + '. ' + C.hero.sub;

    /* ═══════════════════ chapter visuals ═══════════════════ */
    var V = {};

    /* ── 01 · cutaway ── */
    (function () {
      var cut = $('#cut'), card = $('#serverCard'), layerSel = null, gridOff = false;
      $('#tagUps').textContent = C.cutaway.ups;
      $('#tagGen').textContent = C.cutaway.generator;
      $('#tagOff').textContent = C.cutaway.gridOff;
      $('#serverTitle').textContent = C.cutaway.server.title;
      $('#serverParts').innerHTML = C.cutaway.server.parts.map(function (p) { return '<li><i style="background:' + p.color + '"></i>' + esc(p.label) + '</li>'; }).join('');
      function toggleCard(show) { card.hidden = show === undefined ? !card.hidden : !show; }
      $$('[data-rack]', cut).forEach(function (r) {
        r.addEventListener('click', function () { toggleCard(true); });
        r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(true); } });
      });
      $('#serverClose').addEventListener('click', function () { toggleCard(false); });

      function setGrid(off) {
        gridOff = off; cut.dataset.grid = off ? 'off' : 'on';
        var b = $('[data-act="grid"]');
        if (b) { var c = byId['01'].data.steps[3].control; b.textContent = off ? c.restore : c.cut; b.setAttribute('aria-pressed', off ? 'true' : 'false'); }
      }
      document.addEventListener('click', function (e) {
        var g = e.target.closest('[data-act="grid"]');
        if (g) { cut.classList.remove('flicker'); byId['01'].timers.forEach(clearTimeout); setGrid(!gridOff); }
        var lk = e.target.closest('[data-act="look"]');
        if (lk) openLook();
        var ly = e.target.closest('[data-layer]');
        if (ly) {
          var key = ly.dataset.layer;
          layerSel = layerSel === key ? null : key;
          $$('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.layer === layerSel ? 'true' : 'false'); });
          cut.dataset.lit = layerSel ? (layerSel === 'power' ? 'power backup' : layerSel) : 'compute connect power backup cool';
        }
      });

      V.cutaway = {
        enter: function (st, ch) {
          cut.classList.remove('flicker');
          cut.dataset.lit = st.lit;
          cut.dataset.grid = 'on'; gridOff = false;
          layerSel = null; $$('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          toggleCard(false);
          $('#meterArc').setAttribute('stroke-dasharray', '0 565.5'); $('#meterNum').textContent = '0%';
          if (st.id === '01.2') {
            ch.cancel = tween(0, 60, 1500, function (v) {
              $('#meterArc').setAttribute('stroke-dasharray', (v * 5.655).toFixed(1) + ' 565.5');
              $('#meterNum').textContent = Math.round(v) + '%';
            });
          }
          if (st.id === '01.4') {
            setGrid(false);
            ch.later(function () {
              cut.classList.add('flicker');
              ch.later(function () { cut.classList.remove('flicker'); setGrid(true); }, 2800);
            }, 2400);
          }
        }
      };
    })();

    /* ── 02 · clock and friends ── */
    (function () {
      var arc = $('#dialArc'), knob = $('#dialKnob'), label = $('#dialTime'), hit = $('#dialHit'), svg = $('.viz.clock');
      var range = null, auto = null, minutes = 0;
      $('#tick0').textContent = C.clock.ticks[0]; $('#tick1').textContent = C.clock.ticks[1];
      $('#tick2').textContent = C.clock.ticks[2]; $('#tick3').textContent = C.clock.ticks[3];
      $('#barV0').textContent = C.clock.bars[0].value; $('#barV1').textContent = C.clock.bars[1].value;
      $('#barL0').textContent = C.clock.bars[0].label; $('#barL1').textContent = C.clock.bars[1].label;
      C.clock.chain.forEach(function (t, i) { $('#chain' + i).textContent = t.toUpperCase(); });
      $('#fleetTag').textContent = C.clock.fleet;

      function fmt(m) { var h = Math.floor(m / 60), mm = Math.round(m % 60); return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
      function setTime(m) {
        minutes = clamp(m, 0, 1440);
        var a = minutes / 1440 * Math.PI * 2;
        arc.setAttribute('stroke-dasharray', (minutes / 1440 * 100).toFixed(2) + ' 100');
        knob.setAttribute('cx', (560 + 330 * Math.sin(a)).toFixed(1));
        knob.setAttribute('cy', (400 - 330 * Math.cos(a)).toFixed(1));
        label.textContent = fmt(minutes);
        $$('[data-clock-time]').forEach(function (n) { n.textContent = fmt(minutes); });
        range = range || $('[data-clock-range]');
        if (range) range.value = String(Math.round(minutes / 5) * 5);
      }
      function stopAuto() { if (auto) { auto(); auto = null; } }
      var dragging = false;
      function fromPointer(e) {
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var p = pt.matrixTransform(svg.getScreenCTM().inverse());
        var a = Math.atan2(p.x - 560, -(p.y - 400)); if (a < 0) a += Math.PI * 2;
        var m = Math.round(a / (Math.PI * 2) * 1440 / 5) * 5;
        // stay on the near side of the top so the hand cannot jump from 24:00 to 00:00
        if (minutes > 1200 && m < 240) m = 1440; else if (minutes < 240 && m > 1200) m = 0;
        setTime(m);
      }
      hit.addEventListener('pointerdown', function (e) { stopAuto(); dragging = true; hit.setPointerCapture(e.pointerId); hit.style.cursor = 'grabbing'; fromPointer(e); });
      hit.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
      hit.addEventListener('pointerup', function () { dragging = false; hit.style.cursor = 'grab'; });
      hit.addEventListener('pointercancel', function () { dragging = false; });
      document.addEventListener('input', function (e) {
        if (e.target.matches('[data-clock-range]')) { stopAuto(); setTime(+e.target.value); }
      });
      setTime(0);

      V.clock = {
        enter: function (st, ch) {
          if (st.id === '02.1') {
            stopAuto(); setTime(0);
            ch.later(function () { auto = tween(0, 1440, 9000, setTime); }, 600);
          } else stopAuto();
        }
      };
    })();

    /* ── 03 · bill ── */
    (function () {
      var grid = $('#billGrid'), stage = byId['03'].stage, svg = $('.viz.bill'), broken = false;
      var icons = {
        energy: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        water: '<path d="M12 3c4 5 6 8.5 6 11a6 6 0 0 1-12 0c0-2.5 2-6 6-11z"/>',
        building: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M3 9v6l9 5 9-5V9"/><path d="M12 14v6"/>',
        materials: '<path d="M4 18l4-10 5 4 3-6 4 12z"/>'
      };
      $('#rcTitle').textContent = C.bill.title.toUpperCase();
      C.bill.lines.forEach(function (t, i) { $('#rc' + i).textContent = t; });
      C.bill.chain.forEach(function (t, i) { $('#ch' + i).textContent = t; });
      C.bill.timeline.forEach(function (t, i) { $('#tl' + i).textContent = t; });
      $('#tlBefore').textContent = C.bill.before;
      grid.innerHTML = C.bill.cards.map(function (c, i) {
        return '<button type="button" class="cost" data-cost="' + i + '"><span class="cost-head"><span class="cost-ic" style="--k:' + c.color + '"><svg viewBox="0 0 24 24" fill="none" stroke="#3A3548" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + icons[c.key] + '</svg></span><span class="cost-t">' + esc(c.title) + '</span></span><span class="cost-f">' + esc(c.fact) + '</span><span class="cost-s">' + esc(c.src) + '</span></button>';
      }).join('');
      grid.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cost]'); if (!b) return;
        var c = C.bill.cards[+b.dataset.cost];
        if (c.next) goToStep(byId['03'], 1); else openDrawer(c.drawer, b);
      });
      function setBroken(v) {
        broken = v; stage.dataset.broken = v ? '1' : '0';
        var b = $('[data-act="trace"]'), c = byId['03'].data.steps[1].control;
        if (b) { b.textContent = v ? c.hide : c.show; b.setAttribute('aria-pressed', v ? 'true' : 'false'); }
      }
      document.addEventListener('click', function (e) { if (e.target.closest('[data-act="trace"]')) setBroken(!broken); });
      V.bill = {
        enter: function (st, ch) {
          if (st.id === '03.1') {
            stage.dataset.phase = 'print';
            ch.later(function () { stage.dataset.phase = 'grid'; }, reduceMotion ? 50 : 3300);
          }
          if (st.id === '03.2') setBroken(false);
        }
      };
      // tap the receipt to skip straight to the costs
      svg.addEventListener('click', function () { if (stage.dataset.state === 'receipt') stage.dataset.phase = 'grid'; });
    })();

    /* ── 04 · Nepal ── */
    (function () {
      var stage = byId['04'].stage, g = $('#markers'), legend = $('#legend');
      var M = C.map.markers, mode = 'facilities', sel = null, countShown = 0, cancelCount = null;
      function el(n, a) { var e = document.createElementNS(NS, n); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; }
      function markShape(kind, ink) {
        var m = el('g', { 'class': 'mark' });
        if (kind === 'solid') m.appendChild(el('circle', { r: 14, fill: ink }));
        else if (kind === 'dr') { m.appendChild(el('circle', { r: 6, fill: ink })); m.appendChild(el('circle', { r: 14, fill: 'none', stroke: ink, 'stroke-width': 2.5 })); }
        else m.appendChild(el('circle', { r: 12, fill: '#FFFEF9', stroke: ink, 'stroke-width': 3 }));
        return m;
      }
      Object.keys(M).forEach(function (k) {
        var d = M[k];
        var mk = el('g', { 'class': 'mk', tabindex: 0, role: 'button', 'data-key': k, transform: 'translate(' + d.x + ' ' + d.y + ')', 'aria-label': d.label + ': details' });
        mk.appendChild(el('circle', { 'class': 'halo2', r: 24 }));
        mk.appendChild(markShape(d.kind, '#3A3548'));
        mk.appendChild(el('circle', { 'class': 'hit', r: 30 }));
        var t = el('text', { x: d.lx - d.x, y: d.ly - d.y + 22, 'text-anchor': d.anchor || 'start' });
        t.textContent = d.label; mk.appendChild(t);
        mk.addEventListener('click', function () { showDetail(k); });
        mk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(k); } });
        g.appendChild(mk);
      });
      C.map.legend.forEach(function (l, i) {
        var y = 748, x = 40 + i * 330;
        var item = el('g', { transform: 'translate(' + x + ' ' + y + ')' });
        var s = markShape(l.kind, '#3A3548'); s.setAttribute('transform', 'translate(14 -8)');
        item.appendChild(s);
        var t = el('text', { x: 36, y: 0 }); t.textContent = l.label; item.appendChild(t);
        legend.appendChild(item);
      });
      var card = $('#detailCard');
      function showDetail(k) {
        var d = M[k]; sel = k;
        $$('.mk', g).forEach(function (m) { m.classList.toggle('sel', m.dataset.key === k); });
        $('#detailH').textContent = d.label; $('#detailP').textContent = d.detail; $('#detailS').textContent = d.src;
        card.hidden = false;
      }
      function hideDetail() { sel = null; card.hidden = true; $$('.mk', g).forEach(function (m) { m.classList.remove('sel'); }); }
      $('#detailClose').addEventListener('click', hideDetail);

      function showMarkers(keys) {
        $$('.mk', g).forEach(function (m) { m.classList.toggle('show', keys.indexOf(m.dataset.key) > -1); });
      }
      function setMode(key) {
        mode = key;
        var m = C.map.modes.filter(function (x) { return x.key === key; })[0];
        $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === key ? 'true' : 'false'); });
        $('#countT').textContent = m.text; $('#countS').textContent = m.src;
        var to = +m.count;
        if (cancelCount) cancelCount();
        cancelCount = tween(countShown, to, 500, function (v) { $('#countN').textContent = Math.round(v); countShown = v; });
        showMarkers(m.show);
      }
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode);
        var q = e.target.closest('[data-guess]');
        if (q) {
          $$('[data-guess]').forEach(function (x) { x.setAttribute('aria-pressed', x === q ? 'true' : 'false'); });
          $('#guessAnswer').textContent = byId['04'].data.steps[0].control.after;
        }
      });
      var tl = $('#timeList');
      tl.innerHTML = C.map.timeline.map(function (t) { return '<li><b>' + esc(t.when) + '</b><span>' + esc(t.what) + '</span></li>'; }).join('');

      V.map = {
        enter: function (st) {
          hideDetail();
          var all = Object.keys(M);
          if (st.state === 'guess') { showMarkers([]); $$('[data-guess]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); var a = $('#guessAnswer'); if (a) a.textContent = ''; }
          else if (st.state === 'count') { countShown = 0; setMode('facilities'); }
          else showMarkers(all);
        }
      };
    })();

    /* ── 05 · afterlife ── */
    (function () {
      var svg = $('.viz.after'), blocks = $('#blocks'), branch = $('.a-branch', svg), sel = -1;
      var P = C.afterlife.paths;
      for (var i = 0; i < 50; i++) {
        var r = document.createElementNS(NS, 'rect');
        r.setAttribute('class', 'blk' + (i >= 39 ? ' hot' : ''));
        r.setAttribute('x', 190 + (i % 5) * 61); r.setAttribute('y', 113 + Math.floor(i / 5) * 58);
        r.setAttribute('width', 55); r.setAttribute('height', 52); r.setAttribute('rx', 4);
        if (i >= 39) r.style.setProperty('--k', i - 39);
        blocks.appendChild(r);
      }
      $('#blkBig').textContent = C.afterlife.blocks.big; $('#blkSub').textContent = C.afterlife.blocks.sub;
      $('#blkRest').textContent = C.afterlife.blocks.rest;
      $('#blkRec').innerHTML = '<tspan font-weight="700">' + esc(C.afterlife.blocks.recycled.split(' ')[0]) + '</tspan> ' + esc(C.afterlife.blocks.recycled.split(' ').slice(1).join(' '));
      $('#wKg').textContent = C.afterlife.person.weight; $('#wPer').textContent = C.afterlife.person.per;
      P.forEach(function (p, i) { $('.pbtn[data-p="' + i + '"] text', svg).textContent = p.label; });
      function pick(i) {
        sel = sel === i ? -1 : i;
        $$('[data-path]').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.path === sel ? 'true' : 'false'); });
        $$('.br', svg).forEach(function (b) { b.classList.toggle('on', +b.dataset.b === sel); });
        $$('.pbtn', svg).forEach(function (b) { b.classList.toggle('on', +b.dataset.p === sel); });
        branch.classList.toggle('has-sel', sel > -1);
        var box = $('#pathAnswer');
        if (box) box.innerHTML = sel > -1 ? '<b>' + esc(P[sel].label) + '</b>' + esc(P[sel].text) : '';
      }
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-path]'); if (b) pick(+b.dataset.path);
        var s = e.target.closest('.pbtn'); if (s && svg.contains(s)) pick(+s.dataset.p);
      });
      V.afterlife = { enter: function (st) { if (st.id === '05.1') pick(-1); } };
    })();

    /* ── 06 · question wall ── */
    (function () {
      var wall = $('#wall'), W = C.wall, picked = null;
      try { picked = localStorage.getItem('dc-pick'); } catch (e) {}
      wall.innerHTML = W.cards.map(function (c, i) {
        return '<article class="q-card' + (picked === c.title ? ' picked' : '') + '" style="--q:' + c.color + '" data-card="' + i + '">' +
          '<button type="button" class="q-flip" aria-expanded="false"><strong>' + esc(c.title) + '</strong><small>' + esc(W.tap) + '</small></button>' +
          '<div class="q-back"><h3>' + esc(c.title) + '</h3><ul>' + c.qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' +
          '<div class="q-actions"><button type="button" class="q-pick" aria-pressed="' + (picked === c.title) + '">' + esc(picked === c.title ? W.picked : W.pick) + '</button><button type="button" class="q-close">' + esc(UI.close) + '</button></div></div></article>';
      }).join('');
      wall.addEventListener('click', function (e) {
        var card = e.target.closest('.q-card'); if (!card) return;
        var c = W.cards[+card.dataset.card];
        if (e.target.closest('.q-flip')) { card.classList.add('open'); $('.q-flip', card).setAttribute('aria-expanded', 'true'); var f = $('.q-pick', card); if (f) f.focus({ preventScroll: true }); }
        else if (e.target.closest('.q-close')) { card.classList.remove('open'); $('.q-flip', card).setAttribute('aria-expanded', 'false'); $('.q-flip', card).focus({ preventScroll: true }); }
        else if (e.target.closest('.q-pick')) {
          picked = c.title;
          try { localStorage.setItem('dc-pick', picked); } catch (er) {}
          $$('.q-card', wall).forEach(function (k) {
            var on = W.cards[+k.dataset.card].title === picked;
            k.classList.toggle('picked', on);
            var b = $('.q-pick', k); b.textContent = on ? W.picked : W.pick; b.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        }
      });
    })();

    /* ═══════════════════ scroll engine ═══════════════════ */
    var bar = $('#bar'), endSec = $('#end'), end2 = $('#end-2'), ticking = false, lastNarrKey = '';

    function probeY() {
      var vh = window.innerHeight, bh = bar.offsetHeight;
      var top = bh;
      if (mqMobile.matches) { var st = $('.stage', byId['00'].sec); top = bh + (st ? st.offsetHeight : 0); }
      return top + (vh - top) / 2;
    }
    function goToStep(ch, i) {
      var el = ch.stepEls[i]; if (!el) return;
      var r = el.getBoundingClientRect();
      var target = window.scrollY + r.top + r.height / 2 - probeY();
      window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function activate(ch, idx) {
      ch.active = idx;
      ch.timers.forEach(clearTimeout); ch.timers = [];
      if (ch.cancel) { ch.cancel(); ch.cancel = null; }
      ch.stepEls.forEach(function (el, i) { el.classList.toggle('on', i === idx); });
      ch.pips.forEach(function (p, i) { if (i === idx) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current'); });
      var st = ch.data.steps[idx];
      ch.stage.dataset.state = st.state;
      if (st.tone === 'dark') ch.sec.setAttribute('data-tone', 'dark'); else ch.sec.removeAttribute('data-tone');
      var v = V[ch.data.visual]; if (v && v.enter) v.enter(st, ch);
      var n = st.narration || [st.title.replace('{time}', ''), st.lead, st.note].filter(Boolean).join(' ');
      Narr.say(n);
    }

    function update() {
      ticking = false;
      var vh = window.innerHeight, p = probeY(), bh = bar.offsetHeight, current = null;

      chapters.forEach(function (ch, ci) {
        var r = ch.sec.getBoundingClientRect();
        if (r.top <= p && r.bottom > p) {
          current = ch;
          var idx = 0;
          for (var i = 0; i < ch.stepEls.length; i++) {
            var sr = ch.stepEls[i].getBoundingClientRect();
            if (sr.top <= p) idx = i;
          }
          // on mobile the wall chapter keeps its stage below the step, so use the step itself
          if (idx !== ch.active) activate(ch, idx);
        }
      });
      var e1 = endSec.getBoundingClientRect(), e2 = end2.getBoundingClientRect();

      // header follows whatever dark section sits under it
      var dark = false, y = bh / 2;
      $$('[data-tone="dark"], [data-theme="dark"]').forEach(function (s) {
        var r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) dark = true;
      });
      document.body.dataset.header = dark ? 'dark' : 'light';

      // narration for the sections that are not chapter steps
      var key = '';
      if (e2.top < vh * .6) key = 'end';
      else if (current === null && window.scrollY < vh * .5) key = 'hero';
      if (key && key !== lastNarrKey) Narr.say(key === 'end' ? C.end.line : C.hero.title + '. ' + C.hero.sub);
      lastNarrKey = key;
    }
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    /* ═══════════════════ ending ═══════════════════ */
    (function () {
      var svg = $('#reverse'), nodes = $$('.rv', svg), dot = $('.rv-dot', svg), dotC = $('circle', dot), cancel = null, wrap = endSec;
      svg.setAttribute('aria-label', C.end.journeyLabel);
      $('#endLine').textContent = C.end.line;
      $('#endAgain').textContent = C.end.again;
      var xs = [170, 430, 690, 950, 1210, 1470, 1730];
      function run() {
        nodes.forEach(function (n) { n.classList.remove('lit'); });
        dot.classList.add('go');
        if (cancel) cancel();
        if (reduceMotion) { nodes.forEach(function (n) { n.classList.add('lit'); }); dot.classList.remove('go'); return; }
        cancel = tween(xs[0], xs[6], 7600, function (x) {
          dotC.setAttribute('cx', x);
          nodes.forEach(function (n, i) { if (x >= xs[i] - 2) n.classList.add('lit'); });
          if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = (x / 1920) * wrap.scrollWidth - wrap.clientWidth / 2;
        }, function () { dot.classList.remove('go'); });
      }
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) run();
        else { if (cancel) cancel(); nodes.forEach(function (n) { n.classList.remove('lit'); }); dot.classList.remove('go'); }
      }, { threshold: .55 }).observe(endSec);
      new IntersectionObserver(function (en) { end2.classList.toggle('in', en[0].isIntersecting); }, { threshold: .35 }).observe(end2);
    })();

    $('#foot').textContent = C.footer;

    /* ═══════════════════ 3D · look closer ═══════════════════ */
    var look = $('#look'), viewerReady = false, viewerLoading = false;
    var M3 = C.model3d;
    $('#lookEyebrow').textContent = M3.chapterLabel; $('#lookTitle').textContent = M3.title; $('#lookSub').textContent = M3.sub;
    $('#lookBackLabel').textContent = M3.back; $('#viewerFsLabel').textContent = M3.fullscreen;
    $('#viewerMsg').textContent = M3.loading;

    function openLook() {
      look.hidden = false;
      look.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (!viewerReady && !viewerLoading) loadViewer();
      else if (viewerReady) window.dispatchEvent(new Event('resize'));
    }
    function closeLook() {
      look.hidden = true;
      goToStep(byId['01'], 5);
      var lk = $('[data-act="look"]'); if (lk) setTimeout(function () { lk.focus({ preventScroll: true }); }, 400);
    }
    $('#lookBack').addEventListener('click', closeLook);

    function loadViewer() {
      viewerLoading = true;
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = function () { try { initViewer(window.THREE); viewerReady = true; $('#viewerMsg').hidden = true; } catch (e) { console.error(e); fail(); } };
      s.onerror = fail;
      document.head.appendChild(s);
      function fail() { viewerLoading = false; $('#viewerMsg').textContent = M3.failed; }
    }

    function initViewer(THREE) {
      var wrap = $('#viewer'), canvas = $('#viewerCanvas'), tip = $('#viewerTip'), card = $('#viewerCard');
      var COMP = {};
      Object.keys(M3.components).forEach(function (k) { var d = M3.components[k]; COMP[k] = { label: d.label, hex: d.hex, desc: d.desc, specs: d.specs, color: parseInt(d.hex.replace('#', ''), 16) }; });
      var INK = 0x4A4558;
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0xF6F3EC);
      scene.fog = new THREE.Fog(0xF6F3EC, 34, 64);
      var camera = new THREE.PerspectiveCamera(45, 1, .1, 200);
      scene.add(new THREE.AmbientLight(0xffffff, .62));
      var sun = new THREE.DirectionalLight(0xffffff, .62);
      sun.position.set(10, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
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
        if (type === 'server_rack') {
          g.add(box(1, 2.2, .7, col, 0, 1.1, 0));
          for (i = 0; i < 5; i++) g.add(box(.85, .06, .02, INK, 0, .4 + i * .35, .36));
          g.add(box(.05, 1.6, .04, 0x3DDC97, -.42, 1.1, .36, 0x3DDC97));
        } else if (type === 'cooling_unit') {
          g.add(box(1.2, 1.8, .9, col, 0, .9, 0));
          for (i = 0; i < 6; i++) g.add(box(1.1, .06, .08, INK, 0, .3 + i * .25, .46));
          var f = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .08, 16), mat(INK)); f.rotation.x = Math.PI / 2; f.position.set(0, 1.5, .48); g.add(f);
        } else if (type === 'ups') {
          g.add(box(.9, 2, .7, col, 0, 1, 0));
          for (i = 0; i < 4; i++) g.add(box(.7, .25, .08, INK, 0, .4 + i * .38, .36));
          var l = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 8), mat(0xFFB800, 0xFFB800)); l.position.set(.3, 1.9, .36); g.add(l);
        } else if (type === 'generator') {
          g.add(box(2.2, .15, 1.1, INK, 0, .07, 0)); g.add(box(2, 1.1, 1, col, 0, .7, 0));
          var p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .7, 8), mat(INK)); p.position.set(.7, 1.6, 0); g.add(p);
          for (i = 0; i < 4; i++) g.add(box(.04, .12, .8, INK, -.7 + i * .3, .7, .5));
        } else if (type === 'network_core') {
          g.add(box(1.6, .6, 1.6, col, 0, .3, 0));
          for (i = 0; i < 8; i++) g.add(box(.1, .07, .04, INK, -.6 + i * .17, .35, .82));
          var s = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), mat(0x00AEEF, 0x00AEEF)); s.position.set(.65, .55, .82); g.add(s);
        } else if (type === 'pdu') {
          g.add(box(.25, 1.8, .25, col, 0, .9, 0));
          for (i = 0; i < 6; i++) g.add(box(.2, .1, .06, INK, 0, .3 + i * .25, .15));
        } else if (type === 'fire_suppression') {
          var b = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.1, 12), mat(col)); b.position.y = .55; g.add(b);
          var v = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .25, 8), mat(INK)); v.position.y = 1.22; g.add(v);
          var n = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 8), mat(INK)); n.position.y = 1.38; g.add(n);
        } else if (type === 'security_desk') {
          g.add(box(1.8, .08, .8, col, 0, .75, 0)); g.add(box(.8, .08, .8, col, -.5, .75, .8));
          g.add(box(.08, .75, .08, INK, -.8, .37, 0)); g.add(box(.08, .75, .08, INK, .8, .37, 0));
          g.add(box(.6, .4, .04, INK, 0, 1.1, -.1)); g.add(box(.54, .34, .01, 0x77C0F7, 0, 1.1, -.08, 0x77C0F7));
        }
        g.position.set(x, 0, z);
        return g;
      }
      var all = [];
      M3.layout.forEach(function (row) {
        row.positions.forEach(function (pos) {
          var g = build(row.type, pos[0], pos[1]);
          g.traverse(function (c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.group = g; all.push(c); } });
          scene.add(g);
        });
      });

      // orbit
      var sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(11, 9.5, 14.5)), target = new THREE.Vector3(), goal = new THREE.Vector3();
      function place() {
        sph.phi = clamp(sph.phi, .15, Math.PI / 2.1); sph.radius = clamp(sph.radius, 6, 50);
        camera.position.setFromSpherical(sph).add(target); camera.lookAt(target);
      }
      place();
      var ptrs = {}, pinch = 0, down = null;
      function pcount() { return Object.keys(ptrs).length; }
      canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        down = { x: e.clientX, y: e.clientY, n: pcount() }; canvas.style.cursor = 'grabbing';
        if (pcount() === 2) { var k = Object.keys(ptrs).map(function (i) { return ptrs[i]; }); pinch = Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
      });
      canvas.addEventListener('pointermove', function (e) {
        var pr = ptrs[e.pointerId];
        if (!pr) { hover(e); return; }
        var dx = e.clientX - pr.x, dy = e.clientY - pr.y; pr.x = e.clientX; pr.y = e.clientY;
        if (pcount() === 1) { sph.theta -= dx * .008; sph.phi -= dy * .008; place(); }
        else if (pcount() === 2) {
          var k = Object.keys(ptrs).map(function (i) { return ptrs[i]; }), d = Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y);
          if (pinch) { sph.radius *= pinch / d; place(); } pinch = d;
        }
      });
      function up(e) {
        var moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
        if (ptrs[e.pointerId] && pcount() === 1 && down && down.n === 1 && !moved && e.type === 'pointerup') pick(e);
        delete ptrs[e.pointerId]; pinch = 0; canvas.style.cursor = 'grab';
      }
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', function (e) {
        if (!(e.ctrlKey || e.metaKey || document.fullscreenElement || wrap.classList.contains('fs-mode'))) return;
        e.preventDefault(); sph.radius *= 1 + e.deltaY * .001; place();
      }, { passive: false });

      var ray = new THREE.Raycaster(), m2 = new THREE.Vector2(), hl = null, saved = [];
      function hitAt(e) {
        var r = canvas.getBoundingClientRect();
        m2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(m2, camera);
        var h = ray.intersectObjects(all); return h.length ? h[0].object.userData.group : null;
      }
      function hover(e) {
        var g = hitAt(e);
        if (g) {
          var r = wrap.getBoundingClientRect();
          tip.textContent = g.userData.def.label; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top - 6) + 'px';
          tip.classList.add('show'); canvas.style.cursor = 'pointer';
        } else { tip.classList.remove('show'); canvas.style.cursor = 'grab'; }
      }
      function clearHl() {
        saved.forEach(function (s) { s.m.emissive.setHex(s.e); s.m.emissiveIntensity = s.i; });
        saved = []; hl = null;
      }
      function highlight(g) {
        clearHl(); hl = g;
        g.traverse(function (c) {
          if (!c.isMesh) return;
          saved.push({ m: c.material, e: c.material.emissive.getHex(), i: c.material.emissiveIntensity });
          if (c.material.emissive.getHex() === 0) { c.material.emissive.setHex(g.userData.def.color); c.material.emissiveIntensity = .38; }
          else c.material.emissiveIntensity = .7;
        });
      }
      function show(def) {
        $('#vcSwatch').style.background = def.hex; $('#vcName').textContent = def.label; $('#vcDesc').textContent = def.desc;
        $('#vcSpecs').innerHTML = def.specs.map(function (s) { return '<div><dt>' + esc(s.k) + '</dt><dd>' + esc(s.v) + '</dd></div>'; }).join('');
        card.hidden = false;
      }
      function pick(e) { var g = hitAt(e); if (g) { highlight(g); show(g.userData.def); } else { clearHl(); card.hidden = true; } }
      $('#viewerCardClose').addEventListener('click', function () { card.hidden = true; clearHl(); });

      // chips
      var chips = $('#viewerChips');
      Object.keys(COMP).forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'vchip';
        b.style.setProperty('--vc', COMP[k].hex + '66'); b.textContent = COMP[k].label;
        b.setAttribute('aria-label', 'Show ' + COMP[k].label + ' on the 3D model');
        b.addEventListener('click', function () {
          var found = null; scene.traverse(function (o) { if (!found && o.isGroup && o.userData.type === k) found = o; });
          if (found) { highlight(found); show(COMP[k]); goal.set(found.position.x * .5, 0, found.position.z * .5); }
        });
        chips.appendChild(b);
      });

      // size + loop
      function size() { var w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      size(); window.addEventListener('resize', size);
      var raf = 0, visible = false;
      function frame() {
        raf = requestAnimationFrame(frame);
        if (target.distanceToSquared(goal) > .0004) { target.lerp(goal, .1); place(); }
        renderer.render(scene, camera);
      }
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !raf) frame(); else if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      }).observe(canvas);

      // fullscreen (native, with a manual fallback)
      var fs = $('#viewerFs'), fsl = $('#viewerFsLabel'), manual = false;
      function label(on) { fsl.textContent = on ? M3.exit : M3.fullscreen; fs.setAttribute('aria-label', on ? 'Exit fullscreen' : 'View 3D model fullscreen'); }
      function setManual(on) { manual = on; wrap.classList.toggle('fs-mode', on); document.body.classList.toggle('fs-lock', on); label(on); setTimeout(size, 60); }
      fs.addEventListener('click', function () {
        if (manual) return setManual(false);
        if (document.fullscreenElement) return document.exitFullscreen();
        var req = wrap.requestFullscreen;
        if (!req) return setManual(true);
        Promise.resolve(req.call(wrap)).then(function () { setTimeout(size, 100); }).catch(function () { setManual(true); });
      });
      document.addEventListener('fullscreenchange', function () { if (!manual) { label(!!document.fullscreenElement); setTimeout(size, 100); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && manual) setManual(false); });
    }

    update();
  }
})();
