/* 처음 화면 머리 그림 움직임 — 2026-09-30 수강생 요청 「히어로 영역 지게차에 자바스크립트 효과·이벤트」
 *
 * - 옆모습 시험 구간(평지 → 요철 3개 → 경사로 → 라바콘)을 지게차가 달린다. 바퀴가 구르고, 요철에서 차체가
 *   들썩이고 기울며(서스펜션 느낌), 마스트·짐이 조금 흔들리고, 요철·경사로에서 먼지, 뒤에서 배기 연기가 난다.
 * - 위에서 본 코스 배치도의 노란 점이 같은 걸음으로 돈다. 바퀴 수·운전시간은 「예시 연출」(실제 기록 아님).
 * - 지게차에 마우스를 올리면 전조등·경광등이 켜지고 지금 구간 이름이 뜬다. 구간 버튼(또는 그림의 구간)을
 *   누르면 지게차가 그 구간으로 가고, 그 구간에서 일지에 적는 칸을 글 옆에 보여 준다.
 *
 * requestAnimationFrame 한 줄기만 돈다(raf 가 0 이 아니면 새로 걸지 않음). 다른 메뉴로 가거나, 그림이 화면 밖이거나,
 * 탭이 숨었거나, 「움직임 멈춤」을 눌렀거나, 운영체제의 「움직임 줄이기」 설정이면 멈추고 한 장면만 그린다.
 * 라이브러리 없음. 일반 스크립트(file:// 로 열어도 돎).
 */
(function () {
  'use strict';
  var hero = document.getElementById('homeHero');
  if (!hero || !window.requestAnimationFrame) return;
  function $(id) { return document.getElementById(id); }
  var svg = hero.querySelector('.hero-art');
  var E = {
    truck: $('fxTruck'), chassis: $('fxChassis'), mastB: $('fxMastBack'), mastF: $('fxMastFront'),
    wr: $('fxWheelR'), wf: $('fxWheelF'), beam: $('fxBeam'), beacon: $('fxBeaconGlow'), speed: $('fxSpeed'),
    puffs: $('fxPuffs'), marker: $('fxMarker'), trail: $('fxTrail'), course: $('fxCourse'), secHi: $('fxSecHi'),
    hit: $('fxHit'), tip: $('fxTip'), sec: $('fxSection'), lap: $('fxLap'), clock: $('fxClock'),
    play: $('fxPlay'), info: $('fxInfo'), live: $('fxLive'), copy: hero.querySelector('.hero-copy')
  };
  for (var k in E) if (!E[k]) return;
  var bodies = hero.querySelectorAll('.fx-body');
  var chips = hero.querySelectorAll('.fx-chip');
  var NS = 'http://www.w3.org/2000/svg';

  // ── 코스 모양(index.html 의 옆모습 바닥선과 같은 값) ──
  var GROUND = 500, BUMPS = [1200, 1250, 1300], BUMP_R = 14;
  var SLOPE = { a: 1336, b: 1420, c: 1476, d: 1552, h: 60 };
  var WR = { x: 42, r: 28 }, WF = { x: 148, r: 32 }, BASE = WF.x - WR.x;
  var END = 1620, STATIC_X = 900, VBASE = 130, SIM = 36; // 운전시간: 실제 1초 = 연출 36초
  // 구간은 앞바퀴 위치로 가른다. pose = 그 구간으로 갈 때 세울 자리, speed = 구간 속도(뷰박스/초)
  var SECS = {
    flat: { name: '평지', to: 1170, pose: 880, speed: 175, hi: [0, 1180] },
    bump: { name: '요철', to: 1336, pose: 1152, speed: 70, hi: [1180, 156] },
    slope: { name: '경사로', to: 1552, pose: 1345, speed: 82, hi: [1336, 216] },
    cone: { name: '라바콘', to: Infinity, pose: 1410, speed: 120, hi: [1552, 48] }
  };
  var ORDER = ['flat', 'bump', 'slope', 'cone'];
  function secAt(x) {
    var f = x + WF.x;
    for (var i = 0; i < ORDER.length; i++) if (f < SECS[ORDER[i]].to) return ORDER[i];
    return 'cone';
  }
  // 바퀴 중심이 바닥에서 들리는 높이 — 요철(반원)은 바퀴 반지름만큼 부드럽게, 경사로는 바닥선 그대로
  function lift(x, r) {
    var l = 0, s = r + BUMP_R;
    for (var i = 0; i < BUMPS.length; i++) {
      var d = Math.abs(x - BUMPS[i]);
      if (d < s) l = Math.max(l, Math.sqrt(s * s - d * d) - r);
    }
    var g = 0;
    if (x > SLOPE.a && x <= SLOPE.b) g = (x - SLOPE.a) * SLOPE.h / (SLOPE.b - SLOPE.a);
    else if (x > SLOPE.b && x <= SLOPE.c) g = SLOPE.h;
    else if (x > SLOPE.c && x < SLOPE.d) g = (SLOPE.d - x) * SLOPE.h / (SLOPE.d - SLOPE.c);
    return Math.max(l, g);
  }

  // ── 상태 ──
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var st = {
    x: STATIC_X, v: 0, lap: 1, lapStart: -300, sim: 0, angR: 0, angF: 0,
    by: 0, bv: 0, bt: 0, btv: 0, ms: 0, msv: 0, prevTh: 0, prevV: 0,
    mode: null, pick: null, hover: false, tipUntil: 0, puffT: 0, frames: 0
  };
  var paused = !!reduceMQ.matches;   // 움직임 줄이기면 멈춘 채로 시작(버튼으로만 켬)
  var inView = true, raf = 0, last = 0, courseLen = 0;
  try { courseLen = E.course.getTotalLength(); } catch (e) { courseLen = 0; }

  // 먼지·연기 알갱이는 미리 12개 만들어 돌려 씀(매 장면 요소를 만들지 않음)
  var puffs = [];
  for (var p = 0; p < 12; p++) {
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '0'); c.setAttribute('opacity', '0');
    E.puffs.appendChild(c);
    puffs.push({ el: c, life: 0, t: 0 });
  }
  function spawn(x, y, vx, vy, r0, r1, a, color, life) {
    for (var i = 0; i < puffs.length; i++) {
      var q = puffs[i];
      if (q.t >= q.life) {
        q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.r0 = r0; q.r1 = r1; q.a = a; q.t = 0; q.life = life;
        q.el.setAttribute('fill', color);
        return;
      }
    }
  }
  function stepPuffs(dt) {
    for (var i = 0; i < puffs.length; i++) {
      var q = puffs[i];
      if (q.t >= q.life) continue;
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt;
      var k = Math.min(1, q.t / q.life);
      q.el.setAttribute('cx', q.x.toFixed(1)); q.el.setAttribute('cy', q.y.toFixed(1));
      q.el.setAttribute('r', (q.r0 + (q.r1 - q.r0) * k).toFixed(1));
      q.el.setAttribute('opacity', (q.a * (1 - k)).toFixed(3));
    }
  }
  function clearPuffs() {
    puffs.forEach(function (q) { q.t = q.life = 0; q.el.setAttribute('opacity', '0'); });
  }

  // 넓은 화면은 글 뒤가 어두우므로, 한 바퀴를 글 상자 바로 오른쪽에서 시작(안 보이는 곳을 오래 달리지 않게)
  function lapStartX() {
    try {
      if (getComputedStyle(svg).position !== 'absolute') return -300;
      var m = svg.getScreenCTM(); if (!m) return -300;
      var pt = svg.createSVGPoint();
      pt.x = E.copy.getBoundingClientRect().right + 40; pt.y = 0;
      var v = pt.matrixTransform(m.inverse()).x - 292;
      return Math.max(-300, Math.min(800, v));
    } catch (e) { return -300; }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function resetSprings() {
    var lr = -lift(st.x + WR.x, WR.r), lf = -lift(st.x + WF.x, WF.r);
    st.by = (lr + lf) / 2; st.bv = 0;
    st.bt = Math.atan2(lf - lr, BASE) * 180 / Math.PI; st.btv = 0; st.prevTh = st.bt;
    st.ms = 0; st.msv = 0; st.v = 0; st.prevV = 0;
    st.cur = { lr: lr, lf: lf, th: st.bt, dy: 0, rot: 0 };   // 멈춘 자세(출렁임 없음)
  }

  // ── 한 장면 계산 ──
  function step(dt, now) {
    var sec = secAt(st.x), speed = SECS[sec].speed, hop = 0, prevX = st.x;
    if (st.mode && st.mode.type === 'hop') {
      st.mode.t += dt;
      var k = Math.min(1, st.mode.t / 0.5), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      st.x = st.mode.from + (st.mode.to - st.mode.from) * e;
      hop = -46 * Math.sin(Math.PI * k);
      st.v = 0;
      if (k >= 1) { st.mode = null; spawn(st.x + WR.x, GROUND, -30, -12, 4, 14, .5, '#c9a36a', .7); spawn(st.x + WF.x, GROUND, 30, -12, 4, 14, .5, '#c9a36a', .7); }
    } else {
      var target = speed;
      if (st.mode && st.mode.type === 'seek') {
        target = speed * 5;
        if (st.x >= st.mode.target) { st.x = st.mode.target; st.mode = null; target = speed; }
      }
      st.v += (target - st.v) * Math.min(1, dt * 4);     // 부드럽게 빨라지고 느려짐
      st.x += st.v * dt;
      st.sim += dt * SIM;
      if (st.x > END) { st.lap += 1; st.lapStart = lapStartX(); st.x = st.lapStart; resetSprings(); clearPuffs(); prevX = st.x; }
    }
    var ds = st.x - prevX;
    st.angR += ds / WR.r; st.angF += ds / WF.r;

    var lr = -lift(st.x + WR.x, WR.r) + hop, lf = -lift(st.x + WF.x, WF.r) + hop;
    var th = Math.atan2(lf - lr + 0, BASE) * 180 / Math.PI;
    var cy = (lr + lf) / 2;
    var thRate = dt > 0 ? (th - st.prevTh) / dt : 0, acc = dt > 0 ? (st.v - st.prevV) / dt : 0;
    st.prevTh = th; st.prevV = st.v;
    // 차체는 바퀴를 조금 늦게 따라가며 출렁임(용수철-감쇠), 마스트·짐은 가감속·기울기 변화에 흔들림
    var n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (var i = 0; i < n; i++) {
      st.bv += (900 * (cy - st.by) - 16 * st.bv) * h; st.by += st.bv * h;
      st.btv += (500 * (th - st.bt) - 14 * st.btv) * h; st.bt += st.btv * h;
      st.msv += (-260 * st.ms - 7 * st.msv - 0.012 * acc - 0.05 * thRate) * h; st.ms += st.msv * h;
    }
    st.ms = clamp(st.ms, -2.6, 2.6);
    st.cur = { lr: lr, lf: lf, th: th, dy: clamp(st.by - cy, -8, 8), rot: clamp(st.bt - th, -3.5, 3.5) };

    // 먼지: 앞·뒷바퀴가 요철 꼭대기·경사로 시작/끝을 지날 때
    [WR, WF].forEach(function (w) {
      var a = prevX + w.x, b = st.x + w.x;
      BUMPS.concat([SLOPE.a, SLOPE.d]).forEach(function (kx) {
        if (a < kx && b >= kx) {
          spawn(kx - 6, GROUND - 2, -40, -18, 3, 13, .55, '#c9a36a', .8);
          spawn(kx + 2, GROUND - 4, -18, -30, 2, 10, .45, '#c9a36a', .7);
        }
      });
    });
    // 배기 연기: 달릴 때 0.45초마다
    st.puffT += dt;
    if (st.v > 20 && st.puffT > .45) {
      st.puffT = 0;
      spawn(st.x + 19, 378 + lr + st.cur.dy, -26, -30, 3, 12, .38, '#9ab8e0', 1.1);
    }
    stepPuffs(dt);
  }

  // ── 그리기 ──
  var shown = { sec: '', lap: -1, clock: '' };
  function pad(v) { return (v < 10 ? '0' : '') + v; }
  function draw(now) {
    if (!st.cur) resetSprings();
    var c = st.cur;
    E.truck.setAttribute('transform', 'translate(' + st.x.toFixed(2) + ' 0)');
    E.chassis.setAttribute('transform', 'translate(0 ' + c.lr.toFixed(2) + ') rotate(' + c.th.toFixed(3) + ' ' + WR.x + ' ' + GROUND + ')');
    var bt = 'translate(0 ' + c.dy.toFixed(2) + ') rotate(' + c.rot.toFixed(3) + ' 110 440)';
    for (var i = 0; i < bodies.length; i++) bodies[i].setAttribute('transform', bt);
    var mt = 'rotate(' + st.ms.toFixed(3) + ' 193 474)';
    E.mastB.setAttribute('transform', mt); E.mastF.setAttribute('transform', mt);
    E.wr.setAttribute('transform', 'rotate(' + (st.angR * 180 / Math.PI % 360).toFixed(2) + ' 42 472)');
    E.wf.setAttribute('transform', 'rotate(' + (st.angF * 180 / Math.PI % 360).toFixed(2) + ' 148 468)');
    // 속도선: 달릴 때는 빠르기만큼, 멈추면 지움(움직임 없이 처음 그린 모습은 그대로 둠)
    if (running()) E.speed.setAttribute('opacity', (clamp(st.v / 175, 0, 1) * .8).toFixed(2));
    else if (st.frames || st.pick) E.speed.setAttribute('opacity', '0');

    // 전조등·경광등: 마우스를 올렸을 때(또는 구간을 고른 뒤 잠깐)
    var lit = st.hover || now < st.tipUntil;
    E.beam.setAttribute('opacity', lit ? '.55' : '0');
    var blink = running() ? (Math.sin(now / 95) > 0 ? .95 : .25) : .9;
    E.beacon.setAttribute('opacity', lit ? String(blink) : '0');

    // 코스 배치도의 점: 이번 바퀴에서 간 비율만큼
    if (courseLen) {
      var prog = clamp((st.x - st.lapStart) / (END - st.lapStart), 0, 1), pos = prog * courseLen;
      var pt = E.course.getPointAtLength(pos);
      E.marker.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      var tl = Math.min(pos, courseLen * .1);
      E.trail.setAttribute('stroke-dasharray', tl.toFixed(1) + ' ' + (courseLen * 2).toFixed(1));
      E.trail.setAttribute('stroke-dashoffset', (tl - pos).toFixed(1));
      E.trail.setAttribute('opacity', tl > 1 ? '.55' : '0');
    }

    // 글: 바뀐 때만 고침(매 장면 글자를 다시 쓰지 않음)
    var sec = secAt(st.x);
    if (sec !== shown.sec) {
      shown.sec = sec; E.sec.textContent = SECS[sec].name;
      for (var j = 0; j < chips.length; j++) chips[j].classList.toggle('is-now', chips[j].getAttribute('data-sec') === sec);
    }
    if (st.lap !== shown.lap) { shown.lap = st.lap; E.lap.textContent = String(st.lap); }
    var s = Math.floor(st.sim), txt = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
    if (txt !== shown.clock) { shown.clock = txt; E.clock.textContent = txt; }

    var tipOn = st.hover || now < st.tipUntil;
    if (tipOn) {
      var t = (running() ? '내구시험 중' : '내구시험 중(멈춤)') + ' · ' + SECS[sec].name + ' 구간';
      if (E.tip.textContent !== t) E.tip.textContent = t;
      if (E.tip.hidden) E.tip.hidden = false;
      placeTip();
    } else if (!E.tip.hidden) E.tip.hidden = true;
  }
  function placeTip() {
    var hr = hero.getBoundingClientRect(), br = E.hit.getBoundingClientRect(), w = E.tip.offsetWidth;
    var left = clamp(br.left + br.width / 2 - hr.left, w / 2 + 8, hr.width - w / 2 - 8);
    var top = Math.max(E.tip.offsetHeight + 6, br.top - hr.top + br.height * .04);
    E.tip.style.left = left.toFixed(1) + 'px';
    E.tip.style.top = top.toFixed(1) + 'px';
  }

  // ── 돌리기·멈추기 — 줄기는 언제나 하나 ──
  function running() { return !paused && inView && !hero.hidden && !document.hidden; }
  function heroFxFrame(now) {
    raf = 0;
    if (!running()) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
    last = now;
    st.frames += 1;
    step(dt, now);
    draw(now);
    raf = window.requestAnimationFrame(heroFxFrame);
  }
  function update() {
    if (running()) {
      if (!raf) { last = 0; raf = window.requestAnimationFrame(heroFxFrame); }
    } else {
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
      draw(performance.now());
    }
    E.play.setAttribute('aria-pressed', paused ? 'true' : 'false');
  }
  // 멈춘 상태에서 잠깐 떠 있는 풍선을 지우기 위한 한 번짜리 타이머
  var tipTimer = 0;
  function showTipFor(ms) {
    st.tipUntil = performance.now() + ms;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { if (!raf) draw(performance.now()); }, ms + 30);
  }

  // ── 구간 고르기(버튼·그림) ──
  function select(key) {
    var s = SECS[key]; if (!s) return;
    st.pick = key;
    for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-pressed', chips[j].getAttribute('data-sec') === key ? 'true' : 'false');
    var ps = E.info.querySelectorAll('p');
    for (var i = 0; i < ps.length; i++) ps[i].classList.toggle('is-on', ps[i].getAttribute('data-sec') === key);
    E.info.classList.remove('is-flash'); void E.info.offsetWidth; E.info.classList.add('is-flash');
    var on = E.info.querySelector('p.is-on');
    var link = on && on.querySelector('a');
    E.live.textContent = on ? on.textContent.replace(link ? link.textContent : '', '').trim() : '';
    E.secHi.setAttribute('x', s.hi[0]); E.secHi.setAttribute('width', s.hi[1]);
    E.secHi.setAttribute('opacity', '.16');
    if (running()) {
      var d = s.pose - st.x;
      if (d > 0 && d <= 450) st.mode = { type: 'seek', target: s.pose };
      else st.mode = { type: 'hop', t: 0, from: st.x, to: s.pose };
    } else {
      st.mode = null; st.x = s.pose; resetSprings(); clearPuffs();
      // 멈춘 상태에서도 코스 점이 그 자리로 가게, 이번 바퀴 시작을 지금 자리보다 앞으로
      if (st.x < st.lapStart) st.lapStart = -300;
    }
    showTipFor(3200);
    if (!raf) draw(performance.now());
  }
  for (var j = 0; j < chips.length; j++) {
    chips[j].addEventListener('click', function () { select(this.getAttribute('data-sec')); });
  }
  hero.querySelectorAll('.fx-hot').forEach(function (r) {
    r.addEventListener('click', function () { select(r.getAttribute('data-sec')); });
  });

  // ── 지게차에 마우스 올리기·누르기 ──
  E.hit.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') { st.hover = true; if (!raf) draw(performance.now()); } });
  E.hit.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') { st.hover = false; if (!raf) draw(performance.now()); } });
  E.hit.addEventListener('click', function () { showTipFor(2600); if (!raf) draw(performance.now()); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !E.tip.hidden) { st.hover = false; st.tipUntil = 0; draw(performance.now()); } });

  // ── 움직임 멈춤 버튼 ──
  E.play.addEventListener('click', function () {
    paused = !paused;
    update();
  });

  // ── 멈추는 조건: 화면 밖·탭 숨김·다른 메뉴·움직임 줄이기 ──
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { inView = es[es.length - 1].isIntersecting; update(); }, { threshold: 0 }).observe(hero);
  }
  document.addEventListener('visibilitychange', update);
  window.addEventListener('hashchange', function () { setTimeout(update, 0); });
  var onMQ = function () { if (reduceMQ.matches) paused = true; update(); };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onMQ);
  else if (reduceMQ.addListener) reduceMQ.addListener(onMQ);

  st.lapStart = lapStartX();
  if (st.lapStart > STATIC_X) st.lapStart = -300;
  resetSprings();
  update();

  // 점검용(헤드리스 브라우저에서 상태를 읽음). 화면 동작에는 쓰지 않음
  window.HeroFx = {
    state: function () {
      return { running: running(), raf: !!raf, frames: st.frames, x: Math.round(st.x), section: secAt(st.x), lap: st.lap,
        paused: paused, reduce: !!reduceMQ.matches, tip: !E.tip.hidden, pick: st.pick, mode: st.mode ? st.mode.type : '' };
    }
  };
})();
