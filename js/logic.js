/*
 * 내구시험 일지 정리·기성 집계 — 순수 로직 모듈 (화면·저장소와 무관)
 * 브라우저에서는 window.DLLogic, Node(테스트)에서는 module.exports 로 씁니다.
 * ES module 이 아닌 이유: index.html 을 로컬 파일(file://)로 열었을 때
 * 브라우저가 module 스크립트를 막기 때문입니다.
 *
 * 표준 열(STD_FIELDS)은 기획서 5장 「표준 현황 엑셀 형식」을 옮긴 것입니다.
 * 실제 일지·엑셀 샘플을 받기 전이라 열 이름은 가정이며, 수강생 엑셀의 열 이름은
 * 불러오기 때 「열 맞추기」 단계에서 연결합니다(synonyms 는 자동 추천용).
 */
(function (root) {
  'use strict';

  // ── 표준 열 ──────────────────────────────────────────────────
  var STD_FIELDS = [
    { key: 'date', label: '일자', type: 'date', required: true, synonyms: ['일자', '날짜', '시험일', '시험일자', '작성일', 'date'] },
    { key: 'model', label: '모델', type: 'text', required: true, synonyms: ['모델', '모델명', '차종', '기종', 'model'] },
    { key: 'unit_no', label: '호기', type: 'text', synonyms: ['호기', '차량번호', '시험차', '차대번호', '호차', 'unit', 'serial'] },
    { key: 'test_type', label: '시험 종류', type: 'text', synonyms: ['시험종류', '시험 종류', '시험구분', '시험 구분', '시험명', '시험항목'] },
    { key: 'driver', label: '운전자', type: 'text', synonyms: ['운전자', '작성자', '시험자', '운전원', 'driver'] },
    { key: 'hour_start', label: '시작 아워미터(h)', type: 'number', synonyms: ['시작아워', '시작 아워', '시작아워미터', '시작 아워미터', '시작hr', '출발아워', '시작 hour'] },
    { key: 'hour_end', label: '종료 아워미터(h)', type: 'number', synonyms: ['종료아워', '종료 아워', '종료아워미터', '종료 아워미터', '종료hr', '누적아워', '누적 아워', '아워미터', '누적시간'] },
    { key: 'run_hours', label: '운행시간(h)', type: 'hours', synonyms: ['운행시간', '운행 시간', '시험시간', '가동시간', '작동시간', '시간'] },
    { key: 'battery_pct', label: '배터리소모율(%)', type: 'number', synonyms: ['배터리소모율', '배터리 소모율', '소모율', '배터리사용률', 'soc소모'] },
    { key: 'charge_kwh', label: '충전량(kWh)', type: 'number', synonyms: ['충전량', '충전 량', '충전전력', '충전kwh'] },
    { key: 'fuel_type', label: '연료 종류', type: 'fuel', synonyms: ['연료종류', '연료 종류', '연료', '유종'] },
    { key: 'fuel_qty', label: '연료 소모량', type: 'number', synonyms: ['연료소모량', '연료 소모량', '소모량', '주유량', '급유량', '충전가스', '사용량'] },
    { key: 'issue', label: '문제점', type: 'text', synonyms: ['문제점', '특이사항', '이슈', '비고', '고장내용', '불량내용'] },
    { key: 'photo', label: '사진 참조', type: 'text', synonyms: ['사진', '사진참조', '사진 참조', '이미지', '첨부'] }
  ];
  var FIELD = {};
  STD_FIELDS.forEach(function (f) { FIELD[f.key] = f; });

  // 연료비 대상 연료. 단위는 기본값일 뿐이며 화면에서 월별로 바꿀 수 있습니다(기획서 10장 확인 필요).
  var FUELS = [
    { key: '경유', unit: 'L' },
    { key: 'LPG', unit: 'L' }
  ];
  var ELECTRIC = '전기';

  // 범위 검사 기준(가정 — 기획서 10장 「이상 유무 판단 기준」 확인 전 임시값)
  var LIMITS = { dayHours: 24, batteryMax: 100, meterTolerance: 0.05, hoursMismatch: 0.1 };

  function emptyDb() {
    return { rows: [], prices: {}, mapping: {}, seq: 0 };
  }

  // ── 값 다듬기 ────────────────────────────────────────────────
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function validYmd(y, m, d) {
    if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1)) return false;
    return d <= new Date(y, m, 0).getDate();
  }
  function toDateStr(d) { return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

  // 엑셀 날짜 일련번호(1900 체계) → YYYY-MM-DD
  function fromSerial(n) {
    var ms = Math.round((n - 25569) * 86400000);
    var d = new Date(ms);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  // 일자 칸: Date 객체, 엑셀 일련번호, 「2026-09-01」「2026.9.1」「2026/09/01」「20260901」
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : toDateStr(v);
    if (typeof v === 'number') return v > 20000 && v < 80000 ? fromSerial(v) : null;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) {
      if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(parseFloat(s));
      return null;
    }
    var y = +m[1], mo = +m[2], d = +m[3];
    return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
  }
  // 숫자 칸: 쉼표·단위 글자를 떼고 읽습니다. 「1,234.5」「12.5L」「85 %」 → 숫자. 못 읽으면 null.
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, '');
    var m = s.match(/^([-+]?\d+(?:\.\d+)?)\s*[a-zA-Z가-힣%㎾㎏ℓ]*$/);
    return m ? parseFloat(m[1]) : null;
  }
  // 운행시간 칸: 숫자(시간) 또는 「3:30」(시:분) → 3.5
  function parseHours(v) {
    if (typeof v === 'string') {
      var m = v.trim().match(/^(\d{1,3}):([0-5]\d)$/);
      if (m) return r2(+m[1] + (+m[2]) / 60);
    }
    return parseNum(v);
  }
  function normFuel(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var k = s.toLowerCase().replace(/\s/g, '');
    if (/^(경유|디젤|diesel|d)$/.test(k)) return '경유';
    if (/^(lpg|lpg가스|가스|엘피지|lp가스)$/.test(k)) return 'LPG';
    if (/^(전기|전동|배터리|ev|electric|battery)$/.test(k)) return ELECTRIC;
    return s;
  }
  function text(v) {
    if (v == null) return '';
    if (v instanceof Date) return toDateStr(v);
    return String(v).trim();
  }
  // 소수 둘째 자리 반올림(부동소수 찌꺼기 제거용)
  function r2(x) { return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function monthOf(date) { return date ? String(date).slice(0, 7) : ''; }

  // 행 하나를 표준 값으로 정리합니다(원래 적힌 값은 raw 에 남깁니다).
  function normalizeRow(src) {
    var row = {};
    var bad = [];
    STD_FIELDS.forEach(function (f) {
      var v = src[f.key];
      var out;
      if (f.type === 'date') out = parseDate(v);
      else if (f.type === 'number') out = parseNum(v);
      else if (f.type === 'hours') out = parseHours(v);
      else if (f.type === 'fuel') out = normFuel(v);
      else out = text(v);
      if ((f.type === 'date' || f.type === 'number' || f.type === 'hours') && out == null && v != null && String(v).trim() !== '') {
        bad.push(f.key);
      }
      row[f.key] = out == null ? (f.type === 'date' || f.type === 'number' || f.type === 'hours' ? null : '') : out;
    });
    if (bad.length) {
      // 못 읽은 원래 값은 고칠 때 보이도록 남겨 둡니다
      row._unreadable = bad;
      row._raw = {};
      bad.forEach(function (k) { row._raw[k] = String(src[k]); });
    }
    return row;
  }

  // 운행시간: 적힌 값이 있으면 그 값, 없으면 종료−시작 아워미터
  function effectiveHours(row) {
    if (row.run_hours != null) return row.run_hours;
    if (row.hour_start != null && row.hour_end != null) return r2(row.hour_end - row.hour_start);
    return null;
  }

  // ── 열 맞추기(가져오기) ──────────────────────────────────────
  function squash(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-()（）\[\]·.:/]/g, '').replace(/(kwh|%|h|l|kg)$/, ''); }
  function matchField(header) {
    var h = squash(header);
    if (!h) return null;
    for (var i = 0; i < STD_FIELDS.length; i++) {
      var f = STD_FIELDS[i];
      if (squash(f.label) === h || squash(f.key) === h) return f.key;
      for (var j = 0; j < f.synonyms.length; j++) if (squash(f.synonyms[j]) === h) return f.key;
    }
    return null;
  }
  // 머리행 찾기: 위에서 10줄 안에서 표준 열로 알아볼 수 있는 칸이 가장 많은 줄(동점이면 위쪽)
  function detectHeaderRow(aoa) {
    var best = -1, bestScore = 0;
    for (var i = 0; i < Math.min(10, aoa.length); i++) {
      var score = 0;
      (aoa[i] || []).forEach(function (c) { if (matchField(c)) score++; });
      if (score > bestScore) { best = i; bestScore = score; }
    }
    if (best >= 0 && bestScore >= 2) return best;
    for (var k = 0; k < aoa.length; k++) {
      if ((aoa[k] || []).some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) return k;
    }
    return 0;
  }
  function headersOf(aoa, headerRow) {
    return (aoa[headerRow] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
  }
  // 자동 추천: { 표준키: 원본 열 이름 }. saved(지난번 저장한 연결)가 있으면 그것을 먼저 씁니다.
  function autoMap(headers, saved) {
    var map = {};
    var used = {};
    if (saved) {
      Object.keys(saved).forEach(function (k) {
        if (FIELD[k] && headers.indexOf(saved[k]) >= 0) { map[k] = saved[k]; used[saved[k]] = true; }
      });
    }
    headers.forEach(function (h) {
      if (!h || used[h]) return;
      var k = matchField(h);
      if (k && !map[k]) { map[k] = h; used[h] = true; }
    });
    return map;
  }
  // 시트 하나를 표준 행으로 바꿉니다.
  // opts: { mapping, headerRow, sheetName, fileName, modelFallback: 'sheet'|'file'|'fixed'|'none', modelFixed }
  function applyMapping(aoa, opts) {
    var headers = headersOf(aoa, opts.headerRow);
    var idx = {};
    Object.keys(opts.mapping || {}).forEach(function (k) {
      var i = headers.indexOf(opts.mapping[k]);
      if (i >= 0) idx[k] = i;
    });
    var fallbackModel = opts.modelFallback === 'sheet' ? opts.sheetName
      : opts.modelFallback === 'file' ? String(opts.fileName || '').replace(/\.[^.]+$/, '')
        : opts.modelFallback === 'fixed' ? opts.modelFixed : '';
    var rows = [], skipped = 0;
    for (var r = opts.headerRow + 1; r < aoa.length; r++) {
      var line = aoa[r] || [];
      var empty = !line.some(function (c) { return c != null && String(c).trim() !== ''; });
      if (empty) { skipped++; continue; }
      var src = {};
      Object.keys(idx).forEach(function (k) { src[k] = line[idx[k]]; });
      var row = normalizeRow(src);
      if (!row.model && fallbackModel) row.model = String(fallbackModel).trim();
      row._src = (opts.fileName || '') + (opts.sheetName ? ' / ' + opts.sheetName : '') + ' ' + (r + 1) + '행';
      rows.push(row);
    }
    return { rows: rows, skipped: skipped };
  }

  // ── 입력값 검사 ──────────────────────────────────────────────
  // 결과: [{ id, level: 'error'|'warn', field, code, msg }]
  function unitKey(row) { return (row.model || '') + '|' + (row.unit_no || ''); }
  function validateRows(rows) {
    var out = [];
    function add(row, level, field, code, msg) { out.push({ id: row.id, level: level, field: field, code: code, msg: msg }); }
    var seen = {};
    rows.forEach(function (row) {
      (row._unreadable || []).forEach(function (k) {
        add(row, 'error', k, 'unreadable', FIELD[k].label + ' 값을 숫자·날짜로 읽지 못했습니다');
      });
      if (!row.date && !(row._unreadable || []).some(function (k) { return k === 'date'; })) add(row, 'error', 'date', 'required', '일자가 비어 있습니다');
      if (!row.model) add(row, 'error', 'model', 'required', '모델이 비어 있습니다');
      if (!row.driver) add(row, 'warn', 'driver', 'blank', '운전자가 비어 있습니다');
      var h = effectiveHours(row);
      if (h == null) add(row, 'warn', 'run_hours', 'blank', '운행시간(또는 시작·종료 아워미터)이 비어 있습니다');
      ['hour_start', 'hour_end', 'run_hours', 'battery_pct', 'charge_kwh', 'fuel_qty'].forEach(function (k) {
        if (row[k] != null && row[k] < 0) add(row, 'error', k, 'negative', FIELD[k].label + ' 값이 음수입니다');
      });
      if (row.hour_start != null && row.hour_end != null && row.hour_end < row.hour_start) {
        add(row, 'error', 'hour_end', 'end_before_start', '종료 아워미터가 시작보다 작습니다');
      }
      if (row.run_hours != null && row.hour_start != null && row.hour_end != null &&
        Math.abs(row.run_hours - (row.hour_end - row.hour_start)) > LIMITS.hoursMismatch) {
        add(row, 'warn', 'run_hours', 'hours_mismatch', '운행시간과 아워미터 차이(' + r2(row.hour_end - row.hour_start) + 'h)가 다릅니다');
      }
      if (h != null && h > LIMITS.dayHours) add(row, 'error', 'run_hours', 'range', '하루 운행시간이 ' + LIMITS.dayHours + '시간을 넘습니다');
      if (row.battery_pct != null && row.battery_pct > LIMITS.batteryMax) add(row, 'error', 'battery_pct', 'range', '배터리소모율이 100%를 넘습니다');
      if (row.fuel_qty != null && row.fuel_qty > 0 && !row.fuel_type) add(row, 'warn', 'fuel_type', 'blank', '연료 소모량은 있는데 연료 종류가 비어 있습니다');
      if (row.fuel_type && row.fuel_type !== ELECTRIC && !FUELS.some(function (f) { return f.key === row.fuel_type; })) {
        add(row, 'warn', 'fuel_type', 'unknown', '알 수 없는 연료 종류 「' + row.fuel_type + '」 — 연료비 집계에서 빠집니다');
      }
      if (row.date && row.model) {
        var dk = row.date + '|' + unitKey(row);
        if (seen[dk]) add(row, 'warn', 'date', 'duplicate', '같은 일자·모델·호기 일지가 이미 있습니다');
        seen[dk] = true;
      }
    });
    // 누적값 역행: 같은 모델·호기를 일자순으로 놓고, 오늘 시작(없으면 종료) 아워미터가 전날 종료값보다 작으면 표시
    var groups = {};
    rows.forEach(function (row) {
      if (!row.date || !row.model) return;
      (groups[unitKey(row)] = groups[unitKey(row)] || []).push(row);
    });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var prevEnd = null, prevDate = '';
      list.forEach(function (row) {
        var cur = row.hour_start != null ? row.hour_start : row.hour_end;
        if (cur != null && prevEnd != null && row.date !== prevDate && cur < prevEnd - LIMITS.meterTolerance) {
          add(row, 'error', row.hour_start != null ? 'hour_start' : 'hour_end', 'meter_backwards',
            '누적 아워미터가 전 일지(' + prevDate + ', ' + prevEnd + 'h)보다 줄었습니다');
        }
        var end = row.hour_end != null ? row.hour_end : null;
        if (end != null) { prevEnd = end; prevDate = row.date; }
      });
    });
    return out;
  }
  function issueSummary(issues) {
    var s = { error: 0, warn: 0, rows: 0 };
    var ids = {};
    issues.forEach(function (i) { s[i.level]++; ids[i.id] = true; });
    s.rows = Object.keys(ids).length;
    return s;
  }

  // ── 조회·집계 ────────────────────────────────────────────────
  // f: { from, to, model } (모두 선택)
  function filterRows(rows, f) {
    f = f || {};
    return rows.filter(function (r) {
      if (f.from && (!r.date || r.date < f.from)) return false;
      if (f.to && (!r.date || r.date > f.to)) return false;
      if (f.model && r.model !== f.model) return false;
      return true;
    });
  }
  function models(rows) {
    var m = {};
    rows.forEach(function (r) { if (r.model) m[r.model] = true; });
    return Object.keys(m).sort();
  }
  function months(rows) {
    var m = {};
    rows.forEach(function (r) { if (r.date) m[monthOf(r.date)] = true; });
    return Object.keys(m).sort();
  }
  // 모델별 월 집계: [{ month, model, logs, days, hours, fuel: {경유, LPG}, charge }]
  // 일자·모델이 없는 행은 집계에서 뺍니다(검사에서 오류로 표시됩니다).
  function aggregateMonthly(rows) {
    var map = {};
    rows.forEach(function (r) {
      if (!r.date || !r.model) return;
      var key = monthOf(r.date) + '|' + r.model;
      var a = map[key];
      if (!a) {
        a = map[key] = { month: monthOf(r.date), model: r.model, logs: 0, days: 0, hours: 0, fuel: {}, charge: 0, _days: {} };
        FUELS.forEach(function (f) { a.fuel[f.key] = 0; });
      }
      a.logs++;
      if (!a._days[r.date]) { a._days[r.date] = true; a.days++; }
      var h = effectiveHours(r);
      if (h != null && h > 0) a.hours = r2(a.hours + h);
      if (r.fuel_qty != null && r.fuel_qty > 0 && a.fuel[r.fuel_type] != null) a.fuel[r.fuel_type] = r2(a.fuel[r.fuel_type] + r.fuel_qty);
      if (r.charge_kwh != null && r.charge_kwh > 0) a.charge = r2(a.charge + r.charge_kwh);
    });
    return Object.keys(map).sort().map(function (k) { delete map[k]._days; return map[k]; });
  }
  // 연료비: 모델·연료별로 (월 소모량 합계 × 단가)를 원 단위 반올림. 합계는 반올림한 금액을 더합니다.
  // prices: { 경유: { price, unit, source, checked }, LPG: {...} } — 사용자가 입력한 그 달 평균 단가
  function calcBilling(agg, prices) {
    prices = prices || {};
    var missing = {};
    var lines = agg.map(function (a) {
      var cost = {}, total = 0;
      FUELS.forEach(function (f) {
        var q = a.fuel[f.key] || 0;
        var p = prices[f.key] && parseNum(prices[f.key].price);
        if (q > 0 && (p == null || p <= 0)) { missing[f.key] = true; cost[f.key] = null; return; }
        var c = q > 0 ? Math.round(q * p) : 0;
        cost[f.key] = c; total += c;
      });
      return { month: a.month, model: a.model, logs: a.logs, days: a.days, hours: a.hours, fuel: a.fuel, charge: a.charge, cost: cost, total: total };
    });
    var totals = { logs: 0, days: 0, hours: 0, fuel: {}, cost: {}, charge: 0, total: 0 };
    FUELS.forEach(function (f) { totals.fuel[f.key] = 0; totals.cost[f.key] = 0; });
    lines.forEach(function (l) {
      totals.logs += l.logs; totals.days += l.days; totals.hours = r2(totals.hours + l.hours); totals.charge = r2(totals.charge + l.charge);
      FUELS.forEach(function (f) { totals.fuel[f.key] = r2(totals.fuel[f.key] + l.fuel[f.key]); totals.cost[f.key] += l.cost[f.key] || 0; });
      totals.total += l.total;
    });
    return { lines: lines, totals: totals, missingPrice: Object.keys(missing) };
  }
  // 대시보드: 모델별 누적 운행시간
  function cumulativeByModel(rows) {
    var agg = {};
    rows.forEach(function (r) {
      if (!r.model) return;
      var a = agg[r.model] = agg[r.model] || { model: r.model, hours: 0, logs: 0, issues: 0, first: '', last: '' };
      var h = effectiveHours(r);
      if (h != null && h > 0) a.hours = r2(a.hours + h);
      a.logs++;
      if (r.issue) a.issues++;
      if (r.date && (!a.first || r.date < a.first)) a.first = r.date;
      if (r.date && r.date > a.last) a.last = r.date;
    });
    return Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.hours - a.hours || (a.model < b.model ? -1 : 1); });
  }
  // 월별 추이: { months, models, hours: { model: { month: h } } }
  function monthlyTrend(rows) {
    var agg = aggregateMonthly(rows);
    var out = { months: months(rows.filter(function (r) { return r.model; })), models: models(rows), hours: {} };
    out.models.forEach(function (m) { out.hours[m] = {}; });
    agg.forEach(function (a) { out.hours[a.model][a.month] = a.hours; });
    return out;
  }
  function recentIssues(rows, n) {
    return rows.filter(function (r) { return r.issue; })
      .sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : 0; })
      .slice(0, n || 20);
  }
  // 입력 누락일: 모델·호기별로 첫 일지~마지막 일지 사이(기간 필터가 있으면 그 안)에서 일지가 없는 날.
  // skipWeekend 가 참이면 토·일은 빼고 봅니다(시험 운영 요일은 가정 — 기획서 10장 확인).
  function missingDays(rows, opt) {
    opt = opt || {};
    var groups = {};
    rows.forEach(function (r) {
      if (!r.date || !r.model) return;
      var k = unitKey(r);
      var g = groups[k] = groups[k] || { model: r.model, unit_no: r.unit_no || '', dates: {}, first: r.date, last: r.date };
      g.dates[r.date] = true;
      if (r.date < g.first) g.first = r.date;
      if (r.date > g.last) g.last = r.date;
    });
    return Object.keys(groups).sort().map(function (k) {
      var g = groups[k];
      var from = opt.from && opt.from > g.first ? opt.from : g.first;
      var to = opt.to && opt.to < g.last ? opt.to : g.last;
      var miss = [];
      var p = from.split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      for (var guard = 0; guard < 3660; guard++) {
        var s = toDateStr(d);
        if (s > to) break;
        var wd = d.getDay();
        if (!g.dates[s] && !(opt.skipWeekend && (wd === 0 || wd === 6))) miss.push(s);
        d.setDate(d.getDate() + 1);
      }
      return { model: g.model, unit_no: g.unit_no, from: from, to: to, missing: miss };
    });
  }

  // ── 엑셀 시트 만들기 ─────────────────────────────────────────
  function stdHeader() { return STD_FIELDS.map(function (f) { return f.label; }); }
  function standardSheet(rows) {
    var aoa = [stdHeader()];
    rows.forEach(function (r) {
      aoa.push(STD_FIELDS.map(function (f) { var v = r[f.key]; return v == null ? '' : v; }));
    });
    return aoa;
  }
  function templateSheets() {
    var guide = [['표준 현황 엑셀 — 작성 안내'], [''], ['열', '필수', '적는 법']];
    var how = {
      date: '2026-09-01 형식(엑셀 날짜도 됩니다)', model: '시험 모델명', unit_no: '같은 모델 시험차가 여러 대면 구분',
      test_type: '예: 주행내구, 하역내구', driver: '운전자 이름', hour_start: '일지 시작 때 아워미터 누적값',
      hour_end: '일지 끝날 때 아워미터 누적값', run_hours: '비우면 종료−시작으로 계산. 3:30 처럼 시:분도 됩니다',
      battery_pct: '전동 모델, 0~100', charge_kwh: '전동 모델 충전량', fuel_type: '경유 / LPG / 전기',
      fuel_qty: '경유·LPG 소모량(단위는 기성 화면에서 지정)', issue: '문제점 문장 그대로', photo: '사진 파일명이나 보관 위치'
    };
    STD_FIELDS.forEach(function (f) { guide.push([f.label, f.required ? '필수' : '', how[f.key] || '']); });
    guide.push([''], ['한 행 = 일지 한 장입니다. 열 이름은 샘플 확인 후 바뀔 수 있습니다(가정).']);
    return { '현황': [stdHeader()], '작성 안내': guide };
  }
  // 기성용 엑셀(실제 기성 양식 수령 전의 임시 배치 — 기획서 8장 2단계에서 양식에 맞춥니다)
  function billingSheets(month, billing, prices, rows, issues) {
    var head = ['월', '모델', '일지 수', '운행 일수', '운행시간(h)'];
    FUELS.forEach(function (f) {
      var u = (prices[f.key] && prices[f.key].unit) || f.unit;
      head.push(f.key + ' 소모량(' + u + ')', f.key + ' 단가(원/' + u + ')', f.key + ' 연료비(원)');
    });
    head.push('충전량(kWh)', '연료비 합계(원)');
    var sum = [['월간 기성 집계 — ' + month + ' (임시 양식)'], [''], head];
    billing.lines.forEach(function (l) {
      var line = [l.month, l.model, l.logs, l.days, l.hours];
      FUELS.forEach(function (f) {
        var p = prices[f.key] ? parseNum(prices[f.key].price) : null;
        line.push(l.fuel[f.key], l.fuel[f.key] > 0 ? (p == null ? '' : p) : '', l.cost[f.key] == null ? '단가 없음' : l.cost[f.key]);
      });
      line.push(l.charge, l.total);
      sum.push(line);
    });
    var t = billing.totals;
    var tl = ['합계', '', t.logs, t.days, t.hours];
    FUELS.forEach(function (f) { tl.push(t.fuel[f.key], '', t.cost[f.key]); });
    tl.push(t.charge, t.total);
    sum.push(tl);
    if (billing.missingPrice.length) sum.push([''], ['단가가 비어 연료비를 계산하지 못한 연료: ' + billing.missingPrice.join(', ')]);
    var price = [['월', '연료', '단가(원)', '단위', '가격 출처', '조회일']];
    FUELS.forEach(function (f) {
      var p = prices[f.key] || {};
      price.push([month, f.key, p.price == null ? '' : p.price, p.unit || f.unit, p.source || '', p.checked || '']);
    });
    var check = [['일자', '모델', '호기', '구분', '항목', '내용']];
    var byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });
    (issues || []).forEach(function (i) {
      var r = byId[i.id];
      if (!r) return;
      check.push([r.date || '', r.model || '', r.unit_no || '', i.level === 'error' ? '오류' : '확인', FIELD[i.field] ? FIELD[i.field].label : i.field, i.msg]);
    });
    return { '기성 요약': sum, '연료 단가': price, '현황 데이터': standardSheet(rows), '입력값 검사': check };
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙입니다.
  function aoaToCsv(aoa) {
    return '﻿' + aoa.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  var api = {
    STD_FIELDS: STD_FIELDS, FIELD: FIELD, FUELS: FUELS, ELECTRIC: ELECTRIC, LIMITS: LIMITS,
    emptyDb: emptyDb, toDateStr: toDateStr, parseDate: parseDate, parseNum: parseNum, parseHours: parseHours,
    normFuel: normFuel, r2: r2, monthOf: monthOf, normalizeRow: normalizeRow, effectiveHours: effectiveHours,
    matchField: matchField, detectHeaderRow: detectHeaderRow, headersOf: headersOf, autoMap: autoMap, applyMapping: applyMapping,
    validateRows: validateRows, issueSummary: issueSummary, filterRows: filterRows, models: models, months: months,
    aggregateMonthly: aggregateMonthly, calcBilling: calcBilling, cumulativeByModel: cumulativeByModel,
    monthlyTrend: monthlyTrend, recentIssues: recentIssues, missingDays: missingDays,
    stdHeader: stdHeader, standardSheet: standardSheet, templateSheets: templateSheets, billingSheets: billingSheets,
    aoaToCsv: aoaToCsv
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DLLogic = api;
})(typeof window !== 'undefined' ? window : this);
