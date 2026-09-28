/* 내구시험 일지 정리·기성 집계 — 화면 (현황 데이터 · 불러오기 · 월간 기성 · 대시보드) */
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
  var billMonth = '';

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
  function writeXlsx(name, sheets) {
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (n) {
      var ws = XLSX.utils.aoa_to_sheet(sheets[n]);
      ws['!cols'] = (sheets[n][0] || []).map(function () { return { wch: 14 }; });
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
  function route() { return (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'data'; }
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
    else renderData(main);
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
      db._sample = true;
      save(); closeDialog();
      toast('예시 데이터 ' + db.rows.length + '행을 불러왔습니다');
      if (route() !== 'data') location.hash = '#/data'; else render();
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
          h('li', null, '「월간 기성」에서 그 달 평균 연료 단가를 적으면 모델별 연료비가 계산되고 기성용 엑셀을 내려받을 수 있습니다.'),
          h('li', null, '「대시보드」에서 모델별 누적 운행시간·월별 추이·문제점·입력 누락일을 봅니다.')),
        h('p', { class: 'note' }, '실제 엑셀이 아직 없으면 「예시 데이터 불러오기」로 가상 데이터를 넣어 흐름을 볼 수 있습니다. samples 폴더의 예시 파일로 열 맞추기도 시험해 볼 수 있습니다: ',
          h('a', { href: 'samples/예시데이터_모델별엑셀.xlsx', download: true }, '모델별 엑셀(예시)'), ' · ',
          h('a', { href: 'samples/예시데이터_표준현황.csv', download: true }, '표준 현황 CSV(예시)')),
        h('div', { class: 'btn-row' }, importButton(true), sampleButton(false), templateButton())));
      return;
    }

    var issues = L.validateRows(db.rows);
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
    openDialog('전체 삭제', h('p', null, '이 브라우저에 저장된 일지 ' + db.rows.length + '행과 입력한 연료 단가를 모두 지웁니다. 되돌릴 수 없습니다.'), [
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, '취소'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        var mapping = db.mapping;
        db = L.emptyDb(); db.mapping = mapping || {};
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
    var msgs = r ? (issuesById(L.validateRows(db.rows))[r.id] || []) : [];
    var content = [
      msgs.length ? h('div', { class: 'alert error' }, h('ul', { class: 'miss-list' }, msgs.map(function (i) { return h('li', null, i.msg); }))) : null,
      r && r._src ? h('p', { class: 'note' }, '가져온 곳: ' + r._src) : null,
      form
    ];
    openDialog(isNew ? '일지 행 추가' : '일지 행 고치기', content, [
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
    var issues = L.validateRows(conv.rows.map(function (r, i) { return Object.assign({ id: 'p' + i }, r); }));
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
        addRows(c.rows, imp.mode === 'replace' || db._sample);
        save();
        var s2 = L.issueSummary(L.validateRows(db.rows));
        imp = null;
        location.hash = '#/data';
        toast(c.rows.length + '행을 불러왔습니다. 검사 오류 ' + s2.error + '건 · 확인 ' + s2.warn + '건');
      } }, conv.rows.length + '행 불러오기')));
    if (db._sample) prev.appendChild(h('p', { class: 'note' }, '예시 데이터는 실제 데이터와 섞이지 않도록 불러올 때 지웁니다.'));
    main.appendChild(prev);
  }

  // ── 월간 기성 ─────────────────────────────────────────────
  function renderBilling(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', null, '월간 기성')));
    var ms = L.months(db.rows.filter(function (r) { return r.model; }));
    if (!ms.length) {
      main.appendChild(h('section', { class: 'card' }, h('p', null, '집계할 일지가 없습니다. 「현황 데이터」에서 엑셀을 불러오거나 예시 데이터를 넣어 주세요.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/data' }, '현황 데이터로'), sampleButton(false))));
      return;
    }
    // 기본값: 이번 달보다 앞선 마지막 달(월말 기성은 지난달을 마감하므로), 없으면 가장 최근 달
    if (!billMonth || ms.indexOf(billMonth) < 0) {
      var cur = today().slice(0, 7);
      var past = ms.filter(function (m) { return m < cur; });
      billMonth = past.length ? past[past.length - 1] : ms[ms.length - 1];
    }
    var mSel = select('month', ms.slice().reverse(), billMonth);
    mSel.addEventListener('change', function () { billMonth = mSel.value; render(); });
    main.appendChild(h('section', { class: 'card' }, h('div', { class: 'filters' }, field('기성 월', mSel)),
      h('p', { class: 'note', style: 'margin-top:10px' }, '달력 기준 1일~말일 일지를 모읍니다(마감 기준일은 확인 필요).')));

    var monthRows = db.rows.filter(function (r) { return L.monthOf(r.date) === billMonth; });
    var agg = L.aggregateMonthly(monthRows);
    var prices = db.prices[billMonth] = db.prices[billMonth] || {};

    // 단가 입력
    var priceCard = h('section', { class: 'card' }, h('h2', null, '평균 연료 단가 (' + billMonth + ')'),
      h('p', { class: 'note' }, '오피넷 등에서 찾은 그 달 평균 가격을 직접 적습니다. 도구가 가격을 정해 두거나 가져오지 않습니다. 출처와 조회일을 함께 남기면 기성 근거가 됩니다.'));
    var used = {};
    agg.forEach(function (a) { L.FUELS.forEach(function (f) { if (a.fuel[f.key] > 0) used[f.key] = true; }); });
    var pg = h('div', { class: 'grid-2' });
    L.FUELS.forEach(function (f) {
      var p = prices[f.key] = prices[f.key] || { price: '', unit: f.unit, source: '', checked: '' };
      function bind(el, key) { el.addEventListener('change', function () { p[key] = el.value.trim(); save(); render(); }); return el; }
      var box = h('div', { class: 'card', style: 'margin:0' },
        h('h3', null, f.key + (used[f.key] ? '' : ' (이번 달 소모량 없음)')),
        h('div', { class: 'form-grid' },
          field('단가(원/' + (p.unit || f.unit) + ')', bind(h('input', { type: 'text', inputmode: 'decimal', name: 'price_' + f.key, value: p.price, placeholder: '예: 1,500' }), 'price')),
          field('단위', bind(select('unit_' + f.key, ['L', 'kg'], p.unit || f.unit), 'unit')),
          field('가격 출처', bind(h('input', { type: 'text', name: 'source_' + f.key, value: p.source, placeholder: '예: 오피넷 월평균' }), 'source')),
          field('조회일', bind(h('input', { type: 'date', name: 'checked_' + f.key, value: p.checked }), 'checked'))));
      if (p.price && L.parseNum(p.price) == null) box.appendChild(h('div', { class: 'alert error' }, '단가를 숫자로 읽지 못했습니다.'));
      pg.appendChild(box);
    });
    priceCard.appendChild(pg);
    main.appendChild(priceCard);

    // 집계표
    var bill = L.calcBilling(agg, prices);
    var monthIssues = L.validateRows(db.rows).filter(function (i) {
      var r = db.rows.find(function (x) { return x.id === i.id; });
      return r && L.monthOf(r.date) === billMonth;
    });
    var ms2 = L.issueSummary(monthIssues);
    var tableCard = h('section', { class: 'card' }, h('h2', null, '모델별 집계 (' + billMonth + ')'));
    if (bill.missingPrice.length) tableCard.appendChild(h('div', { class: 'alert warn' }, '단가가 비어 연료비를 계산하지 못한 연료: ' + bill.missingPrice.join(', ') + '. 위에 단가를 적어 주세요.'));
    if (ms2.error) tableCard.appendChild(h('div', { class: 'alert error' }, '이 달 일지에 검사 오류 ' + ms2.error + '건이 있습니다. ', h('a', { href: '#/data' }, '현황 데이터'), '에서 확인한 뒤 내려받는 것을 권합니다.'));
    var head = ['모델', '일지 수', '운행 일수', '운행시간(h)'];
    L.FUELS.forEach(function (f) { var u = prices[f.key].unit || f.unit; head.push(f.key + '(' + u + ')', f.key + ' 연료비(원)'); });
    head.push('충전량(kWh)', '연료비 합계(원)');
    var tb = h('tbody');
    bill.lines.forEach(function (l) {
      var tds = [h('td', null, l.model), h('td', { class: 'num' }, fmt(l.logs)), h('td', { class: 'num' }, fmt(l.days)), h('td', { class: 'num' }, fmt(l.hours))];
      L.FUELS.forEach(function (f) {
        tds.push(h('td', { class: 'num' }, fmt(l.fuel[f.key])), h('td', { class: 'num' }, l.cost[f.key] == null ? '단가 없음' : fmt(l.cost[f.key], 0)));
      });
      tds.push(h('td', { class: 'num' }, fmt(l.charge)), h('td', { class: 'num' }, fmt(l.total, 0)));
      tb.appendChild(h('tr', null, tds));
    });
    var t = bill.totals;
    var foot = [h('td', null, '합계'), h('td', { class: 'num' }, fmt(t.logs)), h('td', { class: 'num' }, fmt(t.days)), h('td', { class: 'num' }, fmt(t.hours))];
    L.FUELS.forEach(function (f) { foot.push(h('td', { class: 'num' }, fmt(t.fuel[f.key])), h('td', { class: 'num' }, fmt(t.cost[f.key], 0))); });
    foot.push(h('td', { class: 'num' }, fmt(t.charge)), h('td', { class: 'num' }, fmt(t.total, 0)));
    tableCard.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'list', id: 'billTable' },
      h('thead', null, h('tr', null, head.map(function (x) { return h('th', null, x); }))), tb, h('tfoot', null, h('tr', null, foot)))));
    tableCard.appendChild(h('p', { class: 'note' }, '연료비 = 모델별 월 소모량 합계 × 단가, 원 단위 반올림. 전동 모델 충전량은 합계만 보이고 전력비는 계산하지 않습니다(기성 대상 여부 확인 필요).'));
    tableCard.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        writeXlsx('기성집계_' + billMonth + tag() + '.xlsx', L.billingSheets(billMonth, bill, prices, sortByDate(monthRows), monthIssues));
      } }, '기성용 엑셀 내려받기')));
    tableCard.appendChild(h('p', { class: 'note' }, '시트 4개: 기성 요약 · 연료 단가(출처·조회일) · 현황 데이터(그 달 일지) · 입력값 검사. 실제 기성 양식을 받으면 그 배치로 바꿉니다(2단계).'));
    main.appendChild(tableCard);
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
    var valid = L.issueSummary(L.validateRows(rows));

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
