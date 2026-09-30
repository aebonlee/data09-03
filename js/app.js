/* 내구시험 일지 정리·기성 집계 — 화면
 * 시험일지 입력(TPR) · 시험일지 정리 · 주간 현황 · 기성처리(운전시간·연료비) · 현황 데이터(불러오기) · 대시보드 */
(function () {
  'use strict';
  var L = window.DLLogic;
  var S = window.DLStore;
  var Sample = window.DLSample;
  var XLSX = window.XLSX;
  var PAGE = 50;

  var db = S.loadDb();
  var imp = null;        // 불러오기 진행 상태(메모리에만)
  var dataView = { from: '', to: '', model: '', onlyIssues: false, page: 0 };
  var dash = { from: '', to: '', model: '', skipWeekend: true };
  var tpr = { form: null, editId: null, photo: null, photoName: '' }; // 일지 입력 중인 값(메모리)
  var sumKey = '';                                              // 시험일지 정리에서 고른 모델·호기
  var weekly = { asOf: '', days: 7, body: null };
  // 기성 기간: 운전시간은 월 단위(from·to), 연료비는 영수증 기준이라 따로 정할 수 있음(fuelFrom·fuelTo — 비면 운전시간 기간)
  var bill = { from: '', to: '', fuelFrom: '', fuelTo: '' };

  // ── 작은 도구 ─────────────────────────────────────────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function fmt(n, digits) {
    if (n == null || n === '') return '';
    return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: digits == null ? 2 : digits });
  }
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function save() {
    if (!S.saveDb(db)) document.getElementById('storeBanner').hidden = false;
  }
  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  function select(name, options, value, attrs) {
    var s = h('select', Object.assign({ name: name }, attrs || {}));
    options.forEach(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      s.appendChild(h('option', { value: v, selected: String(v) === String(value) }, t));
    });
    return s;
  }
  function openDialog(title, content, actions) {
    var d = document.getElementById('dialog');
    document.getElementById('dialogTitle').textContent = title;
    var c = document.getElementById('dialogContent'); c.textContent = ''; add(c, content);
    var a = document.getElementById('dialogActions'); a.textContent = ''; add(a, actions);
    if (!d.open) d.showModal();
  }
  function closeDialog() { var d = document.getElementById('dialog'); if (d.open) d.close(); }
  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // sheets: { 시트이름: aoa } 또는 { 시트이름: { aoa, merges } } (청구서처럼 칸을 합치는 시트)
  function writeXlsx(name, sheets) {
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (n) {
      var sh = Array.isArray(sheets[n]) ? { aoa: sheets[n] } : sheets[n];
      var ws = XLSX.utils.aoa_to_sheet(sh.aoa);
      var widths = [];
      sh.aoa.forEach(function (r, ri) {
        (r || []).forEach(function (c, i) {
          // 제목·안내 줄(첫 칸만 긴 글)은 폭 계산에서 뺍니다
          if (r.length === 1 || (ri < 5 && i === 0)) return;
          var len = String(c == null ? '' : c).length;
          widths[i] = Math.min(40, Math.max(widths[i] || 8, len + 2));
        });
      });
      ws['!cols'] = widths.map(function (w) { return { wch: w || 10 }; });
      if (sh.merges) ws['!merges'] = sh.merges;
      XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
    });
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function today() { return L.toDateStr(new Date()); }
  function tag() { return db._sample ? '_예시데이터' : ''; }
  function issuesById(issues) {
    var m = {};
    issues.forEach(function (i) { (m[i.id] = m[i.id] || []).push(i); });
    return m;
  }
  function addRows(rows, replace) {
    if (replace) { db.rows = []; delete db._sample; }
    rows.forEach(function (r) {
      db.seq = (db.seq || 0) + 1;
      r.id = 'r' + db.seq;
      db.rows.push(r);
    });
  }

  // ── 라우팅 ────────────────────────────────────────────────
  function route() { return (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'tpr'; }
  function subRoute() { return location.hash.replace(/^#\/?/, '').split('/')[1] || ''; }
  function render() {
    var r = route();
    var main = document.getElementById('main');
    main.textContent = '';
    document.querySelectorAll('#nav a').forEach(function (a) {
      if (a.getAttribute('data-route') === r || (r === 'import' && a.getAttribute('data-route') === 'data')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('sampleBanner').hidden = !db._sample;
    if (!S.available()) document.getElementById('storeBanner').hidden = false;
    if (r === 'billing') renderBilling(main);
    else if (r === 'dashboard') renderDashboard(main);
    else if (r === 'import' && imp) renderImport(main);
    else if (r === 'summary') renderSummary(main);
    else if (r === 'weekly') renderWeekly(main);
    else if (r === 'data') renderData(main);
    else renderTpr(main);
    main.setAttribute('data-route', r);
  }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  // ── 공통 버튼 ─────────────────────────────────────────────
  function sampleButton(primary) {
    return h('button', { type: 'button', class: 'btn' + (primary ? ' btn-primary' : ''), onclick: loadSample }, '예시 데이터 불러오기');
  }
  function loadSample() {
    function go() {
      db = L.emptyDb();
      db.mapping = {};
      addRows(Sample.build(new Date()).map(function (r) { return Object.assign({}, r); }));
      db.masters = Sample.masters();
      db._sample = true;
      save(); closeDialog();
      toast('예시 데이터 ' + db.rows.length + '행을 불러왔습니다');
      render();
    }
    if (db.rows.length && !db._sample) {
      openDialog('예시 데이터 불러오기', h('p', null, '지금 있는 데이터 ' + db.rows.length + '행을 지우고 예시 데이터로 바꿉니다. 먼저 「현황 엑셀 내보내기」로 받아 두세요.'), [
        h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '취소'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: go }, '지우고 불러오기')
      ]);
    } else go();
  }
  function importButton(primary) {
    var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', multiple: true, 'aria-label': '엑셀·CSV 파일 선택', onchange: function (e) { readFiles(e.target.files); } });
    return h('label', { class: 'btn file-btn' + (primary ? ' btn-primary' : '') }, '엑셀·CSV 불러오기', input);
  }
  function templateButton() {
    return h('button', { type: 'button', class: 'btn', onclick: function () { writeXlsx('표준_현황엑셀_빈양식.xlsx', L.templateSheets()); } }, '빈 양식 내려받기');
  }

  // ── 현황 데이터 ───────────────────────────────────────────
  function renderData(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '현황 데이터'),
      h('div', { class: 'btn-row' }, importButton(true), sampleButton(false), templateButton())));

    if (!db.rows.length) {
      main.appendChild(h('section', { class: 'card' },
        h('h2', null, '시작하기'),
        h('ol', { class: 'prompt-steps' },
          h('li', null, '지금 쓰는 모델별 시험일지 엑셀(여러 시트·여러 파일 가능)이나 CSV 를 「엑셀·CSV 불러오기」로 엽니다.'),
          h('li', null, '「열 맞추기」에서 엑셀의 열 이름을 표준 항목(일자·모델·운행시간·연료 소모량 등)에 연결합니다. 한 번 맞춘 연결은 기억합니다.'),
          h('li', null, '매일 받는 TPR 일지는 「시험일지 입력」에서 양식 그대로 적습니다. 지금 쓰는 시험일지 정리 엑셀(모델별 시트)도 여기서 불러오면 위쪽 「모델명/호기·초기 아워미터·목표 가동시간」까지 읽습니다.'),
          h('li', null, '「시험일지 정리」에서 모델별 누적 가동시간·누적 아워미터 표를, 「주간 현황」에서 설계담당자 메일을, 「기성처리」에서 운전시간·연료비 청구서 엑셀을 만듭니다.'),
          h('li', null, '「대시보드」에서 모델별 누적 운행시간·월별 추이·문제점·입력 누락일을 봅니다.')),
        h('p', { class: 'note' }, '실제 엑셀이 아직 없으면 「예시 데이터 불러오기」로 가상 데이터를 넣어 흐름을 볼 수 있습니다. samples 폴더의 예시 파일로 열 맞추기도 시험해 볼 수 있습니다: ',
          h('a', { href: 'samples/예시데이터_모델별엑셀.xlsx', download: true }, '모델별 엑셀(예시)'), ' · ',
          h('a', { href: 'samples/예시데이터_표준현황.csv', download: true }, '표준 현황 CSV(예시)')),
        h('div', { class: 'btn-row' }, importButton(true), sampleButton(false), templateButton())));
      return;
    }

    var issues = L.validateRows(db.rows, { holidays: holidays() });
    var sum = L.issueSummary(issues);
    var byId = issuesById(issues);

    // 검사 요약
    var check = h('section', { class: 'card', id: 'checkCard' }, h('h2', null, '입력값 검사'));
    if (!issues.length) check.appendChild(h('p', null, h('span', { class: 'badge ok' }, '이상 없음'), ' 빈 칸·누적값 역행·범위 밖 값이 없습니다.'));
    else {
      check.appendChild(h('p', null,
        h('span', { class: 'badge error' }, '오류 ' + sum.error + '건'), ' ',
        h('span', { class: 'badge warn' }, '확인 ' + sum.warn + '건'), ' ',
        '(' + sum.rows + '행) — 행을 누르면 고칠 수 있습니다. 오류 행도 집계에는 들어가니 기성 전에 확인하세요.'));
      var ul = h('ul', { class: 'miss-list' });
      var rowsById = {};
      db.rows.forEach(function (r) { rowsById[r.id] = r; });
      issues.slice().sort(function (a, b) { return a.level === b.level ? 0 : a.level === 'error' ? -1 : 1; }).slice(0, 12).forEach(function (i) {
        var r = rowsById[i.id];
        ul.appendChild(h('li', null, h('span', { class: 'badge ' + i.level }, i.level === 'error' ? '오류' : '확인'), ' ',
          h('a', { href: '#', onclick: function (e) { e.preventDefault(); editRow(r); } }, (r.date || '일자 없음') + ' · ' + (r.model || '모델 없음') + (r.unit_no ? ' ' + r.unit_no : '')),
          ' — ' + i.msg));
      });
      check.appendChild(ul);
      if (issues.length > 12) check.appendChild(h('p', { class: 'note' }, '외 ' + (issues.length - 12) + '건은 아래 표에서 「검사 결과가 있는 행만」으로 볼 수 있습니다.'));
    }
    main.appendChild(check);

    // 목록
    var list = h('section', { class: 'card' }, h('h2', null, '일지 목록'));
    var f = h('form', { class: 'filters', onsubmit: function (e) { e.preventDefault(); } });
    var fFrom = h('input', { type: 'date', name: 'from', value: dataView.from });
    var fTo = h('input', { type: 'date', name: 'to', value: dataView.to });
    var fModel = select('model', [['', '전체']].concat(L.models(db.rows)), dataView.model);
    var fOnly = h('input', { type: 'checkbox', name: 'only', checked: dataView.onlyIssues });
    function apply() {
      dataView.from = fFrom.value; dataView.to = fTo.value; dataView.model = fModel.value; dataView.onlyIssues = fOnly.checked; dataView.page = 0;
      render();
    }
    [fFrom, fTo, fModel, fOnly].forEach(function (el) { el.addEventListener('change', apply); });
    add(f, [field('시작일', fFrom), field('종료일', fTo), field('모델', fModel), h('label', { class: 'check' }, fOnly, '검사 결과가 있는 행만')]);
    list.appendChild(f);

    var rows = L.filterRows(db.rows, dataView);
    if (dataView.onlyIssues) rows = rows.filter(function (r) { return byId[r.id]; });
    rows = rows.slice().sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : (a.model < b.model ? -1 : 1); });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (dataView.page >= pages) dataView.page = pages - 1;
    var shown = rows.slice(dataView.page * PAGE, dataView.page * PAGE + PAGE);

    list.appendChild(h('div', { class: 'list-meta' },
      h('span', null, '전체 ' + db.rows.length + '행 중 ' + rows.length + '행'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { editRow(null); } }, '행 추가'),
        h('button', { type: 'button', class: 'btn', onclick: function () { writeXlsx('현황엑셀' + tag() + '_' + today() + '.xlsx', { '현황': L.standardSheet(sortByDate(db.rows)) }); } }, '현황 엑셀 내보내기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { download('현황' + tag() + '_' + today() + '.csv', new Blob([L.aoaToCsv(L.standardSheet(sortByDate(db.rows)))], { type: 'text/csv;charset=utf-8' })); } }, 'CSV 내보내기'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: clearAll }, '전체 삭제'))));

    var cols = ['date', 'model', 'unit_no', 'test_type', 'driver', 'hour_start', 'hour_end', 'run_hours', 'battery_pct', 'charge_kwh', 'fuel_type', 'fuel_qty', 'issue'];
    var thead = h('tr', null, h('th', null, '검사'), cols.map(function (k) { return h('th', null, L.FIELD[k].label); }));
    var tbody = h('tbody');
    shown.forEach(function (r) {
      var iss = byId[r.id] || [];
      var lvl = iss.some(function (i) { return i.level === 'error'; }) ? 'error' : iss.length ? 'warn' : '';
      var badFields = {};
      iss.forEach(function (i) { badFields[i.field] = true; });
      var tr = h('tr', { class: 'clickable' + (lvl ? ' row-' + lvl : ''), tabindex: '0', title: iss.map(function (i) { return i.msg; }).join('\n') || null,
        onclick: function () { editRow(r); }, onkeydown: function (e) { if (e.key === 'Enter') editRow(r); } },
        h('td', null, lvl ? h('span', { class: 'badge ' + lvl }, (lvl === 'error' ? '오류 ' : '확인 ') + iss.length) : ''),
        cols.map(function (k) {
          var v = r[k];
          if (k === 'run_hours' && v == null) { var eh = L.effectiveHours(r); v = eh == null ? '' : eh; }
          if (v == null && r._raw && r._raw[k] != null) v = r._raw[k];
          var num = L.FIELD[k].type === 'number' || L.FIELD[k].type === 'hours';
          return h('td', { class: (num ? 'num' : k === 'issue' ? 'wide' : '') + (badFields[k] ? ' bad' : '') }, num && typeof v === 'number' ? fmt(v) : (v == null ? '' : String(v)));
        }));
      tbody.appendChild(tr);
    });
    list.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, thead), tbody)));
    list.appendChild(h('p', { class: 'note' }, '운행시간 칸이 비어 있던 행은 「종료−시작 아워미터」로 계산한 값을 보여 줍니다.'));
    if (pages > 1) {
      list.appendChild(h('div', { class: 'pager' },
        h('button', { type: 'button', class: 'btn', disabled: dataView.page === 0, onclick: function () { dataView.page--; render(); } }, '이전'),
        h('span', null, (dataView.page + 1) + ' / ' + pages + ' 쪽'),
        h('button', { type: 'button', class: 'btn', disabled: dataView.page >= pages - 1, onclick: function () { dataView.page++; render(); } }, '다음')));
    }
    main.appendChild(list);
  }
  function sortByDate(rows) {
    return rows.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : (a.model < b.model ? -1 : 1); });
  }
  function clearAll() {
    openDialog('전체 삭제', h('p', null, '이 브라우저에 저장된 일지 ' + db.rows.length + '행, 모델 정보, 입력한 연료 단가를 모두 지웁니다(업체명·결재란·메일 받는 사람 설정은 남깁니다). 되돌릴 수 없습니다.'), [
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '취소'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        var mapping = db.mapping, settings = db.settings;
        db = L.emptyDb(); db.mapping = mapping || {}; db.settings = settings || {};
        save(); closeDialog(); toast('모두 지웠습니다'); render();
      } }, '모두 지우기')
    ]);
  }

  // 행 추가·고치기
  function editRow(r) {
    var isNew = !r;
    var form = h('div', { class: 'form-grid' });
    var inputs = {};
    L.STD_FIELDS.forEach(function (f) {
      var v = r ? r[f.key] : (f.key === 'date' ? today() : '');
      if (r && v == null && r._raw && r._raw[f.key] != null) v = r._raw[f.key];
      var el;
      if (f.key === 'fuel_type') {
        var opts = [['', '(없음)'], '경유', 'LPG', '전기'];
        if (v && ['경유', 'LPG', '전기'].indexOf(v) < 0) opts.push([v, v + ' (알 수 없음)']);
        el = select(f.key, opts, v || '');
      } else if (f.key === 'issue') {
        el = h('textarea', { name: f.key }); el.value = v || '';
      } else {
        el = h('input', { name: f.key, type: f.type === 'date' && (!v || L.parseDate(v)) ? 'date' : 'text', inputmode: f.type === 'number' ? 'decimal' : null, value: v == null ? '' : String(v) });
      }
      inputs[f.key] = el;
      var hint = f.key === 'run_hours' ? '비우면 종료−시작 아워미터로 계산합니다. 3:30 도 됩니다' : null;
      var fl = field(f.label + (f.required ? ' (필수)' : ''), el, hint);
      if (f.key === 'issue') fl.classList.add('span-all');
      form.appendChild(fl);
    });
    var msgs = r ? (issuesById(L.validateRows(db.rows, { holidays: holidays() }))[r.id] || []) : [];
    var content = [
      msgs.length ? h('div', { class: 'alert error' }, h('ul', { class: 'miss-list' }, msgs.map(function (i) { return h('li', null, i.msg); }))) : null,
      r && r._src ? h('p', { class: 'note' }, '가져온 곳: ' + r._src) : null,
      form
    ];
    openDialog(isNew ? '일지 행 추가' : '일지 행 고치기', content, [
      isNew ? null : h('button', { type: 'button', class: 'btn', onclick: function () { closeDialog(); openTpr(r); } }, '일지 양식으로 열기'),
      isNew ? null : h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        db.rows = db.rows.filter(function (x) { return x.id !== r.id; });
        save(); closeDialog(); toast('행을 지웠습니다'); render();
      } }, '행 삭제'),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '취소'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var src = {};
        Object.keys(inputs).forEach(function (k) { src[k] = inputs[k].value; });
        var nr = L.normalizeRow(src);
        if (!nr.date || !nr.model) { toast('일자와 모델은 꼭 적어야 합니다', true); return; }
        if (isNew) addRows([nr]);
        else {
          nr.id = r.id; if (r._src) nr._src = r._src;
          // 일지 양식에만 있는 값(배터리 구간·점검항목 등)은 그대로 옮겨 둡니다
          L.EXTRA_KEYS.forEach(function (k) { if (r[k] !== undefined && nr[k] === undefined) nr[k] = r[k]; });
          db.rows = db.rows.map(function (x) { return x.id === r.id ? nr : x; });
        }
        save(); closeDialog(); toast(isNew ? '행을 추가했습니다' : '고쳤습니다'); render();
      } }, '저장')
    ]);
  }

  // ── 불러오기 ──────────────────────────────────────────────
  function decodeCsv(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch (e) {
      try { return new TextDecoder('euc-kr').decode(buf); } catch (e2) { return new TextDecoder('utf-8').decode(buf); }
    }
  }
  function readFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var out = [];
    var left = files.length;
    files.forEach(function (file, fi) {
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var wb;
          if (/\.csv$/i.test(file.name)) wb = XLSX.read(decodeCsv(new Uint8Array(rd.result)), { type: 'string', raw: true });
          else wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
          var sheets = wb.SheetNames.map(function (n) {
            var aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
            var hr = L.detectHeaderRow(aoa);
            return { name: /\.csv$/i.test(file.name) ? '' : n, aoa: aoa, headerRow: hr, include: aoa.length > hr + 1 };
          });
          out[fi] = { name: file.name, sheets: sheets };
        } catch (e) {
          out[fi] = { name: file.name, error: '읽지 못했습니다(' + e.message + ')', sheets: [] };
        }
        if (--left === 0) startImport(out);
      };
      rd.onerror = function () { out[fi] = { name: file.name, error: '파일을 열지 못했습니다', sheets: [] }; if (--left === 0) startImport(out); };
      rd.readAsArrayBuffer(file);
    });
  }
  function importHeaders() {
    var seen = {}, list = [];
    imp.files.forEach(function (f) {
      f.sheets.forEach(function (s) {
        if (!s.include) return;
        L.headersOf(s.aoa, s.headerRow).forEach(function (hd) { if (hd && !seen[hd]) { seen[hd] = true; list.push(hd); } });
      });
    });
    return list;
  }
  function startImport(files) {
    imp = { files: files, mapping: {}, fallback: 'sheet', fixed: '', mode: db.rows.length && !db._sample ? 'append' : 'replace' };
    imp.mapping = L.autoMap(importHeaders(), db.mapping);
    if (imp.mapping.model) imp.fallback = 'none';
    else if (files.every(function (f) { return !f.sheets.some(function (s) { return s.name; }); })) imp.fallback = 'file';
    if (location.hash === '#/import') render(); else location.hash = '#/import';
  }
  function convertImport() {
    var rows = [], skipped = 0;
    imp.files.forEach(function (f) {
      f.sheets.forEach(function (s) {
        if (!s.include) return;
        var res = L.applyMapping(s.aoa, { mapping: imp.mapping, headerRow: s.headerRow, sheetName: s.name, fileName: f.name, modelFallback: imp.fallback, modelFixed: imp.fixed });
        rows = rows.concat(res.rows); skipped += res.skipped;
      });
    });
    return { rows: rows, skipped: skipped };
  }
  function importMasters() {
    var out = [];
    imp.files.forEach(function (f) {
      f.sheets.forEach(function (s) { if (s.include) { var m = L.parseSummaryHeader(s.aoa); if (m) out.push(m); } });
    });
    return out;
  }
  function renderImport(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '불러오기 — 열 맞추기'),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/data', onclick: function () { imp = null; } }, '취소'))));

    // 1. 시트 고르기
    var sheetCard = h('section', { class: 'card' }, h('h2', null, '1. 가져올 시트'),
      h('p', { class: 'note' }, '머리행(열 이름이 적힌 줄)을 자동으로 찾았습니다. 다르면 줄 번호를 고치세요. 안내·요약 시트는 빼 주세요.'));
    var ul = h('ul', { class: 'sheet-list' });
    imp.files.forEach(function (f) {
      if (f.error) { ul.appendChild(h('li', { class: 'alert error' }, f.name + ' — ' + f.error)); return; }
      f.sheets.forEach(function (s) {
        var cb = h('input', { type: 'checkbox', checked: s.include, onchange: function () { s.include = cb.checked; imp.mapping = L.autoMap(importHeaders(), Object.assign({}, db.mapping, imp.mapping)); render(); } });
        var hr = h('input', { type: 'number', min: '1', max: String(Math.max(1, s.aoa.length)), value: String(s.headerRow + 1), 'aria-label': '머리행 줄 번호',
          onchange: function () { var n = parseInt(hr.value, 10); if (n >= 1 && n <= s.aoa.length) { s.headerRow = n - 1; imp.mapping = L.autoMap(importHeaders(), Object.assign({}, db.mapping, imp.mapping)); } render(); } });
        ul.appendChild(h('li', { class: 'sheet-item' },
          h('label', { class: 'check' }, cb, h('span', null, h('strong', null, f.name + (s.name ? ' / ' + s.name : '')), ' · 데이터 ' + Math.max(0, s.aoa.length - s.headerRow - 1) + '줄')),
          h('span', { class: 'hr' }, '머리행', hr, '번째 줄')));
      });
    });
    sheetCard.appendChild(ul);
    main.appendChild(sheetCard);

    // 2. 열 맞추기
    var headers = importHeaders();
    var mapCard = h('section', { class: 'card' }, h('h2', null, '2. 열 맞추기'),
      h('p', { class: 'note' }, '왼쪽 표준 항목마다 내 엑셀의 어느 열인지 고릅니다. 없는 항목은 「(없음)」으로 두면 됩니다. 저장하면 다음에 같은 열 이름을 자동으로 연결합니다.'));
    var grid = h('div', { class: 'map-grid' });
    L.STD_FIELDS.forEach(function (f) {
      var s = select('map_' + f.key, [['', '(없음)']].concat(headers), imp.mapping[f.key] || '');
      s.addEventListener('change', function () { if (s.value) imp.mapping[f.key] = s.value; else delete imp.mapping[f.key]; render(); });
      grid.appendChild(field(f.label + (f.required ? ' (필수)' : ''), s));
    });
    mapCard.appendChild(grid);
    // 모델 열이 없을 때
    var fb = select('fallback', [['sheet', '시트 이름을 모델로'], ['file', '파일 이름을 모델로'], ['fixed', '직접 적은 모델명'], ['none', '채우지 않음']], imp.fallback);
    var fixed = h('input', { type: 'text', name: 'fixed', value: imp.fixed, placeholder: '예: 모델명' });
    fb.addEventListener('change', function () { imp.fallback = fb.value; render(); });
    fixed.addEventListener('change', function () { imp.fixed = fixed.value.trim(); render(); });
    mapCard.appendChild(h('div', { class: 'form-grid', style: 'margin-top:16px' },
      field('모델 칸이 비어 있으면', fb, '모델별로 시트·파일을 나눠 쓰는 경우 시트 이름이나 파일 이름을 모델로 씁니다'),
      imp.fallback === 'fixed' ? field('모델명', fixed) : null));
    main.appendChild(mapCard);

    // 3. 미리보기와 확정
    var conv = convertImport();
    var issues = L.validateRows(conv.rows.map(function (r, i) { return Object.assign({ id: 'p' + i }, r); }), { holidays: holidays() });
    var sum = L.issueSummary(issues);
    var prev = h('section', { class: 'card' }, h('h2', null, '3. 미리보기와 확정'));
    if (!imp.mapping.date) prev.appendChild(h('div', { class: 'alert error' }, '「일자」 열을 연결해야 합니다.'));
    prev.appendChild(h('p', null, '표준 형식으로 바꾼 행 ' + conv.rows.length + '개' + (conv.skipped ? ' (빈 줄 ' + conv.skipped + '개 건너뜀)' : '') + ' · ',
      h('span', { class: 'badge error' }, '오류 ' + sum.error), ' ', h('span', { class: 'badge warn' }, '확인 ' + sum.warn),
      ' — 불러온 뒤 「현황 데이터」에서 고칠 수 있습니다.'));
    var cols = ['date', 'model', 'unit_no', 'driver', 'hour_start', 'hour_end', 'run_hours', 'fuel_type', 'fuel_qty', 'charge_kwh', 'issue'];
    var tb = h('tbody');
    conv.rows.slice(0, 5).forEach(function (r) {
      tb.appendChild(h('tr', null, cols.map(function (k) {
        var v = k === 'run_hours' ? L.effectiveHours(r) : r[k];
        if (v == null && r._raw && r._raw[k] != null) v = r._raw[k] + ' (못 읽음)';
        return h('td', { class: typeof v === 'number' ? 'num' : '' }, v == null ? '' : typeof v === 'number' ? fmt(v) : String(v));
      })));
    });
    prev.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', null, h('tr', null, cols.map(function (k) { return h('th', null, L.FIELD[k].label); }))), tb)));
    var mode = select('mode', [['append', '지금 데이터 뒤에 추가'], ['replace', '지금 데이터를 지우고 바꾸기']], imp.mode);
    mode.addEventListener('change', function () { imp.mode = mode.value; });
    prev.appendChild(h('div', { class: 'form-grid', style: 'margin-top:16px' },
      field('불러오는 방식', mode, db.rows.length ? '지금 ' + db.rows.length + '행' + (db._sample ? '(예시 데이터)' : '') + '이 있습니다' : null)));
    prev.appendChild(h('div', { class: 'btn-row', style: 'margin-top:16px' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: !imp.mapping.date || !conv.rows.length, onclick: function () {
        var c = convertImport();
        db.mapping = Object.assign({}, imp.mapping);
        var wasSample = db._sample;
        addRows(c.rows, imp.mode === 'replace' || db._sample);
        if (wasSample || imp.mode === 'replace') db.masters = {};
        // 정리 엑셀 머리(모델명/호기·초기 아워미터·목표 가동시간·PG)는 모델 정보로 등록합니다(이미 있으면 그대로)
        importMasters().forEach(function (m) {
          var k = L.masterKey(m.model, m.unit_no);
          if (!db.masters[k]) db.masters[k] = m;
        });
        save();
        var s2 = L.issueSummary(L.validateRows(db.rows, { holidays: holidays() }));
        imp = null;
        location.hash = '#/data';
        toast(c.rows.length + '행을 불러왔습니다. 검사 오류 ' + s2.error + '건 · 확인 ' + s2.warn + '건');
      } }, conv.rows.length + '행 불러오기')));
    var ims = importMasters();
    if (ims.length) prev.appendChild(h('p', { class: 'note' }, '정리 엑셀 머리에서 모델 정보 ' + ims.length + '개를 읽었습니다: ' +
      ims.map(function (m) { return L.modelLabel(m.model, m.unit_no) + '(초기 ' + (m.initialHour == null ? '-' : m.initialHour) + 'h · 목표 ' + (m.targetHours == null ? '-' : m.targetHours) + 'h)'; }).join(', ') +
      '. 불러오면 「시험일지 정리」의 모델 정보로 등록합니다.'));
    if (db._sample) prev.appendChild(h('p', { class: 'note' }, '예시 데이터는 실제 데이터와 섞이지 않도록 불러올 때 지웁니다.'));
    main.appendChild(prev);
  }

  // ── 공통: 모델·호기 ───────────────────────────────────────
  function units() { return L.unitList(db.rows, db.masters); }
  function settings() { db.settings = db.settings || {}; return db.settings; }
  // 공휴일 목록(마감일·휴일 근무 계산용) — 사용자가 고친 글자가 있으면 그것, 없으면 올해·내년 초안
  function holidayText() {
    var st = settings();
    if (typeof st.holidays === 'string') return st.holidays;
    var y = new Date().getFullYear();
    return L.defaultHolidayText([y, y + 1]);
  }
  // 회사 휴무일(휴가·근로자의 날 등) — 수강생 답(09-29): 일반 달력에 회사 휴일을 더해 씁니다
  function companyHolidayText() {
    var st = settings();
    if (typeof st.companyHolidays === 'string') return st.companyHolidays;
    var y = new Date().getFullYear();
    return L.defaultCompanyHolidayText([y, y + 1]);
  }
  function holidays() { return Object.assign({}, L.parseHolidays(holidayText()).map, L.parseHolidays(companyHolidayText()).map); }
  function lpgMonthly() { db.prices = db.prices || {}; db.prices.lpgMonthly = db.prices.lpgMonthly || {}; return db.prices.lpgMonthly; }
  // 작성일 옆에 붙이는 요일·휴일 안내
  function dayNote(date) {
    if (!date) return '';
    var dk = L.dayKind(date, holidays());
    var s = '(' + L.weekdayKo(date) + ')';
    if (dk.kind === '토') return s + ' 휴일 근무 — 과급 30%';
    if (dk.kind === '일') return s + ' 일요일 — 계약상 휴일 근무는 토요일 주간뿐입니다';
    if (dk.kind === '공휴일') return s + ' ' + dk.name + ' — 계약상 휴일 근무는 토요일 주간뿐입니다';
    var p = String(date).split('-');
    if (L.lastWorkday(+p[0], +p[1], holidays()) === date) return s + ' 기성 마감일';
    return s;
  }
  function lastLogOf(model, unit, beforeDate, excludeId) {
    var key = L.masterKey(model, unit);
    var list = L.sortLogs(L.rowsOfUnit(db.rows, key).filter(function (r) { return r.id !== excludeId && r.date && (!beforeDate || r.date <= beforeDate); }));
    return list[list.length - 1] || null;
  }
  function numIn(name, value, attrs) {
    return h('input', Object.assign({ type: 'text', inputmode: 'decimal', name: name, value: value == null ? '' : String(value), autocomplete: 'off' }, attrs || {}));
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg || '복사했습니다'); } catch (e) { toast('복사하지 못했습니다. 직접 선택해 복사해 주세요', true); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(okMsg || '복사했습니다'); }, fallback);
    else fallback();
  }

  // ── 시험일지 입력(TPR) ────────────────────────────────────
  function blankTpr(prev) {
    var f = L.rowToTpr({});
    f.date = today();
    f.shift = '주';
    if (prev) {
      // 「저장하고 다음 일지」: 모델·호기·운전자·연료는 이어 쓰고, 주간 다음은 같은 날 야간, 야간 다음은 다음 날 주간
      ['model', 'unit_no', 'driver', 'fuel_type', 'test_type', 'weather'].forEach(function (k) { f[k] = prev[k] || ''; });
      if (prev.shift === '주') { f.date = prev.date; f.shift = '야'; }
      else { f.date = prev.date ? L.addDays(prev.date, 1) : today(); f.shift = '주'; }
      if (prev.hour_end != null && prev.hour_end !== '') f.hour_start = prev.hour_end;
      f.battery = f.battery.map(function (b, i) { return { label: (prev.battery && prev.battery[i] && prev.battery[i].label) || b.label, start: '', end: '' }; });
    }
    f.problems = [{ text: '', note: '' }];
    return f;
  }
  function openTpr(r) {
    tpr.form = L.rowToTpr(r);
    if (!tpr.form.problems.length) tpr.form.problems = [{ text: '', note: '' }];
    tpr.editId = r.id;
    if (location.hash.indexOf('#/tpr') === 0) render(); else location.hash = '#/tpr';
  }
  function renderTpr(main) {
    if (!tpr.form) tpr.form = blankTpr(null);
    var f = tpr.form;
    var editing = tpr.editId && db.rows.some(function (x) { return x.id === tpr.editId; });
    if (!editing) tpr.editId = null;

    var photoInput = h('input', { type: 'file', accept: 'image/*,application/pdf', 'aria-label': '일지 사진·PDF 선택', onchange: function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (tpr.photo) URL.revokeObjectURL(tpr.photo);
      tpr.photo = URL.createObjectURL(file); tpr.photoName = file.name; tpr.photoType = file.type;
      render();
    } });
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, editing ? '시험일지 고치기 (TPR)' : '시험일지 입력 (TPR)'),
      h('div', { class: 'btn-row' },
        h('label', { class: 'btn file-btn' }, tpr.photo ? '다른 사진 띄우기' : '일지 사진 옆에 띄우기', photoInput),
        h('button', { type: 'button', class: 'btn', onclick: aiDialog }, 'AI로 옮겨 적기(하루 2장까지)'),
        h('button', { type: 'button', class: 'btn', onclick: function () { tpr.form = blankTpr(null); tpr.editId = null; render(); } }, '새 일지'),
        db.rows.length ? null : sampleButton(false))));
    main.appendChild(h('p', { class: 'note' }, '운전자가 쓴 「내구시험일지 및 문제점 보고서(TPR)」와 같은 순서로 칸을 두었습니다. 사진을 옆에 띄워 두고 위에서부터 옮겨 적어 주세요. 사진은 저장하지 않고 이 창에서만 보여 주며, 외부로 보내지 않습니다(TPR 은 대외비라 이 방법이 기본입니다).'));
    // 문제점이 적힌 일지를 저장했으면 — 메일은 담당자와 협의한 뒤 필요할 때만 직접 보냅니다(수강생 답 09-30, 자동 발송 없음)
    var issueRow = tpr.lastIssue ? db.rows.find(function (x) { return x.id === tpr.lastIssue; }) : null;
    if (issueRow) {
      main.appendChild(h('div', { class: 'alert info' }, '방금 저장한 일지(' + issueRow.date + ' ' + L.modelLabel(issueRow.model, issueRow.unit_no) + ')에 문제점이 있습니다. 담당자와 협의한 뒤 메일이 필요하면 ',
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { alertDialog(issueRow); } }, '문제점 메일 정리'),
        ' 를 눌러 문제점·사진 목록을 복사해 보내 주세요. ',
        h('button', { type: 'button', class: 'linkish', onclick: function () { tpr.lastIssue = null; render(); } }, '닫기')));
    }
    var fDate = L.parseDate(f.date);
    if (fDate && !f.provisional) {
      var fp = fDate.split('-');
      if (L.lastWorkday(+fp[0], +fp[1], holidays()) === fDate) {
        main.appendChild(h('div', { class: 'alert warn' }, fDate + '(' + L.weekdayKo(fDate) + ')는 기성 마감일입니다. 근무가 끝나기 전에 가동시간·연료 등 기성에 필요한 값만 적고 아래 「마감 전 가입력(예상치)」에 표시해 저장해 주세요. 가동이 끝나면 이 일지를 다시 열어 확정 값으로 저장합니다.'));
      }
    }

    var layout = h('div', { class: 'tpr-layout' + (tpr.photo ? ' with-photo' : '') });
    if (tpr.photo) {
      var isPdf = /pdf/i.test(tpr.photoType || '') || /\.pdf$/i.test(tpr.photoName);
      var viewer = h('div', { class: 'photo-pane' },
        h('div', { class: 'photo-head' }, h('strong', null, tpr.photoName),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { viewer.classList.toggle('zoom'); } }, '확대/축소'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { URL.revokeObjectURL(tpr.photo); tpr.photo = null; render(); } }, '닫기')),
        h('div', { class: 'photo-box' }, isPdf ? h('iframe', { src: tpr.photo, title: '일지 PDF' }) : h('img', { src: tpr.photo, alt: '운전자가 작성한 시험일지 사진' })));
      layout.appendChild(viewer);
    }
    var formWrap = h('div', { class: 'tpr-form' });
    layout.appendChild(formWrap);
    main.appendChild(layout);

    function bind(el, key) {
      el.addEventListener('input', function () { f[key] = el.type === 'checkbox' ? el.checked : el.value; });
      el.addEventListener('change', function () { f[key] = el.type === 'checkbox' ? el.checked : el.value; });
      return el;
    }
    // 1. 머리
    var us = units();
    var dl = h('datalist', { id: 'dlModels' }, us.map(function (u) { return h('option', { value: u.model }); }));
    var dlU = h('datalist', { id: 'dlUnits' }, us.map(function (u) { return u.unit_no ? h('option', { value: u.unit_no }) : null; }));
    var dlW = h('datalist', { id: 'dlWeather' }, ['맑음', '흐림', '비', '눈', '흐림/비'].map(function (w) { return h('option', { value: w }); }));
    var wd = h('span', { class: 'weekday' }, dayNote(L.parseDate(f.date)));
    var dateIn = bind(h('input', { type: 'date', name: 'date', value: L.parseDate(f.date) || '' }), 'date');
    // 일지에 적힌 요일 — 손글씨 날짜를 잘못 읽었는지 요일로 대조합니다(수강생 제안 09-29)
    var dowIn = bind(select('dow', [['', '(요일)'], '월', '화', '수', '목', '금', '토', '일'], L.normDow(f.dow)), 'dow');
    dowIn.setAttribute('aria-label', '일지에 적힌 요일');
    var dowWarn = h('div', { class: 'dow-warn', 'aria-live': 'polite' });
    function refreshDow() {
      dowWarn.textContent = '';
      var last = f.model ? lastLogOf(f.model.trim(), (f.unit_no || '').trim(), '', tpr.editId) : null;
      var c = L.dateWeekdayCheck(dateIn.value, dowIn.value, { near: last ? L.addDays(last.date, 1) : '' });
      if (!c.mismatch) return;
      add(dowWarn, [h('span', null, c.msg + ' ')].concat(c.candidates.slice(0, 3).map(function (d) {
        return h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { f.date = d; dateIn.value = d; wd.textContent = dayNote(d); refreshDow(); refreshMeterHint(); } }, d.slice(5).replace('-', '/') + '(' + L.weekdayKo(d) + ')로 고치기');
      })));
    }
    dateIn.addEventListener('change', function () { wd.textContent = dayNote(dateIn.value); refreshDow(); });
    dowIn.addEventListener('change', refreshDow);
    var shiftBox = h('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': '주/야/휴' }, L.SHIFTS.map(function (s) {
      var rb = h('input', { type: 'radio', name: 'shift', value: s.key, checked: f.shift === s.key });
      rb.addEventListener('change', function () { if (rb.checked) f.shift = s.key; });
      return h('label', { class: 'check' }, rb, s.label);
    }));
    var modelIn = bind(h('input', { type: 'text', name: 'model', value: f.model, list: 'dlModels', placeholder: '예: MODEL-X', autocomplete: 'off' }), 'model');
    var unitIn = bind(h('input', { type: 'text', name: 'unit_no', value: f.unit_no, list: 'dlUnits', placeholder: '예: #4', autocomplete: 'off' }), 'unit_no');
    var hsIn = bind(numIn('hour_start', f.hour_start), 'hour_start');
    var heIn = bind(numIn('hour_end', f.hour_end), 'hour_end');
    var runIn = bind(numIn('run_hours', f.run_hours), 'run_hours');
    var meterHint = h('small', { class: 'hint' });
    function refreshMeterHint() {
      meterHint.textContent = '';
      var last = f.model ? lastLogOf(f.model.trim(), (f.unit_no || '').trim(), L.parseDate(f.date) || '', tpr.editId) : null;
      if (last && last.hour_end != null) {
        add(meterHint, ['전 일지(' + last.date + (last.shift ? ' ' + last.shift : '') + ') 금일 값 ' + L.fmtNum(last.hour_end) + 'h ',
          h('button', { type: 'button', class: 'linkish', onclick: function () { f.hour_start = last.hour_end; hsIn.value = last.hour_end; } }, '전일 칸에 넣기')]);
      }
      add(meterHint, [' ', h('button', { type: 'button', class: 'linkish', onclick: function () {
        var s = L.parseNum(hsIn.value), r = L.parseHours(runIn.value);
        if (s == null || r == null) { toast('전일 값과 금일가동시간을 먼저 적어 주세요', true); return; }
        f.hour_end = L.r2(s + r); heIn.value = f.hour_end;
      } }, '금일 = 전일 + 가동시간')]);
    }
    [modelIn, unitIn, dateIn].forEach(function (el) { el.addEventListener('change', refreshMeterHint); });
    dateIn.id = 'tprDate';
    refreshMeterHint();
    refreshDow();
    formWrap.appendChild(h('section', { class: 'card tpr-sec' }, h('h2', null, '작성 정보'), dl, dlU, dlW,
      h('div', { class: 'form-grid three' },
        field('작성자(운전자 코드)', bind(h('input', { type: 'text', name: 'driver', value: f.driver, placeholder: '예: 운전자A', autocomplete: 'off' }), 'driver'), '공개 자료가 될 수 있으니 코드·약칭을 권합니다'),
        h('div', { class: 'field' }, h('label', { for: 'tprDate' }, '작성일 ', wd), h('div', { class: 'pair date-dow' }, dateIn, dowIn), dowWarn),
        h('div', { class: 'field' }, h('span', null, '주/야/휴'), shiftBox),
        field('날씨', bind(h('input', { type: 'text', name: 'weather', value: f.weather, list: 'dlWeather', autocomplete: 'off' }), 'weather')),
        field('모델명', modelIn),
        field('호기', unitIn),
        field('금일충전시간(h)', bind(numIn('charge_h', f.charge_h), 'charge_h')),
        field('금일가동시간(h)', runIn, '3:30 처럼 시:분도 됩니다'),
        h('div', { class: 'field span-2' }, h('span', null, 'Hour Meter (전일 / 금일)'),
          h('div', { class: 'pair' }, hsIn, h('span', { 'aria-hidden': 'true' }, '/'), heIn, h('span', null, '시간')), meterHint))));
    hsIn.setAttribute('aria-label', 'Hour Meter 전일'); heIn.setAttribute('aria-label', 'Hour Meter 금일');

    // 2. 시험 항목
    var items = [
      ['cycle_h', '기본/요철 사이클', 'h'], ['basic_cycles', '기본 사이클', '회'], ['bump_cycles', '요철 사이클', '회'],
      ['battery_check_h', '배터리 충전 점검', 'h'], ['inspect_h', '장비 점검/TPR 작성', 'h'],
      ['ac_h', '에어컨 가동', 'h'], ['heater_h', '히터 가동', 'h'], ['special_h', '특화 시험(동력전달 특화 등)·장비수리', 'h']
    ];
    var itTb = h('tbody');
    items.forEach(function (it) {
      var inp = bind(numIn(it[0], f[it[0]], { 'aria-label': it[1] + '(' + it[2] + ')' }), it[0]);
      itTb.appendChild(h('tr', null, h('th', { scope: 'row' }, it[1]), h('td', null, h('div', { class: 'unit-in' }, inp, h('span', null, it[2])))));
    });
    var wn = bind(h('input', { type: 'checkbox', name: 'wheel_nut', checked: !!f.wheel_nut }), 'wheel_nut');
    itTb.appendChild(h('tr', null, h('th', { scope: 'row' }, '휠너트 풀림 확인'), h('td', null, h('label', { class: 'check' }, wn, '확인함'))));
    // 3. 배터리 상태
    var bTb = h('tbody');
    var useOut = h('p', { class: 'note' });
    function refreshUse() {
      var u = L.batteryUse(f.battery.map(function (b) { return { start: L.parseNum(b.start), end: L.parseNum(b.end) }; }));
      useOut.textContent = '방전 합계 ' + L.fmtNum(u.use) + '% · 충전 합계 ' + L.fmtNum(u.charge) + '% (시작보다 종료가 크면 충전 구간으로 봅니다)';
    }
    f.battery.forEach(function (b, i) {
      function bb(key, el) { el.addEventListener('input', function () { b[key] = el.value; refreshUse(); }); return el; }
      bTb.appendChild(h('tr', null,
        h('td', null, bb('label', h('input', { type: 'text', value: b.label, 'aria-label': (i + 1) + '번째 구간 이름' }))),
        h('td', null, h('div', { class: 'unit-in' }, bb('start', numIn('bs' + i, b.start, { 'aria-label': (i + 1) + '번째 구간 시작 %' })), h('span', null, '%'))),
        h('td', null, h('div', { class: 'unit-in' }, bb('end', numIn('be' + i, b.end, { 'aria-label': (i + 1) + '번째 구간 종료 %' })), h('span', null, '%')))));
    });
    refreshUse();
    formWrap.appendChild(h('div', { class: 'grid-2 tight' },
      h('section', { class: 'card tpr-sec' }, h('h2', null, '실 작업 내용 — 시험 항목'),
        h('table', { class: 'form-table' }, h('thead', null, h('tr', null, h('th', null, '시험 항목'), h('th', null, '시간·회수'))), itTb)),
      h('section', { class: 'card tpr-sec' }, h('h2', null, '장비 가동시 배터리 상태표기 (시작 및 종료)'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'form-table' }, h('thead', null, h('tr', null, h('th', null, '구간'), h('th', null, '시작'), h('th', null, '종료'))), bTb)),
        h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { f.battery.push({ label: '', start: '', end: '' }); render(); } }, '구간 추가')),
        useOut)));

    // 4. 문제점
    var pTb = h('tbody');
    f.problems.forEach(function (p, i) {
      var t = h('textarea', { rows: '2', 'aria-label': (i + 1) + '번 문제점/조치내용' }); t.value = p.text || '';
      t.addEventListener('input', function () { p.text = t.value; });
      var n = h('input', { type: 'text', value: p.note || '', 'aria-label': (i + 1) + '번 비고' });
      n.addEventListener('input', function () { p.note = n.value; });
      pTb.appendChild(h('tr', null, h('td', { class: 'num' }, String(i + 1)), h('td', null, t), h('td', null, n),
        h('td', null, f.problems.length > 1 ? h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': (i + 1) + '번 줄 지우기', onclick: function () { f.problems.splice(i, 1); render(); } }, '지우기') : null)));
    });
    formWrap.appendChild(h('section', { class: 'card tpr-sec' }, h('h2', null, '금일 발생 문제점 / 조치내용'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'form-table problems' }, h('thead', null, h('tr', null, h('th', null, 'No.'), h('th', null, '금일 발생 문제점/조치내용'), h('th', null, '비고'), h('th', null, ''))), pTb)),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { f.problems.push({ text: '', note: '' }); render(); } }, '줄 추가')),
      h('p', { class: 'note' }, '문제가 없던 날은 비워 두면 됩니다. 여러 줄은 정리표·메일에서 「1) … / 2) …」로 이어 붙습니다.')));

    // 5. 일일 주요 점검 항목
    var cTb = h('tbody');
    L.CHECK_ITEMS.forEach(function (txt, i) {
      var grp = h('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': '점검 ' + (i + 1) + ' 결과' }, ['유', '무'].map(function (v) {
        var rb = h('input', { type: 'radio', name: 'chk' + i, value: v, checked: f.checks[i] === v });
        rb.addEventListener('change', function () { if (rb.checked) f.checks[i] = v; });
        return h('label', { class: 'check' }, rb, v === '유' ? '有(유)' : '無(무)');
      }));
      cTb.appendChild(h('tr', null, h('td', { class: 'num' }, '①②③④⑤'.charAt(i)), h('td', null, txt), h('td', null, grp)));
    });
    formWrap.appendChild(h('section', { class: 'card tpr-sec' }, h('h2', null, '일일 주요 점검 항목'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'form-table' }, h('thead', null, h('tr', null, h('th', null, '순서'), h('th', null, '점검 항목'), h('th', null, '점검 결과'))), cTb)),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { f.checks = L.CHECK_ITEMS.map(function () { return '무'; }); render(); } }, '모두 無로'))));

    // 6. 협조·개선 + 7. 주유
    var coop = bind(h('textarea', { name: 'coop', rows: '2' }), 'coop'); coop.value = f.coop || '';
    var imprv = bind(h('textarea', { name: 'improve', rows: '2' }), 'improve'); imprv.value = f.improve || '';
    var master = f.model ? (db.masters || {})[L.masterKey(f.model.trim(), (f.unit_no || '').trim())] : null;
    var fuelSel = bind(select('fuel_type', [['', master && master.fuel ? '(모델 정보: ' + master.fuel + ')' : '(없음)'], '경유', 'LPG', '전기'], f.fuel_type || ''), 'fuel_type');
    formWrap.appendChild(h('div', { class: 'grid-2 tight' },
      h('section', { class: 'card tpr-sec' }, h('h2', null, '협조·지원·미결 / 개선·건의'),
        h('div', { class: 'form-grid one' }, field('협조·지원·미결 사항', coop), field('개선/건의사항 (편의성, 정비성 등)', imprv))),
      h('section', { class: 'card tpr-sec' }, h('h2', null, '주유 기록 (정리표·연료비 정산용)'),
        h('p', { class: 'note' }, '경유·요소수는 주입한 날 주유소에서 카드로 결제한 금액(VAT 포함)을 사용량과 함께 바로 적어 주세요. 연료비 정산은 이 금액을 그대로 더합니다. LPG 는 사용량(kg)만 적으면 기성처리 때 오피넷 월 평균 단가로 계산합니다.'),
        h('div', { class: 'form-grid' },
          field('연료 종류', fuelSel),
          field('주입량(경유 L · LPG kg)', bind(numIn('fuel_qty', f.fuel_qty), 'fuel_qty')),
          field('경유 결제 금액(원)', bind(numIn('fuel_won', f.fuel_won, { placeholder: '예: 94,000' }), 'fuel_won'), '카드 결제 금액 · LPG 는 비워 둡니다'),
          field('LPG 통 수', bind(numIn('lpg_bottles', f.lpg_bottles), 'lpg_bottles'), 'kg 칸이 비면 통당 ' + (settings().bottleKg || 15) + 'kg 으로 계산'),
          field('요소수 주입량(L)', bind(numIn('urea_l', f.urea_l), 'urea_l')),
          field('요소수 결제 금액(원)', bind(numIn('urea_won', f.urea_won), 'urea_won')),
          h('div', { class: 'span-all' }, field('사진 참조(파일명·보관 위치)', bind(h('input', { type: 'text', name: 'photo', value: f.photo || '' }), 'photo')))))));

    // 저장
    function doSave(next) {
      var nr = L.tprToRow(f, { bottleKg: L.parseNum(settings().bottleKg) || 15 });
      if (!nr.date || !nr.model) { toast('작성일과 모델명은 꼭 적어 주세요', true); return; }
      var old = tpr.editId ? db.rows.find(function (x) { return x.id === tpr.editId; }) : null;
      var wasProvisional = !!(old && old.provisional);
      nr = L.applyProvisional(nr, old, !!f.provisional, today());
      if (tpr.editId) {
        nr.id = tpr.editId;
        if (old && old._src) nr._src = old._src;
        db.rows = db.rows.map(function (x) { return x.id === tpr.editId ? nr : x; });
      } else addRows([nr]);
      save();
      var iss = L.validateRows(db.rows, { holidays: holidays() }).filter(function (i) { return i.id === nr.id; });
      var msg = (nr.provisional ? '가입력(예상치)으로 저장했습니다' : wasProvisional ? '확정 값으로 저장했습니다' : tpr.editId ? '고쳤습니다' : '저장했습니다') + (iss.length ? ' — 확인할 곳 ' + iss.length + '건: ' + iss.map(function (i) { return i.msg; }).join(' / ') : '');
      tpr.editId = null;
      tpr.lastIssue = nr.issue ? nr.id : null;
      var dc = L.dateWeekdayCheck(nr.date, nr.dow);
      if (dc.mismatch) msg += ' — ' + dc.msg;
      tpr.form = next ? blankTpr(nr) : blankTpr(null);
      if (!next) { tpr.form.model = nr.model; tpr.form.unit_no = nr.unit_no; tpr.form.driver = nr.driver; }
      render();
      window.scrollTo(0, 0);
      toast(msg, iss.some(function (i) { return i.level === 'error'; }) || dc.mismatch);
    }
    var provCb = h('input', { type: 'checkbox', name: 'provisional', checked: !!f.provisional });
    provCb.addEventListener('change', function () { f.provisional = provCb.checked; });
    var editingProv = editing && db.rows.some(function (x) { return x.id === tpr.editId && x.provisional; });
    formWrap.appendChild(h('div', { class: 'prov-bar' },
      h('label', { class: 'check' }, provCb, '마감 전 가입력(예상치)'),
      h('span', { class: 'note' }, '기성 마감일에 근무가 끝나기 전 가동시간·연료만 먼저 적을 때 표시합니다. 가동 후 이 일지를 다시 열어 표시를 끄고 저장하면 확정되고, 예상치와의 차이가 기성처리에 남습니다.'),
      editingProv ? h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { f.provisional = false; doSave(false); } }, '가동 후 확정 저장') : null));
    formWrap.appendChild(h('div', { class: 'save-bar' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { doSave(true); } }, editing ? '고쳐 저장하고 다음 일지' : '저장하고 다음 일지'),
      h('button', { type: 'button', class: 'btn', onclick: function () { doSave(false); } }, editing ? '고쳐 저장' : '저장'),
      editing ? h('button', { type: 'button', class: 'btn', onclick: function () { tpr.form = blankTpr(null); tpr.editId = null; render(); } }, '고치기 취소') : null,
      h('span', { class: 'note' }, '「다음 일지」는 모델·운전자를 이어 쓰고, 주간 다음은 같은 날 야간으로 넘어갑니다.')));

    // 최근 일지
    var recent = L.sortLogs(db.rows.filter(function (r) { return r.date; })).reverse().slice(0, 10);
    if (recent.length) {
      var tb = h('tbody');
      recent.forEach(function (r) {
        tb.appendChild(h('tr', { class: 'clickable' + (r.id === tpr.editId ? ' current' : ''), tabindex: '0', onclick: function () { openTpr(r); }, onkeydown: function (e) { if (e.key === 'Enter') openTpr(r); } },
          h('td', { class: 'num' }, r.date + '(' + L.weekdayKo(r.date) + ')'), h('td', null, (r.shift || '') + (r.provisional ? ' · 가입력' : '')), h('td', null, L.modelLabel(r.model, r.unit_no)),
          h('td', null, r.driver || ''), h('td', { class: 'num' }, L.effectiveHours(r) == null ? '' : L.fmtNum(L.effectiveHours(r))), h('td', { class: 'wide' }, r.issue || '')));
      });
      main.appendChild(h('section', { class: 'card' }, h('h2', null, '최근 일지 10장'), h('p', { class: 'note' }, '줄을 누르면 양식으로 불러와 고칠 수 있습니다. 전체는 「현황 데이터」에서 봅니다.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, h('tr', null, ['작성일', '주/야/휴', '모델', '작성자', '가동(h)', '문제점'].map(function (x) { return h('th', null, x); }))), tb))));
    }
  }
  function aiDialog() {
    var prompt = L.tprPrompt();
    var st = settings();
    var pa = h('textarea', { readonly: true, rows: '8', class: 'mono', 'aria-label': 'AI 에 보낼 요청문' }); pa.value = prompt;
    var paWrap = field('1. 요청문', pa);
    var ans = h('textarea', { rows: '8', class: 'mono', placeholder: 'AI 가 보낸 JSON 답을 여기에 붙여 넣어 주세요', 'aria-label': 'AI 답' });
    var out = h('div');
    // TPR 을 외부 AI 에 올리는 것은 사용자가 1~2장임을 확인했을 때만(수강생 답 09-29 오후 늦게)
    var allow = L.aiPageAllowance(st.aiPages, today());
    var agree = h('input', { type: 'checkbox', name: 'aiAgree' });
    var left = h('span', { class: 'note' });
    var copyBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: true, onclick: function () {
      allow = L.aiPageAllowance(st.aiPages, today());
      if (!allow.ok || !agree.checked) return;
      copyText(prompt, '요청문을 복사했습니다 — 이 일지 한 장만 올려 주세요');
      st.aiPages = L.recordAiPage(st.aiPages, today()); save();
      agree.checked = false; refresh();
    } }, '요청문 복사(1장)');
    function refresh() {
      allow = L.aiPageAllowance(st.aiPages, today());
      copyBtn.disabled = !allow.ok || !agree.checked;
      paWrap.hidden = copyBtn.disabled; // 확인 전에는 요청문도 감춥니다
      left.textContent = allow.ok ? '오늘 ' + allow.used + '장 사용 · ' + allow.left + '장 남음' : '오늘은 ' + allow.limit + '장을 다 썼습니다. 나머지는 사진 옆에 띄워 직접 옮겨 적어 주세요.';
    }
    agree.addEventListener('change', refresh);
    refresh();
    openDialog('AI로 옮겨 적기 (선택 · 하루 2장까지)', [
      h('p', { class: 'alert error' }, 'TPR 은 개발 모델 자료라 대외비입니다. 외부 AI(ChatGPT 등)에는 하루 1~2장까지만 올리고, 여러 장은 올리지 마세요. 평소에는 「일지 사진 옆에 띄우기」로 옮겨 적는 것이 기본입니다(사진이 이 브라우저 밖으로 나가지 않습니다).'),
      h('ol', { class: 'prompt-steps' },
        h('li', null, '아래 확인에 표시하고 요청문을 복사해, 회사에서 쓸 수 있는 AI 대화창에 붙여 넣은 뒤 일지 사진 한 장을 함께 올려 주세요. 요청문에는 일지 내용이 들어 있지 않습니다.'),
        h('li', null, 'AI 가 보낸 JSON 답을 복사해 두 번째 칸에 붙여 넣고 「입력 칸에 채우기」를 눌러 주세요.'),
        h('li', null, '채워진 값을 사진과 한 칸씩 대조한 뒤 저장해 주세요. 손글씨는 잘못 읽을 수 있습니다.')),
      h('label', { class: 'check ai-agree' }, agree, '이번에 올리는 것은 일지 1장이고, 오늘 외부 AI 에 올린 TPR 이 2장을 넘지 않습니다. 작성자 이름·서명은 가리거나 빼고 올립니다.'),
      paWrap, h('div', { class: 'btn-row', style: 'margin:6px 0 12px' }, copyBtn, left),
      field('2. AI 답(JSON)', ans), out
    ], [
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '닫기'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var res = L.tprFromAi(ans.value);
        out.textContent = '';
        if (!res.ok) { out.appendChild(h('div', { class: 'alert error' }, res.error)); return; }
        var keepDriver = tpr.form && tpr.form.driver;
        var base = blankTpr(null);
        Object.keys(res.form).forEach(function (k) { if (res.form[k] !== '' && res.form[k] != null) base[k] = res.form[k]; });
        if (res.form.date) base.date = L.parseDate(res.form.date) || '';
        if (!base.shift || !L.SHIFT_ORDER[L.normShift(base.shift)]) base.shift = '주'; else base.shift = L.normShift(base.shift);
        if (base.battery.length < L.BATTERY_SEGMENTS.length) base.battery = base.battery.concat(L.BATTERY_SEGMENTS.slice(base.battery.length).map(function (l) { return { label: l, start: '', end: '' }; }));
        if (!base.problems.length) base.problems = [{ text: '', note: '' }];
        while (base.checks.length < L.CHECK_ITEMS.length) base.checks.push('');
        base.checks = base.checks.map(function (c) { var s = String(c || '').trim(); return /^(유|有)$/.test(s) ? '유' : /^(무|無)$/.test(s) ? '무' : ''; });
        base.driver = keepDriver || '';
        tpr.form = base; tpr.editId = null;
        closeDialog(); render();
        toast('입력 칸에 채웠습니다' + (res.warnings.length ? ' — ' + res.warnings.join(' / ') : '') + '. 사진과 대조한 뒤 저장해 주세요');
      } }, '입력 칸에 채우기')
    ]);
  }

  // ── 시험일지 정리(모델별 누적) ────────────────────────────
  function renderSummary(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '시험일지 정리'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { editMaster(null); } }, '모델 추가'),
        units().length ? h('button', { type: 'button', class: 'btn', onclick: function () {
          var sheets = {}, used = {};
          units().forEach(function (u) {
            var n = u.label.replace(/[\[\]:*?\/\\]/g, '_').slice(0, 31) || '모델'; var b = n, i = 2;
            while (used[n]) n = b.slice(0, 27) + '(' + (i++) + ')';
            used[n] = true;
            sheets[n] = L.summarySheet(L.unitSummary(db.rows, u));
          });
          writeXlsx('시험일지정리_전체모델' + tag() + '_' + today() + '.xlsx', sheets);
        } }, '전체 모델 정리 엑셀') : null)));
    var us = units();
    if (!us.length) {
      main.appendChild(h('section', { class: 'card' }, h('p', null, '정리할 일지가 없습니다. 「시험일지 입력」에서 일지를 적거나, 지금 쓰는 정리 엑셀을 「현황 데이터 → 엑셀·CSV 불러오기」로 넣어 주세요.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/tpr' }, '시험일지 입력'), importButton(false), sampleButton(false))));
      return;
    }
    if (!sumKey || !us.some(function (u) { return u.key === sumKey; })) sumKey = us[0].key;
    var u = us.find(function (x) { return x.key === sumKey; });
    var sel = select('unit', us.map(function (x) { return [x.key, x.label]; }), sumKey, { 'aria-label': '모델/호기' });
    sel.addEventListener('change', function () { sumKey = sel.value; render(); });
    var sum = L.unitSummary(db.rows, u);
    var t = sum.totals;
    var fuel = u.fuel && u.fuel !== L.ELECTRIC ? u.fuel : '경유';
    main.appendChild(h('section', { class: 'card' },
      h('div', { class: 'filters' }, field('모델명/호기', sel)),
      h('dl', { class: 'master' },
        h('div', null, h('dt', null, '초기 아워미터'), h('dd', null, u.initialHour == null ? '미입력' : L.fmtNum(u.initialHour) + ' hr')),
        h('div', null, h('dt', null, '목표 가동시간'), h('dd', null, L.fmtNum(u.targetHours) + ' hr' + (u.extended ? ' (특화 +500)' : '') + (u.targetDefault ? ' · 기본값' : ''))),
        h('div', null, h('dt', null, 'PG 정보'), h('dd', null, u.pg || '-')),
        h('div', null, h('dt', null, '과제번호'), h('dd', null, u.project || '-')),
        h('div', null, h('dt', null, '연료'), h('dd', null, u.fuel || '-'))),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: function () { editMaster(u); } }, '모델 정보 고치기'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var n = {}; n[u.label.replace(/[\[\]:*?\/\\]/g, '_').slice(0, 31) || '정리'] = L.summarySheet(sum);
          writeXlsx('시험일지정리_' + u.label.replace(/[\\\/:*?"<>|\s]+/g, '_') + tag() + '_' + today() + '.xlsx', n);
        } }, '이 모델 정리 엑셀 내려받기'))));
    function kpi(k, v, unit) { return h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, unit ? h('small', null, unit) : null)); }
    main.appendChild(h('div', { class: 'kpis' },
      kpi('누적 가동시간', L.fmtNum(t.hours), 'hr'), kpi('누적 Ratio', sum.ratio == null ? '-' : L.fmtNum(sum.ratio * 100), sum.ratio == null ? '목표 미입력' : '%'),
      kpi('누적 아워미터', sum.meter == null ? '-' : L.fmtNum(sum.meter), sum.meter == null ? '초기값 미입력' : 'hr'),
      kpi(fuel + ' 합계', L.fmtNum(t.fuel[fuel] || 0), L.fuelUnit(fuel)), kpi('요소수 합계', L.fmtNum(t.urea), 'L'), kpi('문제점 기록', String(t.issues), '건')));
    var cols = ['Date', '주/야/휴', '일 가동시간', '기본/요철 사이클', '누적 가동시간', '누적 아워미터', '기본 사이클', '요철 사이클', '장비 점검 및 TPR', '특화(배터리 점검+수리)', '히터', '에어컨', fuel === 'LPG' ? 'LPG(kg)' : '경유 주입량', '요소수', '날씨', '운전자 Code', '문제점 / 조치내용'];
    var tb = h('tbody');
    var byId = {};
    db.rows.forEach(function (r) { byId[r.id] = r; });
    sum.lines.slice().reverse().forEach(function (l) {
      function n(v) { return h('td', { class: 'num' }, v == null ? '' : L.fmtNum(v)); }
      var r = byId[l.id];
      tb.appendChild(h('tr', { class: 'clickable', tabindex: '0', onclick: function () { openTpr(r); }, onkeydown: function (e) { if (e.key === 'Enter') openTpr(r); } },
        h('td', { class: 'num' }, l.date), h('td', null, l.shift), n(l.hours), n(l.cycle_h), n(l.cum), n(l.meter), n(l.basic), n(l.bump), n(l.inspect), n(l.special), n(l.heater), n(l.ac),
        n(l.fuel === fuel ? l.fuel_qty : null), n(l.urea), h('td', null, l.weather), h('td', null, l.driver), h('td', { class: 'wide' }, l.issue)));
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '일자별 정리표 (' + u.label + ')'),
      h('p', { class: 'note' }, '누적 가동시간 = 일 가동시간을 일자·주/야/휴 순으로 더한 값, 누적 아워미터 = 초기 아워미터 + 누적 가동시간입니다. 최근 일지가 위에 오고, 줄을 누르면 일지 양식으로 고칩니다. 엑셀은 원래 정리 엑셀처럼 오래된 날짜부터 적습니다.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c); }))), tb))));
  }
  function editMaster(u) {
    var isNew = !u;
    var m = u ? L.normMaster(u) : L.normMaster({});
    var inputs = {
      model: h('input', { type: 'text', name: 'model', value: m.model, readonly: !isNew && L.rowsOfUnit(db.rows, u.key).length ? true : null }),
      unit_no: h('input', { type: 'text', name: 'unit_no', value: m.unit_no, readonly: !isNew && L.rowsOfUnit(db.rows, u.key).length ? true : null }),
      initialHour: numIn('initialHour', m.initialHour), targetHours: numIn('targetHours', m.targetDefault ? '' : m.targetHours, { placeholder: '비우면 1000 (특화 +500 = 1500)' }),
      extended: h('input', { type: 'checkbox', name: 'extended', checked: !!m.extended }),
      pg: h('input', { type: 'text', name: 'pg', value: m.pg }), project: h('input', { type: 'text', name: 'project', value: m.project }),
      fuel: select('fuel', [['', '(모름)'], '경유', 'LPG', '전기'], m.fuel)
    };
    openDialog(isNew ? '모델 추가' : '모델 정보 — ' + u.label, [
      !isNew && L.rowsOfUnit(db.rows, u.key).length ? h('p', { class: 'note' }, '일지가 있는 모델은 모델명·호기를 여기서 바꾸지 않습니다(일지와 연결이 끊기지 않게). 이름을 바꾸려면 「현황 데이터」에서 일지를 고쳐 주세요.') : null,
      h('div', { class: 'form-grid' },
        field('모델명 (필수)', inputs.model, '예: MODEL-Y'), field('호기', inputs.unit_no, '예: #1'),
        field('초기 아워미터(hr)', inputs.initialHour, '시험 시작 때 아워미터'), field('목표 가동시간(hr)', inputs.targetHours, '보통 1000시간. 다른 값일 때만 적어 주세요'),
        h('label', { class: 'check span-all' }, inputs.extended, '특화 시험 모델(+500시간 → 목표 1500시간)'),
        field('PG 정보', inputs.pg), field('과제번호', inputs.project, '기성 청구서 「과제번호」 칸'),
        field('연료', inputs.fuel, '연료 칸이 빈 일지는 이 연료로 정산합니다'))
    ], [
      !isNew && !L.rowsOfUnit(db.rows, u.key).length ? h('button', { type: 'button', class: 'btn btn-danger', onclick: function () { delete db.masters[u.key]; save(); closeDialog(); render(); } }, '모델 지우기') : null,
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '취소'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var raw = { model: inputs.model.value.trim(), unit_no: inputs.unit_no.value.trim(), initialHour: inputs.initialHour.value.trim(), targetHours: inputs.targetHours.value.trim(), extended: inputs.extended.checked, pg: inputs.pg.value.trim(), project: inputs.project.value.trim(), fuel: inputs.fuel.value };
        var nm = L.normMaster(raw);
        if (!nm.model) { toast('모델명을 적어 주세요', true); return; }
        if (inputs.initialHour.value.trim() && nm.initialHour == null) { toast('초기 아워미터를 숫자로 적어 주세요', true); return; }
        if (raw.targetHours && L.parseNum(raw.targetHours) == null) { toast('목표 가동시간을 숫자로 적어 주세요', true); return; }
        db.masters = db.masters || {};
        if (!isNew && u.key !== L.masterKey(nm.model, nm.unit_no)) delete db.masters[u.key];
        // 목표를 비우면 저장도 빈 값으로 둡니다(나중에 특화 표시를 바꾸면 1000 ↔ 1500 이 따라 바뀌게)
        db.masters[L.masterKey(nm.model, nm.unit_no)] = { model: nm.model, unit_no: nm.unit_no, initialHour: nm.initialHour, targetHours: nm.targetDefault ? null : nm.targetHours, extended: nm.extended, pg: nm.pg, project: nm.project, fuel: nm.fuel };
        sumKey = L.masterKey(nm.model, nm.unit_no);
        save(); closeDialog(); toast('모델 정보를 저장했습니다'); render();
      } }, '저장')
    ]);
  }

  // ── 주간 현황(설계담당자 메일) ────────────────────────────
  function renderWeekly(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '주간 현황 보고')));
    var st = settings();
    var lastDate = db.rows.reduce(function (m, r) { return r.date && r.date > m ? r.date : m; }, '');
    // 매주 수요일 R&D 전체에 송부(수강생 답) — 기준일 기본값은 오늘을 포함한 가장 최근 수요일
    if (!weekly.asOf) weekly.asOf = L.lastWednesday(today());
    var asOf = h('input', { type: 'date', name: 'asOf', value: weekly.asOf });
    var days = select('days', [['7', '최근 7일'], ['14', '최근 14일'], ['30', '최근 30일']], String(weekly.days));
    asOf.addEventListener('change', function () { weekly.asOf = asOf.value || today(); weekly.body = null; render(); });
    days.addEventListener('change', function () { weekly.days = +days.value; weekly.body = null; render(); });
    main.appendChild(h('section', { class: 'card no-print' }, h('div', { class: 'filters' }, field('기준일', asOf), field('집계 기간', days)),
      h('p', { class: 'note', style: 'margin-top:10px' }, '매주 수요일 R&D 전체에 보내는 정기 보고입니다. 기준일은 가장 최근 수요일로 열립니다. 목표 가동시간은 모델 정보에서 정하며 적지 않으면 1000시간(특화 1500시간)입니다.' + (lastDate ? ' 마지막 일지: ' + lastDate + '.' : ''))));
    var rep = L.weeklyReport(db.rows, db.masters, weekly.asOf, weekly.days);
    var svg = L.progressSvg(rep, { width: 760 });
    var graph = h('div', { class: 'svg-box' });
    graph.innerHTML = svg; // logic.js 가 글자를 모두 이스케이프해 만든 SVG 입니다
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '1. 모델별 진행 시간 (현 시험시간 / 목표시간)'), graph,
      h('p', { class: 'note' }, '파랑 = 진행 중, 초록 = 목표 도달, 회색 = 목표 미입력(가장 긴 모델 기준 길이 비교). 세로선이 목표(100%)입니다.'),
      h('div', { class: 'btn-row no-print' },
        h('button', { type: 'button', class: 'btn', onclick: function () { savePng(svg, '내구시험_진행현황_' + weekly.asOf + tag() + '.png'); } }, '그래프 PNG 저장'),
        h('button', { type: 'button', class: 'btn', onclick: function () { download('내구시험_진행현황_' + weekly.asOf + tag() + '.svg', new Blob([svg], { type: 'image/svg+xml' })); } }, '그래프 SVG 저장'),
        h('button', { type: 'button', class: 'btn', onclick: function () { window.print(); } }, '인쇄'))));
    // 표
    var tb = h('tbody');
    rep.models.forEach(function (m) {
      tb.appendChild(h('tr', null, h('td', null, m.label), h('td', { class: 'num' }, L.fmtNum(m.cum)), h('td', { class: 'num' }, m.target > 0 ? L.fmtNum(m.target) : '미입력'),
        h('td', { class: 'num' }, m.ratio == null ? '-' : L.fmtNum(m.ratio * 100) + '%'), h('td', { class: 'num' }, '+' + L.fmtNum(m.weekHours)),
        h('td', null, m.done ? h('span', { class: 'badge ok' }, '시험 종료') : m.eta ? m.eta + ' (참고)' : '-'), h('td', { class: 'num' }, m.weekIssues.length + ' / ' + m.totalIssues)));
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '진행 표'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, h('tr', null, ['모델', '현 시험시간(h)', '목표(h)', '진척', '기간 가동', '예상 완료', '문제점(기간/누적)'].map(function (x) { return h('th', null, x); }))), tb)),
      h('p', { class: 'note' }, '예상 완료일은 집계 기간의 하루 평균 가동시간으로 남은 시간을 나눈 참고값입니다.')));
    // 문제점
    var iss = h('div');
    var any = false;
    rep.models.forEach(function (m) {
      if (!m.weekIssues.length) return;
      any = true;
      var ul = h('ul', { class: 'miss-list' });
      m.weekIssues.forEach(function (i) {
        var r = db.rows.find(function (x) { return x.id === i.id; });
        ul.appendChild(h('li', null, h('a', { href: '#', onclick: function (e) { e.preventDefault(); openTpr(r); } }, i.date + (i.shift ? '(' + i.shift + ')' : '')), ' ' + i.text + (i.driver ? ' — ' + i.driver : '') + ' ',
          h('button', { type: 'button', class: 'linkish no-print', onclick: function () { alertDialog(r); } }, '문제점 메일 정리')));
      });
      iss.appendChild(h('h3', null, m.label + ' · ' + m.weekIssues.length + '건'));
      iss.appendChild(ul);
    });
    if (!any) iss.appendChild(h('p', null, '이 기간에 기록된 문제점이 없습니다.'));
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '2. 모델별 문제점 현황 (' + rep.from + ' ~ ' + rep.asOf + ')'), iss));
    // 메일
    var mail = L.weeklyMail(rep, { sign: st.mailSign || '감사합니다.' });
    if (weekly.body == null) weekly.body = mail.body;
    var to = h('input', { type: 'text', name: 'mailTo', value: st.mailTo || '', placeholder: '예: R&D 전체 메일 그룹 주소 (쉼표로 여러 개)' });
    to.addEventListener('change', function () { st.mailTo = to.value.trim(); save(); });
    var sign = h('input', { type: 'text', name: 'mailSign', value: st.mailSign || '', placeholder: '예: 내구시험 담당 드림' });
    sign.addEventListener('change', function () { st.mailSign = sign.value.trim(); weekly.body = null; save(); render(); });
    var subj = h('input', { type: 'text', name: 'subject', value: mail.subject });
    var body = h('textarea', { name: 'body', rows: '14', class: 'mono' }); body.value = weekly.body;
    body.addEventListener('input', function () { weekly.body = body.value; });
    main.appendChild(h('section', { class: 'card no-print' }, h('h2', null, '3. 설계담당자 메일'),
      h('p', { class: 'note' }, '받는 사람과 끝인사는 이 브라우저에 기억합니다. 본문은 고쳐 써도 됩니다. 그래프는 「그래프 PNG 저장」으로 받고, 기간 내 내구시험일지(PDF)와 함께 메일에 첨부해 주세요(메일 프로그램이 첨부를 자동으로 넣지는 못합니다).'),
      h('div', { class: 'form-grid' }, field('받는 사람', to), field('끝인사(서명)', sign), h('div', { class: 'span-all' }, field('제목', subj)), h('div', { class: 'span-all' }, field('본문', body))),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(subj.value + '\n\n' + body.value, '제목과 본문을 복사했습니다'); } }, '제목·본문 복사'),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          var href = 'mailto:' + encodeURIComponent(to.value.trim()).replace(/%2C/g, ',').replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subj.value);
          var full = href + '&body=' + encodeURIComponent(body.value);
          // mailto 는 길이 제한(대략 2,000자)이 있어 길면 본문을 복사해 두고 제목만 넘깁니다
          if (full.length > 1900) { copyText(body.value, '본문이 길어 복사해 두었습니다. 메일 창에 붙여 넣어 주세요'); location.href = href; }
          else location.href = full;
        } }, '메일 프로그램으로 열기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { weekly.body = null; render(); } }, '본문 다시 만들기'))));
  }
  // 문제점 메일 정리 — 담당자와 협의 후 필요할 때 직접 보냄(자동 발송 없음, 수강생 답 09-30)
  function alertDialog(r) {
    if (!r) return;
    var st = settings();
    var u = units().find(function (x) { return x.key === L.masterKey(r.model, r.unit_no); });
    var cum = u ? L.unitSummary(db.rows, u, { to: r.date }).totals.hours : null;
    var mail = L.issueAlertMail(r, { cum: cum, target: u ? u.targetHours : null, sign: st.mailSign });
    // 담당자가 그때그때 달라(수강생 답 09-30) 받는 사람을 기억하지 않습니다
    var to = h('input', { type: 'text', value: '', placeholder: '협의한 담당자 메일 (쉼표로 여러 개, 비워 두고 메일 창에서 골라도 됩니다)' });
    var subj = h('input', { type: 'text', value: mail.subject });
    var body = h('textarea', { rows: '12', class: 'mono' }); body.value = mail.body;
    openDialog('문제점 메일 정리', [
      h('p', { class: 'note' }, '문제점 내용을 확인하고 담당자와 협의한 뒤, 필요할 때 직접 보내는 메일 초안입니다(도구는 자동으로 보내지 않습니다). 본문의 「첨부」에 적힌 사진을 메일 프로그램에서 붙여 주세요.'),
      h('div', { class: 'form-grid one' }, field('받는 사람', to), field('제목', subj), field('본문', body))
    ], [
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '닫기'),
      h('button', { type: 'button', class: 'btn', onclick: function () { copyText(subj.value + '\n\n' + body.value, '제목과 본문을 복사했습니다'); } }, '제목·본문 복사'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var href = 'mailto:' + encodeURIComponent(to.value.trim()).replace(/%2C/g, ',').replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subj.value);
        var full = href + '&body=' + encodeURIComponent(body.value);
        if (full.length > 1900) { copyText(body.value, '본문이 길어 복사해 두었습니다. 메일 창에 붙여 넣어 주세요'); location.href = href; }
        else location.href = full;
      } }, '메일 프로그램으로 열기')
    ]);
  }
  function savePng(svg, name) {
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.width * 2; c.height = img.height * 2;
      var ctx = c.getContext('2d');
      ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      try { c.toBlob(function (b) { if (b) download(name, b); else toast('PNG 로 저장하지 못했습니다. SVG 로 받아 주세요', true); }, 'image/png'); }
      catch (e) { toast('이 브라우저에서는 PNG 로 저장하지 못했습니다. SVG 로 받아 주세요', true); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('그래프를 그림으로 바꾸지 못했습니다. SVG 로 받아 주세요', true); };
    img.src = url;
  }

  // ── 기성처리(운전시간 정산 · 연료비 정산) ─────────────────
  function renderBilling(main) {
    var tab = subRoute() === 'fuel' ? 'fuel' : 'hours';
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '기성처리'),
      h('div', { class: 'tabs', role: 'tablist' },
        h('a', { href: '#/billing/hours', role: 'tab', 'aria-selected': tab === 'hours' ? 'true' : 'false', class: 'tab' + (tab === 'hours' ? ' on' : '') }, '운전시간 정산'),
        h('a', { href: '#/billing/fuel', role: 'tab', 'aria-selected': tab === 'fuel' ? 'true' : 'false', class: 'tab' + (tab === 'fuel' ? ' on' : '') }, '연료비 정산'))));
    if (!db.rows.length) {
      main.appendChild(h('section', { class: 'card' }, h('p', null, '정산할 일지가 없습니다. 「시험일지 입력」에서 일지를 적거나 엑셀을 불러와 주세요.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/tpr' }, '시험일지 입력'), sampleButton(false))));
      return;
    }
    var st = settings();
    var hol = holidays();
    // 기본 기간 = 지금 쌓이고 있는 기성 기간(전달 마감일 다음 날 ~ 이달 마감일). 1일부터 매일 초안이 채워집니다.
    var open = L.openClosingPeriod(today(), hol);
    if (!bill.from || !bill.to) { bill.from = open.from; bill.to = open.to; }
    // 기성 기간은 사용자가 정합니다(수강생 답 09-30: 「언제부터 언제까지로 일정을 입력하고 기성자료를 뽑으면」).
    // 운전시간은 월 단위로 끊고, 연료비는 영수증(실제 주입) 기준이라 따로 정할 수 있게 탭마다 기간을 둡니다.
    var isFuel = tab === 'fuel';
    var P = isFuel ? { from: bill.fuelFrom || bill.from, to: bill.fuelTo || bill.to } : { from: bill.from, to: bill.to };
    function setP(from, to) { if (isFuel) { bill.fuelFrom = from; bill.fuelTo = to; } else { bill.from = from; bill.to = to; } render(); }
    var fFrom = h('input', { type: 'date', name: 'from', value: P.from });
    var fTo = h('input', { type: 'date', name: 'to', value: P.to });
    [fFrom, fTo].forEach(function (el) { el.addEventListener('change', function () { setP(fFrom.value, fTo.value); }); });
    function sBind(el, key) { el.addEventListener('change', function () { st[key] = el.value.trim(); save(); render(); }); return el; }
    var appr = st.approvers || ['파트장', '팀장', '부문장'];
    var apprIn = [0, 1, 2].map(function (i) {
      var el = h('input', { type: 'text', value: appr[i] || '', 'aria-label': '결재 ' + (i + 1) + '번째 칸' });
      el.addEventListener('change', function () { var a = (st.approvers || ['파트장', '팀장', '부문장']).slice(); a[i] = el.value.trim(); st.approvers = a; save(); });
      return el;
    });
    var prev = L.closingPeriodOf(L.shiftMonth(open.month, -1), hol);
    function setPeriod(p) { setP(p.from, p.to); }
    main.appendChild(h('section', { class: 'card' }, h('h2', null, (isFuel ? '연료비' : '운전시간') + ' 청구 기간과 머리 정보'),
      h('div', { class: 'form-grid three' }, field('시작일', fFrom), field('종료일', fTo)),
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { type: 'button', class: 'btn btn-sm' + (P.from === open.from && P.to === open.to ? ' on' : ''), onclick: function () { setPeriod(open); } }, '이번 달 기성 (' + open.from.slice(5) + ' ~ ' + open.to.slice(5) + ')'),
        h('button', { type: 'button', class: 'btn btn-sm' + (P.from === prev.from && P.to === prev.to ? ' on' : ''), onclick: function () { setPeriod(prev); } }, '지난달 기성 (' + prev.from.slice(5) + ' ~ ' + prev.to.slice(5) + ')'),
        isFuel && (bill.fuelFrom || bill.fuelTo) ? h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { bill.fuelFrom = ''; bill.fuelTo = ''; render(); } }, '운전시간 기간과 같게') : null),
      h('p', { class: 'note' }, isFuel
        ? '연료비는 실제 주입·결제 내역(영수증) 기준이라 운전시간과 다른 기간으로 뽑을 수 있습니다. 여기서 정한 기간은 연료비 청구서에만 쓰입니다(예: 05.27 ~ 06.30).'
        : '운전시간은 월 단위로 끊습니다. 버튼은 전달 마감일 다음 날 ~ 이달 마감일(근무일 기준 말일)을 넣어 주고, 필요하면 시작일·종료일을 직접 적어 뽑습니다. 기간을 직접 정해 뽑으므로 가입력과 확정 값 차이를 다음 달에 조정할 필요가 없습니다.'),
      h('div', { class: 'form-grid three' },
        field('업체', sBind(h('input', { type: 'text', value: st.company || '', placeholder: '시험 운영 업체명' }), 'company')),
        field('담당 팀(표 오른쪽 위)', sBind(h('input', { type: 'text', value: st.team || '', placeholder: '예: 시험검증팀' }), 'team')),
        h('div', { class: 'field span-2' }, h('span', null, '결재란 직책(이름은 적지 않습니다)'), h('div', { class: 'pair three' }, apprIn))),
      P.from && P.to && P.from > P.to ? h('div', { class: 'alert error' }, '시작일이 종료일보다 늦습니다.') : null));
    if (!P.from || !P.to || P.from > P.to) return;
    if (!isFuel) renderClosing(main, st, hol);
    var periodRows = db.rows.filter(function (r) { return r.date && r.date >= P.from && r.date <= P.to; });
    var ids = {};
    periodRows.forEach(function (r) { ids[r.id] = true; });
    var errs = L.validateRows(db.rows, { holidays: holidays() }).filter(function (i) { return ids[i.id] && i.level === 'error'; }).length;
    if (errs) main.appendChild(h('div', { class: 'alert error' }, '이 기간 일지에 검사 오류 ' + errs + '건이 있습니다. ', h('a', { href: '#/data' }, '현황 데이터'), '에서 확인한 뒤 내려받는 것을 권합니다.'));
    if (!periodRows.length) { main.appendChild(h('section', { class: 'card' }, h('p', null, '이 기간에 일지가 없습니다. 기간을 바꿔 주세요.'))); return; }
    var meta = { company: st.company, team: st.team, from: P.from, to: P.to, approvers: st.approvers, holidays: hol, lpgMonthly: lpgMonthly() };
    renderProvisional(main, st, meta);
    var fileTail = '_' + P.from.replace(/-/g, '') + '-' + P.to.replace(/-/g, '') + tag() + '.xlsx';
    if (tab === 'fuel') renderFuelBill(main, st, meta, fileTail); else renderHourBill(main, st, meta, fileTail);
  }
  function renderHourBill(main, st, meta, fileTail) {
    var rateIn = numIn('rate', st.rate || '', { placeholder: '예: 24,400' });
    rateIn.addEventListener('change', function () { st.rate = rateIn.value.trim(); save(); render(); });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '단가와 과급'),
      h('div', { class: 'form-grid three' }, field('단가(원/h)', rateIn, '계약 단가를 직접 적어 주세요. 도구가 정해 두지 않습니다'),
        h('div', { class: 'field span-2' }, h('span', null, '과급 (계약서 고정값)'),
          h('p', { class: 'fixed-val' }, '주간 ' + L.DEFAULT_SURCHARGE['주'] + '% · 야간 ' + L.DEFAULT_SURCHARGE['야'] + '% · 휴일 ' + L.DEFAULT_SURCHARGE['휴'] + '%'),
          h('small', { class: 'hint' }, '휴일은 일지의 주/야/휴 칸이 아니라 날짜로 정합니다 — 토요일·일요일·공휴일 목록의 날은 휴일 30%, 평일은 주간·야간.'))),
      h('p', { class: 'note' }, '소계 = (장비 실가동 금월 + TPR 작성 및 점검 + 특화 시험) × (1 + 과급), 기성금액 = 소계 × 단가(원 단위 반올림). 특화 시험 = 일지의 「배터리 충전 점검」 + 「특화 시험(동력전달 특화 등)·장비수리」 시간입니다.')));
    var lines = L.hourBillingLines(db.rows, db.masters, meta.from, meta.to, { holidays: meta.holidays });
    var b = L.calcHourBilling(lines, { rate: st.rate });
    var status = L.hourBillingStatus(db.rows, db.masters, meta.from, meta.to);
    meta.status = status;
    var tb = h('tbody');
    var prevKey = '', no = 0;
    b.lines.forEach(function (l) {
      var first = l.key !== prevKey; if (first) no++; prevKey = l.key;
      tb.appendChild(h('tr', { class: first ? 'grp' : '' },
        h('td', { class: 'num' }, first ? String(no) : ''), h('td', null, l.label), h('td', null, L.shiftLabel(l.shift)),
        h('td', { class: 'num' }, first ? L.fmtNum(l.cum) : ''), h('td', { class: 'num' }, L.fmtNum(l.month)), h('td', { class: 'num' }, L.fmtNum(l.tpr)), h('td', { class: 'num' }, L.fmtNum(l.special)),
        h('td', { class: 'num' }, l.surcharge ? l.surcharge + '%' : ''), h('td', { class: 'num' }, L.fmtNum(l.subtotal)), h('td', { class: 'num' }, l.rate > 0 ? L.fmtNum(l.rate, 0) : ''),
        h('td', { class: 'num' }, l.amount == null ? '단가 없음' : L.fmtNum(l.amount, 0)), h('td', null, first ? (l.project || '') : '')));
    });
    var t = b.totals;
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '개발장비 내구시험 기성 청구서 (' + meta.from.replace(/-/g, '.') + ' ~ ' + meta.to.replace(/-/g, '.') + ')'),
      h('p', { class: 'bill-total' }, '기성금액 : ', b.missingRate ? '단가를 적으면 계산됩니다' : '₩' + L.fmtNum(t.amount, 0) + ' (VAT 별도)'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list bill' },
        h('thead', null,
          h('tr', null, h('th', { rowspan: '2' }, '순'), h('th', { rowspan: '2' }, '기종'), h('th', { rowspan: '2' }, '주간/야간/휴일'), h('th', { colspan: '6', class: 'center' }, 'M/H(h)'),
            h('th', { rowspan: '2' }, '단가(원/h)'), h('th', { rowspan: '2' }, '기성금액(원)'), h('th', { rowspan: '2' }, '과제번호')),
          h('tr', null, ['장비 실가동 누적', '장비 실가동 금월', 'TPR 작성 및 점검', '특화 시험', '과급', '소계'].map(function (x) { return h('th', null, x); }))),
        tb,
        h('tfoot', null, h('tr', null, h('td', { colspan: '4' }, '계'), h('td', { class: 'num' }, L.fmtNum(t.month)), h('td', { class: 'num' }, L.fmtNum(t.tpr)), h('td', { class: 'num' }, L.fmtNum(t.special)),
          h('td', null, ''), h('td', { class: 'num' }, L.fmtNum(t.subtotal)), h('td', null, '-'), h('td', { class: 'num' }, b.missingRate ? '' : L.fmtNum(t.amount, 0)), h('td', null, '-'))))),
      h('p', { class: 'note' }, '* 특화시험: 장비 운행 중 배터리/충전 상태 점검, 차량 이상 발생 시 장비 점검/수정한 시간'),
      h('h3', null, '5. 내구시험 현황'),
      h('ol', { class: 'plain' },
        h('li', null, '1) 월간 가동일수 : ' + status.days + '일'),
        h('li', null, '2) 가동 투입 인원 : ' + status.drivers + '명(일지의 운전자 기준)'),
        h('li', null, '3) 월간 가동 시간 : ' + L.fmtNum(t.month) + ' hr'),
        h('li', null, '4) 완료 모델: ' + (status.done.length ? '총 ' + status.done.length + '모델 시험 종료-' + status.done.join(', ') : '없음'))),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        writeXlsx('기성청구서_운전시간' + fileTail, withProvisionalSheet(L.hourBillingSheets(b, meta, db.rows, db.masters), meta));
      } }, '운전시간 기성 청구서 엑셀 내려받기')),
      h('p', { class: 'note' }, '첫 시트 「청구서」는 받은 양식 배치(결재란·M/H 칸 합치기)를 따르고, 이어서 기종별 일자 상세 시트가 붙습니다. 장비 실가동 누적 = 기간 끝날까지의 누적 가동시간입니다(초기 아워미터 제외, 확인 필요).')));
  }
  function renderFuelBill(main, st, meta, fileTail) {
    var bk = numIn('bottleKg', st.bottleKg || 15);
    bk.addEventListener('change', function () { st.bottleKg = bk.value.trim(); save(); render(); });
    var lines = L.fuelBillingLines(db.rows, db.masters, meta.from, meta.to);
    var lm = lpgMonthly();
    // LPG 단가: 기간 안에서 LPG 를 쓴 달마다 오피넷 월 평균(원/kg)
    var months = {};
    lines.forEach(function (l) { if (l.fuel === 'LPG') Object.keys(l.byMonth || {}).forEach(function (ym) { months[ym] = true; }); });
    var mg = h('div', { class: 'lpg-months' });
    Object.keys(months).sort().forEach(function (ym) {
      var p = lm[ym] = lm[ym] || { price: '', source: '', checked: '' };
      function pb(el, k) { el.addEventListener('change', function () { p[k] = el.value.trim(); save(); render(); }); return el; }
      mg.appendChild(h('div', { class: 'card', style: 'margin:0' }, h('h3', null, 'LPG ' + ym + ' (원/kg, VAT 포함)'),
        h('div', { class: 'form-grid' },
          field('오피넷 월 평균 단가', pb(numIn('lpg_' + ym, p.price, { placeholder: '예: 2,484' }), 'price')),
          field('조회일', pb(h('input', { type: 'date', value: p.checked }), 'checked')),
          h('div', { class: 'span-all' }, field('가격 출처', pb(h('input', { type: 'text', value: p.source, placeholder: '오피넷 월 평균' }), 'source'))))));
    });
    // 경유·요소수: 일지의 결제 금액이 빈 주입
    var noWon = [];
    lines.forEach(function (l) { (l.noWon || []).forEach(function (d) { noWon.push(l.label + ' ' + l.fuel + ' ' + d); }); });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '정산 방식 (' + meta.from.replace(/-/g, '.') + ' ~ ' + meta.to.replace(/-/g, '.') + ')'),
      h('ul', { class: 'plain' },
        h('li', null, '경유·요소수 — 주입할 때 주유소에서 카드로 결제한 금액(VAT 포함)을 일지에서 그대로 더합니다. 리터당 단가를 곱하지 않습니다.'),
        h('li', null, 'LPG — 일지의 사용량(kg)을 달별로 더해 그달 오피넷 월 평균 단가를 곱합니다(월 말 카드 결제). 입고 대장은 스캔해 따로 첨부하므로 도구에서 만들지 않습니다.')),
      noWon.length ? h('div', { class: 'alert warn' }, '결제 금액이 빈 주입 ' + noWon.length + '건 — 「시험일지 입력」에서 그 일지를 열어 영수증 금액을 적어 주세요: ' + noWon.slice(0, 8).join(', ') + (noWon.length > 8 ? ' …' : '')) : null,
      Object.keys(months).length ? mg : h('p', { class: 'note' }, '이 기간에는 LPG 사용 기록이 없어 단가를 적을 칸이 없습니다.'),
      h('div', { class: 'form-grid three', style: 'margin-top:14px' }, field('LPG 통당 무게(kg)', bk, '15kg 규격 통(확인됨). 비고 「35통」 계산과 통 수로 적은 일지에 씁니다'))));
    var b = L.calcFuelBilling(lines, {}, { bottleKg: st.bottleKg, lpgMonthly: lm });
    var tb = h('tbody');
    b.lines.forEach(function (l, i) {
      var priceTxt = l.basis === 'receipt' ? '-' : l.price > 0 ? L.fmtNum(l.price, 0) : l.parts && l.parts.length > 1 ? '월별' : '';
      tb.appendChild(h('tr', null, h('td', { class: 'num' }, String(i + 1)), h('td', null, l.label), h('td', null, l.fuel), h('td', { class: 'num' }, L.fmtNum(l.cum)), h('td', { class: 'num' }, L.fmtNum(l.month)),
        h('td', { class: 'num' }, L.fmtNum(l.qty) + ' ' + l.unit), h('td', { class: 'num' }, priceTxt),
        h('td', { class: 'num' }, l.amount == null ? '단가 없음' : L.fmtNum(l.amount, 0) + (l.noWon && l.noWon.length ? ' (빈 금액 ' + l.noWon.length + '건)' : '')),
        h('td', null, l.project || ''), h('td', null, l.note)));
    });
    var t = b.totals;
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '개발장비 내구시험 연료 주입 청구서'),
      !b.lines.length ? h('p', null, '이 기간에 경유·LPG·요소수를 쓴 모델이 없습니다(전동 모델만 있거나 주입 기록이 없음).') : null,
      b.missingPrice.length ? h('div', { class: 'alert warn' }, '금액을 다 내지 못했습니다: ' + b.missingPrice.join(', ')) : null,
      h('p', { class: 'bill-total' }, '주유 금액 : ', b.missingPrice.length ? '빈 칸을 채우면 계산됩니다' : '₩' + L.fmtNum(t.amount, 0) + ' (VAT 포함)'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list bill' },
        h('thead', null,
          h('tr', null, h('th', { rowspan: '2' }, '순'), h('th', { rowspan: '2' }, '기종'), h('th', { rowspan: '2' }, '유종'), h('th', { colspan: '2', class: 'center' }, '장비 가동(h)'),
            h('th', { rowspan: '2' }, '가스/경유/요소수 사용량'), h('th', { rowspan: '2' }, '단가(원/kg)'), h('th', { rowspan: '2' }, '금액(원)'), h('th', { rowspan: '2' }, '과제번호'), h('th', { rowspan: '2' }, '비고')),
          h('tr', null, h('th', null, '총누적'), h('th', null, '금월'))),
        tb,
        h('tfoot', null, h('tr', null, h('td', { colspan: '5' }, '계'),
          h('td', { class: 'num' }, Object.keys(t.qty).map(function (k) { return L.fmtNum(t.qty[k]) + ' ' + L.fuelUnit(k); }).join(' · ')), h('td', null, '-'),
          h('td', { class: 'num' }, b.missingPrice.length ? '' : L.fmtNum(t.amount, 0)), h('td', null, ''), h('td', null, 'VAT 포함'))))),
      h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn btn-primary', disabled: !b.lines.length, onclick: function () {
        writeXlsx('기성청구서_연료비' + fileTail, withProvisionalSheet(L.fuelBillingSheets(b, meta, db.rows, db.masters, {}), meta));
      } }, '연료비 청구서 엑셀 내려받기')),
      h('p', { class: 'note' }, '시트: 청구서 · 기종별 연료 주입 현황(기종 한 장에 기간 안 가동 일지 전부, 주입한 날에 사용량·금액, 경유·LPG·요소수 소계) · 단가(LPG 달별 출처·조회일). 연료 칸이 빈 일지는 「시험일지 정리 → 모델 정보」의 연료로 봅니다.')));
  }

  // ── 기성 마감 준비(체크리스트·공휴일 목록) ─────────────────
  // 「마지막 날 하루 만에 기성자료를 만들어야 해서 스트레스」 — 기간 중 매일 초안과 할 일을 보여 줘 마감일에는 가입력만 남게 합니다.
  function renderClosing(main, st, hol) {
    var t = today();
    var cutoff = bill.to;
    var list = L.closingChecklist({ rows: db.rows, masters: db.masters, from: bill.from, to: bill.to, cutoff: cutoff, today: t, holidays: hol,
      rate: st.rate, prices: {}, lpgMonthly: lpgMonthly(), bottleKg: st.bottleKg });
    var isCut = L.isWorkday(cutoff, hol) && L.lastWorkday(+cutoff.slice(0, 4), +cutoff.slice(5, 7), hol) === cutoff;
    var left = t <= cutoff ? L.workdaysBetween(t, cutoff, hol).length : 0;
    var head = t > cutoff ? '마감일(' + cutoff + ' ' + L.weekdayKo(cutoff) + ')이 지났습니다. 가입력 일지를 확정하고 차이를 확인해 주세요.'
      : t === cutoff ? '오늘이 마감일입니다. 근무가 끝나기 전에 가동시간·연료만 가입력하고 청구서를 내려받아 주세요.'
      : '마감일 ' + cutoff + '(' + L.weekdayKo(cutoff) + ')까지 근무일 ' + left + '일 남았습니다(오늘 포함). 아래 청구서는 지금까지 쌓인 일지로 매일 채워지는 초안입니다.';
    var ul = h('ul', { class: 'checklist' });
    var STATE = { ok: '완료', todo: '할 일', wait: '마감일에' };
    list.forEach(function (i) {
      ul.appendChild(h('li', { class: 'st-' + i.state }, h('span', { class: 'badge' }, STATE[i.state]), h('span', null, i.label), i.detail ? h('small', { class: 'hint' }, i.detail) : null));
    });
    var ta = h('textarea', { rows: '8', class: 'mono', 'aria-label': '공휴일 목록' }); ta.value = holidayText();
    var parsed = L.parseHolidays(ta.value);
    var holBox = h('details', { class: 'holidays' }, h('summary', null, '공휴일 목록 (마감일·휴일 근무 계산용 — ' + Object.keys(parsed.map).length + '일)'),
      h('p', { class: 'note' }, '한 줄에 「YYYY-MM-DD 이름」으로 적습니다. 양력 공휴일은 해마다 자동으로 넣고, 음력 명절·대체공휴일·선거일은 2026년분만 초안으로 넣었습니다. 회사 달력과 대조해 고치고, 다음 해 명절은 직접 더해 주세요. 회사 휴무일은 아래 「회사 휴무일」에 따로 적습니다.'),
      ta, parsed.bad.length ? h('div', { class: 'alert warn' }, '날짜로 읽지 못한 줄: ' + parsed.bad.join(' / ')) : null,
      h('div', { class: 'btn-row', style: 'margin-top:8px' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: function () { st.holidays = ta.value; save(); bill.from = ''; bill.to = ''; render(); toast('공휴일 목록을 저장했습니다'); } }, '저장'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { delete st.holidays; save(); bill.from = ''; bill.to = ''; render(); } }, '초안으로 되돌리기')));
    var cta = h('textarea', { rows: '5', class: 'mono', 'aria-label': '회사 휴무일 목록' }); cta.value = companyHolidayText();
    var cparsed = L.parseHolidays(cta.value);
    var compBox = h('details', { class: 'holidays' }, h('summary', null, '회사 휴무일 (휴가·근로자의 날 등 — ' + Object.keys(cparsed.map).length + '일)'),
      h('p', { class: 'note' }, '일반 달력(위 공휴일 목록)에 더해 회사가 쉬는 날을 적습니다. 한 줄에 「YYYY-MM-DD 이름」, 휴가처럼 여러 날이면 「2026-07-29~08-02 하계 휴가」처럼 적어 주세요. 여기 적은 날도 휴일로 보고 마감일·휴일 근무를 계산합니다.'),
      cta, cparsed.bad.length ? h('div', { class: 'alert warn' }, '날짜로 읽지 못한 줄: ' + cparsed.bad.join(' / ')) : null,
      h('div', { class: 'btn-row', style: 'margin-top:8px' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: function () { st.companyHolidays = cta.value; save(); bill.from = ''; bill.to = ''; render(); toast('회사 휴무일을 저장했습니다'); } }, '저장'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { delete st.companyHolidays; save(); bill.from = ''; bill.to = ''; render(); } }, '초안으로 되돌리기')));
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '마감 준비'),
      h('p', null, head),
      !isCut ? h('p', { class: 'note' }, '종료일이 그달 마감일(근무일 기준 말일)이 아닙니다. 체크리스트는 종료일을 마감일로 보고 계산합니다.') : null,
      ul, holBox, compBox));
  }
  // 가입력(예상치) → 확정 대조
  function renderProvisional(main, st, meta) {
    var rep = L.provisionalReport(db.rows, meta.from, meta.to);
    if (!rep.pending.length && !rep.confirmed.length) return;
    var diff = L.closingDiff(db.rows, db.masters, meta.from, meta.to, { holidays: meta.holidays, rate: st.rate, prices: {}, lpgMonthly: lpgMonthly(), bottleKg: st.bottleKg });
    var tb = h('tbody');
    function add(item, state) {
      item.diffs.forEach(function (d, i) {
        tb.appendChild(h('tr', { class: i === 0 ? 'grp' : '' }, h('td', null, i === 0 ? item.date + ' ' + item.shift : ''), h('td', null, i === 0 ? item.label : ''), h('td', null, i === 0 ? state : ''),
          h('td', null, d.label), h('td', { class: 'num' }, d.est == null ? '' : L.fmtNum(d.est)),
          h('td', { class: 'num' }, state === '확정 전' || d.fin == null ? '' : L.fmtNum(d.fin)),
          h('td', { class: 'num' + (d.diff ? ' diff' : '') }, state === '확정 전' ? '' : (d.diff > 0 ? '+' : '') + L.fmtNum(d.diff))));
      });
    }
    rep.pending.forEach(function (i) { add(i, '확정 전'); });
    rep.confirmed.forEach(function (i) { add(i, '확정 ' + (i.confirmed_at || '')); });
    function sign(n, d) { return (n > 0 ? '+' : '') + L.fmtNum(n, d); }
    var sum = ['장비 실가동 금월 ' + L.fmtNum(diff.hours.est) + ' → ' + L.fmtNum(diff.hours.fin) + 'h (' + sign(diff.hours.diff) + ')'];
    if (diff.amount) sum.push('기성금액 ₩' + L.fmtNum(diff.amount.est, 0) + ' → ₩' + L.fmtNum(diff.amount.fin, 0) + ' (' + sign(diff.amount.diff, 0) + '원)');
    Object.keys(diff.fuel).forEach(function (k) { if (diff.fuel[k].diff) sum.push(k + ' ' + sign(diff.fuel[k].diff) + ' ' + L.fuelUnit(k)); });
    if (diff.fuelAmount && diff.fuelAmount.diff) sum.push('주유 금액 ' + sign(diff.fuelAmount.diff, 0) + '원');
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '마감일 가입력 → 가동 후 확정'),
      rep.pending.length ? h('div', { class: 'alert warn' }, '확정 전 가입력 일지 ' + rep.pending.length + '장 — 가동이 끝나면 「1. 시험일지 입력」에서 다시 열어 「가동 후 확정 저장」을 눌러 주세요.') : null,
      h('p', null, '마감 때 낸 값 → 확정 값: ' + sum.join(' · ')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, h('tr', null, ['일자', '모델/호기', '상태', '항목', '가입력(예상치)', '확정', '차이'].map(function (x) { return h('th', null, x); }))), tb)),
      h('p', { class: 'note' }, '아래 청구서는 확정 값(확정 전이면 가입력 값)으로 계산합니다. 청구서 엑셀에 「가입력·확정 대조」 시트가 함께 붙습니다. 기성 기간을 직접 정해 뽑으므로 차이를 다음 달 기성에서 조정하지 않습니다(수강생 답 09-30) — 이 대조는 확인용입니다.')));
  }
  function withProvisionalSheet(sheets, meta) {
    var rep = L.provisionalReport(db.rows, meta.from, meta.to);
    if (!rep.pending.length && !rep.confirmed.length) return sheets;
    var st = settings();
    sheets['가입력·확정 대조'] = L.provisionalSheet(rep, L.closingDiff(db.rows, db.masters, meta.from, meta.to, { holidays: meta.holidays, rate: st.rate, prices: {}, lpgMonthly: lpgMonthly(), bottleKg: st.bottleKg }));
    return sheets;
  }

  // ── 대시보드 ──────────────────────────────────────────────
  function renderDashboard(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '현황 대시보드')));
    if (!db.rows.length) {
      main.appendChild(h('section', { class: 'card' }, h('p', null, '볼 일지가 없습니다. 「현황 데이터」에서 엑셀을 불러오거나 예시 데이터를 넣어 주세요.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/data' }, '현황 데이터로'), sampleButton(false))));
      return;
    }
    var fFrom = h('input', { type: 'date', name: 'from', value: dash.from });
    var fTo = h('input', { type: 'date', name: 'to', value: dash.to });
    var fModel = select('model', [['', '전체']].concat(L.models(db.rows)), dash.model);
    var fWk = h('input', { type: 'checkbox', name: 'skipWeekend', checked: dash.skipWeekend });
    [fFrom, fTo, fModel, fWk].forEach(function (el) {
      el.addEventListener('change', function () { dash.from = fFrom.value; dash.to = fTo.value; dash.model = fModel.value; dash.skipWeekend = fWk.checked; render(); });
    });
    main.appendChild(h('section', { class: 'card' }, h('div', { class: 'filters' },
      field('시작일', fFrom), field('종료일', fTo), field('모델', fModel), h('label', { class: 'check' }, fWk, '누락일에서 토·일 빼기'))));

    var rows = L.filterRows(db.rows, dash);
    var cum = L.cumulativeByModel(rows);
    var miss = L.missingDays(rows, { from: dash.from, to: dash.to, skipWeekend: dash.skipWeekend });
    var totalMiss = miss.reduce(function (s, g) { return s + g.missing.length; }, 0);
    var totalHours = cum.reduce(function (s, c) { return L.r2(s + c.hours); }, 0);
    var issueRows = L.recentIssues(rows, 1e9);
    var valid = L.issueSummary(L.validateRows(rows, { holidays: holidays() }));

    function kpi(k, v, unit) { return h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, unit ? h('small', null, unit) : null)); }
    main.appendChild(h('div', { class: 'kpis' },
      kpi('일지', fmt(rows.length), '건'), kpi('시험 모델', fmt(cum.length), '개'), kpi('운행시간 합계', fmt(totalHours), 'h'),
      kpi('문제점 기록', fmt(issueRows.length), '건'), kpi('입력 누락일', fmt(totalMiss), '일'), kpi('검사 오류', fmt(valid.error), '건')));

    var grid = h('div', { class: 'grid-2' });
    // 모델별 누적 운행시간
    var max = cum.reduce(function (m, c) { return Math.max(m, c.hours); }, 0) || 1;
    var bars = h('div', { class: 'bars', role: 'list' });
    cum.forEach(function (c) {
      var label = c.model + ' — 누적 ' + fmt(c.hours) + 'h, 일지 ' + c.logs + '건, ' + (c.first || '') + ' ~ ' + (c.last || '');
      bars.appendChild(h('div', { class: 'bar-row', role: 'listitem', title: label, 'aria-label': label },
        h('span', { class: 'name' }, c.model),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: 'width:' + (c.hours / max * 100).toFixed(1) + '%' })),
        h('span', { class: 'val' }, fmt(c.hours) + 'h')));
    });
    grid.appendChild(h('section', { class: 'card' }, h('h2', null, '모델별 누적 운행시간'),
      h('p', { class: 'note' }, (dash.from || dash.to ? '선택한 기간' : '전체 기간') + ' 합계. 막대에 마우스를 올리면 일지 수와 기간이 보입니다.'), bars));

    // 입력 누락일
    var ml = h('ul', { class: 'miss-list' });
    miss.forEach(function (g) {
      var name = g.model + (g.unit_no ? ' ' + g.unit_no : '');
      var shown = g.missing.slice(0, 8).map(function (d) { return d.slice(5).replace('-', '/'); }).join(', ');
      ml.appendChild(h('li', null, h('strong', null, name), ' ',
        g.missing.length ? h('span', { class: 'badge warn' }, g.missing.length + '일') : h('span', { class: 'badge ok' }, '누락 없음'),
        g.missing.length ? h('div', { class: 'dates' }, shown + (g.missing.length > 8 ? ' 외 ' + (g.missing.length - 8) + '일' : '')) : null,
        h('div', { class: 'dates' }, '확인 구간 ' + g.from + ' ~ ' + g.to)));
    });
    grid.appendChild(h('section', { class: 'card' }, h('h2', null, '입력 누락일'),
      h('p', { class: 'note' }, '모델·호기별 첫 일지부터 마지막 일지 사이에 일지가 없는 날입니다. 휴무·정비일도 함께 잡히니 확인용으로 보세요.'), ml));
    main.appendChild(grid);

    // 월별 추이
    var tr = L.monthlyTrend(rows);
    var tmax = 0;
    tr.models.forEach(function (m) { tr.months.forEach(function (mo) { tmax = Math.max(tmax, tr.hours[m][mo] || 0); }); });
    var tb = h('tbody');
    tr.models.forEach(function (m) {
      tb.appendChild(h('tr', null, h('td', null, m), tr.months.map(function (mo) {
        var v = tr.hours[m][mo];
        return h('td', { title: m + ' ' + mo + ': ' + (v == null ? '일지 없음' : fmt(v) + 'h') },
          v == null ? h('span', { class: 'note' }, '—') : h('div', { class: 'cell-bar' }, h('span', { class: 'num' }, fmt(v)),
            h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: 'width:' + (v / (tmax || 1) * 100).toFixed(1) + '%' }))));
      })));
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '월별 운행시간 추이 (h)'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', null, h('tr', null, h('th', null, '모델'), tr.months.map(function (mo) { return h('th', null, mo); }))), tb))));

    // 최근 문제점
    var it = h('tbody');
    issueRows.slice(0, 20).forEach(function (r) {
      it.appendChild(h('tr', { class: 'clickable', tabindex: '0', onclick: function () { editRow(r); }, onkeydown: function (e) { if (e.key === 'Enter') editRow(r); } },
        h('td', { class: 'num' }, r.date || ''), h('td', null, r.model + (r.unit_no ? ' ' + r.unit_no : '')), h('td', null, r.driver || ''),
        h('td', { class: 'wide' }, r.issue), h('td', null, r.photo || '')));
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '최근 문제점'),
      issueRows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', null, h('tr', null, ['일자', '모델', '운전자', '문제점', '사진 참조'].map(function (x) { return h('th', null, x); }))), it))
        : h('p', null, '이 기간에 기록된 문제점이 없습니다.'),
      issueRows.length > 20 ? h('p', { class: 'note' }, '최근 20건만 보입니다(전체 ' + issueRows.length + '건).') : null));
  }

  // 대화상자 안에서 Enter 를 눌러도 저장 없이 닫히지 않게 막습니다
  document.getElementById('dialogForm').addEventListener('submit', function (e) { e.preventDefault(); });
  render();
})();
