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
    { key: 'driver', label: '운전자', type: 'text', synonyms: ['운전자', '작성자', '시험자', '운전원', '운전자code', '운전자 코드', 'driver'] },
    // 2026-09-29 실제 양식(TPR 일지·시험일지 정리 엑셀) 기준으로 더한 열
    { key: 'shift', label: '주/야/휴', type: 'shift', synonyms: ['주야휴', '주/야/휴', '주야', '근무', 'shift'] },
    { key: 'weather', label: '날씨', type: 'text', synonyms: ['날씨', '기상', 'weather'] },
    { key: 'hour_start', label: '시작 아워미터(h)', type: 'number', synonyms: ['시작아워', '시작 아워', '시작아워미터', '시작 아워미터', '시작hr', '출발아워', '시작 hour', '전일아워미터'] },
    { key: 'hour_end', label: '종료 아워미터(h)', type: 'number', synonyms: ['종료아워', '종료 아워', '종료아워미터', '종료 아워미터', '종료hr', '누적아워', '누적 아워', '누적아워미터', '금일아워미터', '아워미터', '누적시간'] },
    { key: 'run_hours', label: '운행시간(h)', type: 'hours', synonyms: ['운행시간', '운행 시간', '시험시간', '가동시간', '일 가동시간', '금일가동시간', '작동시간', '시간'] },
    { key: 'charge_h', label: '충전시간(h)', type: 'hours', synonyms: ['충전시간', '금일충전시간', '충전 시간'] },
    { key: 'cycle_h', label: '기본/요철 사이클(h)', type: 'hours', synonyms: ['기본/요철 사이클', '기본요철사이클', '사이클시간', '기본/요철 사이클 시간'] },
    { key: 'basic_cycles', label: '기본 사이클(회)', type: 'number', synonyms: ['기본 사이클', '기본사이클', '기본 사이클 회수', '기본사이클회수'] },
    { key: 'bump_cycles', label: '요철 사이클(회)', type: 'number', synonyms: ['요철 사이클', '요철사이클', '요철 사이클 회수', '요철사이클회수'] },
    { key: 'battery_check_h', label: '배터리 충전 점검(h)', type: 'hours', synonyms: ['배터리 충전 점검', '배터리충전점검', '충전점검'] },
    { key: 'inspect_h', label: '장비 점검·TPR 작성(h)', type: 'hours', synonyms: ['장비 점검 및 TPR 작성', '장비점검및tpr작성', '장비 점검/TPR 작성', '장비점검tpr작성', 'tpr작성', '장비점검'] },
    // 특화 시험(동력전달 특화 등) 시간. 수강생 답(09-29 오후): 운행 중 장비 수리는 따로 잡지 않고 특화 시험 시간에 포함
    { key: 'special_h', label: '특화 시험·장비수리(h)', type: 'hours', synonyms: ['특회 장비수리', '특회장비수리', '특화 장비수리', '특화장비수리', '특화 장비 수리', '특화시험', '특화 시험', '장비수리'] },
    { key: 'heater_h', label: '히터 가동(h)', type: 'hours', synonyms: ['히터가동시간', '히터 가동', '히터가동', '히터'] },
    { key: 'ac_h', label: '에어컨 가동(h)', type: 'hours', synonyms: ['에어컨가동시간', '에어컨가동 시간', '에어컨 가동', '에어컨가동', '에어컨'] },
    { key: 'battery_pct', label: '배터리소모율(%)', type: 'number', synonyms: ['배터리소모율', '배터리 소모율', '소모율', '배터리사용률', 'soc소모'] },
    { key: 'charge_kwh', label: '충전량(kWh)', type: 'number', synonyms: ['충전량', '충전 량', '충전전력', '충전kwh'] },
    { key: 'fuel_type', label: '연료 종류', type: 'fuel', synonyms: ['연료종류', '연료 종류', '연료', '유종'] },
    { key: 'fuel_qty', label: '연료 소모량', type: 'number', synonyms: ['연료소모량', '연료 소모량', '소모량', '주유량', '급유량', '충전가스', '사용량', '경유 주입량', '경유주입량', '연료 주입량', '가스 사용량'] },
    { key: 'urea_l', label: '요소수 주입량(L)', type: 'number', synonyms: ['요소수 주입량', '요소수주입량', '요소수'] },
    // 2026-09-30 수강생 답: 「경유와 요소수는 오피넷의 월 평균 단가를 사용하지 않고 주입 시 주유소 카드 결재 금액으로 처리」
    // — 리터당 단가가 아니라 주입할 때 확정된 결제 금액(VAT 포함)을 일지에 바로 적습니다. LPG 는 사용량만 적습니다.
    { key: 'fuel_won', label: '경유 결제 금액(원)', type: 'number', synonyms: ['경유 결제 금액', '경유결제금액', '경유 금액', '주유 금액', '주유금액', '결제 금액', '결제금액', '카드 결제 금액', '금액(원)'] },
    { key: 'urea_won', label: '요소수 결제 금액(원)', type: 'number', synonyms: ['요소수 결제 금액', '요소수결제금액', '요소수 금액', '요소수금액'] },
    { key: 'issue', label: '문제점', type: 'text', synonyms: ['문제점', '문제점/조치내용', '문제점조치내용', '금일 발생 문제점/조치내용', '특이사항', '이슈', '비고', '고장내용', '불량내용'] },
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
    // masters: 모델·호기별 정보(초기 아워미터·목표 가동시간·PG·과제번호·연료), settings: 기성·메일 설정
    return { rows: [], prices: {}, mapping: {}, seq: 0, masters: {}, settings: {} };
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
  // 주/야/휴: 「주간」「야간」「휴일」 등을 한 글자로. 모르는 값은 그대로 두고 검사에서 표시합니다.
  function normShift(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var k = s.toLowerCase().replace(/\s/g, '');
    if (/^(주|주간|day|d)$/.test(k)) return '주';
    if (/^(야|야간|night|n)$/.test(k)) return '야';
    if (/^(휴|휴일|주말|공휴일|holiday|h)$/.test(k)) return '휴';
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
      else if (f.type === 'shift') out = normShift(v);
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
    // 시험일지 정리 엑셀처럼 위쪽에 「모델명/호기」가 적혀 있으면 그 값을 모델·호기로 씁니다(모델 열 > 머리 정보 > 시트 이름)
    var info = parseSummaryHeader(aoa);
    // 「경유 주입량」처럼 열 이름에 연료가 들어 있으면 연료 종류 칸이 비어도 그 연료로 봅니다
    var qtyHead = opts.mapping && opts.mapping.fuel_qty ? String(opts.mapping.fuel_qty) : '';
    var headFuel = /경유|디젤|diesel/i.test(qtyHead) ? '경유' : /lpg|가스/i.test(qtyHead) ? 'LPG' : '';
    var rows = [], skipped = 0;
    for (var r = opts.headerRow + 1; r < aoa.length; r++) {
      var line = aoa[r] || [];
      var empty = !line.some(function (c) { return c != null && String(c).trim() !== ''; });
      if (empty) { skipped++; continue; }
      var src = {};
      Object.keys(idx).forEach(function (k) { src[k] = line[idx[k]]; });
      var row = normalizeRow(src);
      if (!row.model && info) { row.model = info.model; if (!row.unit_no) row.unit_no = info.unit_no; }
      if (!row.model && fallbackModel) row.model = String(fallbackModel).trim();
      if (!row.fuel_type && row.fuel_qty != null && headFuel) row.fuel_type = headFuel;
      row._src = (opts.fileName || '') + (opts.sheetName ? ' / ' + opts.sheetName : '') + ' ' + (r + 1) + '행';
      rows.push(row);
    }
    return { rows: rows, skipped: skipped };
  }

  // 주/야/휴 순서(같은 날 주간 다음 야간). 휴일은 보통 따로 잡히는 날이라 맨 뒤.
  var SHIFT_ORDER = { '주': 1, '야': 2, '휴': 3 };
  var SHIFTS = [{ key: '주', label: '주간' }, { key: '야', label: '야간' }, { key: '휴', label: '휴일' }];
  function shiftRank(s) { return SHIFT_ORDER[s] || 0; }
  // 일지를 일자 → 주/야/휴 순으로(원래 순서는 건드리지 않고 새 배열)
  function sortLogs(rows) {
    return rows.slice().sort(function (a, b) {
      var da = a.date || '', dbb = b.date || '';
      if (da !== dbb) return da < dbb ? -1 : 1;
      return shiftRank(a.shift) - shiftRank(b.shift);
    });
  }

  // ── 입력값 검사 ──────────────────────────────────────────────
  // 결과: [{ id, level: 'error'|'warn', field, code, msg }]
  function unitKey(row) { return (row.model || '') + '|' + (row.unit_no || ''); }
  // opts.holidays: 공휴일 목록 map — 휴일 근무 검사(토요일 주간만 계약상 휴일 근무)에 씁니다. 없으면 토·일만 봅니다.
  function validateRows(rows, opts) {
    var hol = (opts && opts.holidays) || {};
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
      STD_FIELDS.filter(function (f) { return f.type === 'number' || f.type === 'hours'; }).map(function (f) { return f.key; }).forEach(function (k) {
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
      if (row.shift && !SHIFT_ORDER[row.shift]) add(row, 'warn', 'shift', 'unknown_shift', '주/야/휴 칸의 「' + row.shift + '」 를 알아보지 못했습니다 — 기성 과급 계산에서 주간으로 봅니다');
      holidayWorkIssues(row, hol).forEach(function (i) { add(row, 'warn', 'shift', i.code, i.msg); });
      if (row.dow) { var dwc = dateWeekdayCheck(row.date, row.dow); if (dwc.mismatch) add(row, 'warn', 'date', 'dow_mismatch', dwc.msg); }
      if (row.fuel_won > 0 && row.fuel_type === 'LPG') add(row, 'warn', 'fuel_won', 'won_on_lpg', 'LPG 일지에 경유 결제 금액이 있습니다 — LPG 는 사용량만 적고 기성처리 때 월 평균 단가로 계산합니다');
      if (row.provisional) add(row, 'warn', 'run_hours', 'provisional', '마감 전 가입력(예상치)입니다 — 가동 후 확정 값으로 다시 저장해 주세요');
      if (Array.isArray(row.checks) && row.checks.some(function (c) { return c === '유'; }) && !row.issue) {
        add(row, 'warn', 'issue', 'check_without_issue', '일일 점검항목에 「유」가 있는데 문제점/조치내용이 비어 있습니다');
      }
      ['cycle_h', 'battery_check_h', 'inspect_h', 'special_h', 'heater_h', 'ac_h', 'charge_h'].forEach(function (k) {
        if (row[k] != null && row[k] > LIMITS.dayHours) add(row, 'error', k, 'range', FIELD[k].label + ' 이(가) ' + LIMITS.dayHours + '시간을 넘습니다');
      });
      if (row.date && row.model) {
        // 주간·야간 일지는 같은 날 두 장이 정상이므로 주/야/휴까지 같아야 중복으로 봅니다
        var dk = row.date + '|' + (row.shift || '') + '|' + unitKey(row);
        if (seen[dk]) add(row, 'warn', 'date', 'duplicate', '같은 일자·주/야·모델·호기 일지가 이미 있습니다');
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
      var list = sortLogs(groups[k]);
      var prevEnd = null, prevDate = '', prevShift = '';
      list.forEach(function (row) {
        var cur = row.hour_start != null ? row.hour_start : row.hour_end;
        // 같은 날이라도 주/야가 적혀 있어 앞뒤를 알 수 있으면 비교합니다(주간 → 야간)
        var comparable = row.date !== prevDate || (row.shift && prevShift && row.shift !== prevShift);
        if (cur != null && prevEnd != null && comparable && cur < prevEnd - LIMITS.meterTolerance) {
          add(row, 'error', row.hour_start != null ? 'hour_start' : 'hour_end', 'meter_backwards',
            '누적 아워미터가 전 일지(' + prevDate + (prevShift ? ' ' + prevShift : '') + ', ' + prevEnd + 'h)보다 줄었습니다');
        }
        var end = row.hour_end != null ? row.hour_end : null;
        if (end != null) { prevEnd = end; prevDate = row.date; prevShift = row.shift || ''; }
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
      fuel_qty: '경유 L · LPG kg 주입량(주입한 날만)', issue: '문제점 문장 그대로', photo: '사진 파일명이나 보관 위치',
      shift: '주 / 야 / 휴 (주간·야간·휴일도 됩니다)', weather: '맑음·흐림·비 등', charge_h: 'TPR 「금일충전시간」',
      cycle_h: 'TPR 「기본/요철 사이클」 시간', basic_cycles: '기본 사이클 회수', bump_cycles: '요철 사이클 회수',
      battery_check_h: 'TPR 「배터리 충전 점검」 시간', inspect_h: 'TPR 「장비 점검/TPR 작성」 시간', special_h: '특화 시험(동력전달 특화 등)·장비수리 시간 — 정리 엑셀 「특회 장비 수리」 칸',
      heater_h: '히터 가동 시간', ac_h: '에어컨 가동 시간', urea_l: '요소수 주입량(L)'
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

  // ══ 2026-09-29 실제 양식 기준 추가 ═════════════════════════════
  // 수강생이 보낸 양식 4종(TPR 일지, 시험일지 정리 엑셀, 기성 청구서 2종)의 구조를 옮긴 부분입니다.
  // 사진 원본은 실명·서명이 있어 리포에 넣지 않았고, 칸 이름과 계산 규칙만 가져왔습니다.

  // 숫자를 천 단위 쉼표로(메일·엑셀 문구용). toLocaleString 은 환경마다 달라 직접 만듭니다.
  function fmtNum(n, digits) {
    if (n == null || n === '' || !isFinite(n)) return '';
    var d = digits == null ? 1 : digits;
    var f = Math.pow(10, d);
    var v = Math.round((Math.abs(n) + 1e-9) * f) / f;
    var parts = v.toFixed(d).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 && v !== 0 ? '-' : '') + parts.join('.');
  }
  function r4(x) { return Math.round((x + (x >= 0 ? 1e-12 : -1e-12)) * 10000) / 10000; }
  function addDays(date, n) {
    var p = String(date).split('-');
    return toDateStr(new Date(+p[0], +p[1] - 1, +p[2] + n));
  }
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function weekdayKo(date) {
    if (!date) return '';
    var p = String(date).split('-');
    return WEEKDAYS[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
  }
  // 지난달 1일 ~ 말일(기성 기간 기본값)
  function prevMonthRange(today) {
    var p = String(today).split('-');
    var first = new Date(+p[0], +p[1] - 2, 1);
    var last = new Date(+p[0], +p[1] - 1, 0);
    return { from: toDateStr(first), to: toDateStr(last) };
  }
  // 주간 보고 기준일 기본값: 오늘을 포함한 가장 최근 수요일(매주 수요일 송부)
  function lastWednesday(today) {
    var p = String(today).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() - ((d.getDay() - 3 + 7) % 7));
    return toDateStr(d);
  }
  // 문제점 즉시 알림(수시): 문제점이 생기면 사진과 함께 설계 담당자·직책자에게 바로 보내는 메일
  function issueAlertMail(row, opt) {
    opt = opt || {};
    var label = modelLabel(row.model, row.unit_no);
    var probs = (row.problems && row.problems.length) ? row.problems : (row.issue ? [{ text: row.issue, note: '' }] : []);
    var first = probs.length ? probs[0].text : '';
    var subject = '[내구시험 문제점] ' + label + ' ' + (row.date || '') + (row.shift ? '(' + row.shift + ')' : '') + (first ? ' — ' + (first.length > 30 ? first.slice(0, 30) + '…' : first) : '');
    var b = [opt.greeting || '안녕하세요. 내구시험 중 문제점이 발생해 알려 드립니다.', '',
      '■ 모델/호기: ' + label,
      '■ 발생: ' + (row.date || '') + (row.date ? '(' + weekdayKo(row.date) + ')' : '') + (row.shift ? ' ' + shiftLabel(row.shift) : ''),
      '■ 운전자: ' + (row.driver || '-')];
    if (opt.cum != null) b.push('■ 누적 가동시간: ' + fmtNum(opt.cum) + 'h' + (opt.target > 0 ? ' / 목표 ' + fmtNum(opt.target) + 'h' : ''));
    if (row.hour_end != null) b.push('■ Hour Meter: ' + fmtNum(row.hour_end) + 'h');
    b.push('', '1. 문제점 / 조치내용');
    if (!probs.length) b.push('   - (적힌 내용 없음)');
    probs.forEach(function (p, i) { b.push('   ' + (i + 1) + ') ' + p.text + (p.note ? ' (비고: ' + p.note + ')' : '')); });
    var yes = (row.checks || []).map(function (c, i) { return c === '유' ? '   - ' + '①②③④⑤'.charAt(i) + ' ' + CHECK_ITEMS[i] : null; }).filter(Boolean);
    if (yes.length) b.push('', '2. 일일 점검 항목 「유」'); b = b.concat(yes);
    b.push('', '첨부: 현장 사진' + (row.photo ? ' (' + row.photo + ')' : ''), '', '원인 분석 부탁드립니다.', '', opt.sign || '감사합니다.');
    return { subject: subject, body: b.join('\n') };
  }
  function modelLabel(model, unit) { return (model || '') + (unit ? ' ' + unit : ''); }

  // ── TPR 일지(내구시험일지 및 문제점 보고서) ──────────────────
  // 일일 주요 점검 항목 ①~⑤ — 양식에 인쇄된 문구 그대로
  var CHECK_ITEMS = [
    '성능 이상(배터리팩, 전장품, 모드별 작업속도, 주행속도, 히터, 냉각) 발생 여부',
    '유압/동력전달/마스트 리프트 실린더 배관부 누유, 누기, 성능 저하 발생 여부',
    '주요 회전부 및 배터리팩 이음/진동 및 체결부 풀림, 파손 발생 여부',
    '작업장치 용접부 파손, 핀/부쉬/언더캐리지 마멸, 유격, 이탈 발생 여부',
    '상부 의장품의 파손/변형/간섭/풀림/이음/진동 발생 여부'
  ];
  // 배터리 상태표기(시작 및 종료) 구간 — 양식의 기본 칸. 모델·시험마다 바꿔 적을 수 있습니다.
  var BATTERY_SEGMENTS = ['기본/요철 (2hr)', '기본/요철 (1hr 50분)', '지게차 충전(점심)', '기본/요철 (2hr)', '기본/요철 (1hr 50분)', '기본/요철 (50분)', '배터리 충전 점검'];
  // TPR 일지에만 있는 값(표준 열 밖) — 행을 고쳐도 지워지지 않게 이 목록으로 옮겨 담습니다
  var EXTRA_KEYS = ['battery', 'problems', 'checks', 'coop', 'improve', 'wheel_nut', 'lpg_bottles', '_tpr', 'provisional', 'estimate', 'confirmed_at', 'dow'];

  function normCheck(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (/^(유|有|y|yes|o|true|있음|이상있음)$/.test(s)) return '유';
    if (/^(무|無|n|no|x|false|없음|이상없음)$/.test(s)) return '무';
    return '';
  }
  function normBool(v) {
    if (typeof v === 'boolean') return v;
    return /^(true|y|yes|o|확인|유|1|v|✓)$/i.test(String(v == null ? '' : v).trim());
  }
  // 입력 화면(또는 AI 답)의 값 묶음 → 저장할 행. 표준 열은 normalizeRow 로, 나머지는 EXTRA_KEYS 로.
  // opts.bottleKg: LPG 통 수만 적었을 때 kg 으로 바꾸는 통당 무게(기본 15kg — 청구서 930kg=62통에서 역산, 확인 필요)
  function tprToRow(form, opts) {
    opts = opts || {};
    var src = {};
    STD_FIELDS.forEach(function (f) { if (form[f.key] !== undefined) src[f.key] = form[f.key]; });
    var row = normalizeRow(src);
    var problems = (form.problems || []).map(function (p) {
      return { text: String(p && p.text != null ? p.text : p || '').trim(), note: String(p && p.note != null ? p.note : '').trim() };
    }).filter(function (p) { return p.text || p.note; });
    var battery = (form.battery || []).map(function (b) {
      return { label: String(b.label == null ? '' : b.label).trim(), start: parseNum(b.start), end: parseNum(b.end) };
    }).filter(function (b) { return b.start != null || b.end != null; });
    var checks = CHECK_ITEMS.map(function (_, i) { return normCheck((form.checks || [])[i]); });
    row.problems = problems;
    row.battery = battery;
    row.checks = checks;
    row.coop = String(form.coop == null ? '' : form.coop).trim();
    row.improve = String(form.improve == null ? '' : form.improve).trim();
    row.wheel_nut = normBool(form.wheel_nut);
    row.lpg_bottles = parseNum(form.lpg_bottles);
    row.dow = normDow(form.dow);
    row._tpr = true;
    // LPG 를 통 수로만 적었으면 kg 으로 채웁니다
    if (row.fuel_qty == null && row.lpg_bottles > 0 && row.fuel_type === 'LPG') {
      row.fuel_qty = r2(row.lpg_bottles * (opts.bottleKg || 15));
    }
    // 문제점 칸이 여러 줄이면 한 문장으로 이어 「문제점」 열에 넣습니다(정리표·대시보드가 이 열을 씁니다)
    if (problems.length) {
      row.issue = problems.map(function (p, i) {
        return (problems.length > 1 ? (i + 1) + ') ' : '') + p.text + (p.note ? ' (' + p.note + ')' : '');
      }).join(' / ');
    }
    return row;
  }
  // 저장된 행 → 입력 화면 값(고치기용)
  function rowToTpr(row) {
    var f = {};
    STD_FIELDS.forEach(function (fd) {
      var v = row[fd.key];
      if (v == null && row._raw && row._raw[fd.key] != null) v = row._raw[fd.key];
      f[fd.key] = v == null ? '' : v;
    });
    f.problems = (row.problems && row.problems.length) ? row.problems.map(function (p) { return { text: p.text, note: p.note }; })
      : (row.issue ? [{ text: row.issue, note: '' }] : []);
    f.battery = BATTERY_SEGMENTS.map(function (label, i) {
      var b = (row.battery || [])[i];
      return b ? { label: fixSegLabel(b.label || label), start: b.start == null ? '' : b.start, end: b.end == null ? '' : b.end } : { label: label, start: '', end: '' };
    });
    (row.battery || []).slice(BATTERY_SEGMENTS.length).forEach(function (b) { f.battery.push({ label: fixSegLabel(b.label), start: b.start == null ? '' : b.start, end: b.end == null ? '' : b.end }); });
    f.checks = CHECK_ITEMS.map(function (_, i) { return (row.checks || [])[i] || ''; });
    f.coop = row.coop || '';
    f.improve = row.improve || '';
    f.wheel_nut = !!row.wheel_nut;
    f.lpg_bottles = row.lpg_bottles == null ? '' : row.lpg_bottles;
    f.provisional = !!row.provisional;
    f.dow = row.dow || '';
    return f;
  }
  // 09-30 수강생 지적 「지게차 충전(정심) → 지게차 충전(점심)」 — 이미 저장된 일지의 구간 이름도 고쳐 보여 줍니다
  function fixSegLabel(label) { return String(label == null ? '' : label).replace('지게차 충전(정심)', '지게차 충전(점심)'); }
  // 배터리 소모 합계: 시작 > 종료 인 구간(방전)의 차이를 더합니다. 충전 구간(종료가 더 큼)은 뺍니다.
  function batteryUse(battery) {
    var use = 0, charge = 0;
    (battery || []).forEach(function (b) {
      if (b.start == null || b.end == null) return;
      if (b.start > b.end) use += b.start - b.end; else charge += b.end - b.start;
    });
    return { use: r2(use), charge: r2(charge) };
  }

  // AI 로 사진 옮겨 적기(반자동) — ChatGPT 등에 사진과 함께 붙여 넣을 요청문
  function tprPrompt() {
    return [
      '첨부한 사진은 지게차 내구시험 「내구시험일지 및 문제점 보고서(TPR)」 한 장이야.',
      '손글씨를 읽어서 아래 JSON 형식 그대로만 답해줘. 설명 문장은 쓰지 말고 JSON 하나만 보내줘.',
      '읽을 수 없거나 빈 칸은 "" 로 두고, 숫자는 단위(h, 회, %) 없이 숫자만 적어줘.',
      '작성자 이름은 적지 말고 driver 는 "" 로 둬줘(개인정보라 사람이 직접 적습니다).',
      '작성일은 옆에 적힌 요일과 맞는지 달력으로 확인해줘. 맞지 않으면(예: 1/3 을 1/30 으로 읽음) 요일에 맞는 날짜로 다시 읽어줘.',
      '',
      '{',
      '  "date": "YYYY-MM-DD (작성일)",',
      '  "dow": "작성일 옆에 적힌 요일 한 글자 (월·화·수·목·금·토·일)",',
      '  "shift": "주 또는 야 또는 휴 (동그라미 친 것)",',
      '  "weather": "날씨",',
      '  "model": "모델명 (예: MODEL-X)",',
      '  "unit_no": "호기 (예: #4)",',
      '  "charge_h": "금일충전시간",',
      '  "run_hours": "금일가동시간",',
      '  "hour_start": "Hour Meter 전일",',
      '  "hour_end": "Hour Meter 금일",',
      '  "cycle_h": "기본/요철 사이클 시간(h)",',
      '  "basic_cycles": "기본 사이클 회수",',
      '  "bump_cycles": "요철 사이클 회수",',
      '  "battery_check_h": "배터리 충전 점검 시간(h)",',
      '  "inspect_h": "장비 점검/TPR 작성 시간(h)",',
      '  "ac_h": "에어컨 가동(h)",',
      '  "heater_h": "히터 가동(h)",',
      '  "wheel_nut": "휠너트 풀림 확인 칸에 표시가 있으면 true, 없으면 false",',
      '  "battery": [ { "label": "구간 이름", "start": "시작 %", "end": "종료 %" } ],',
      '  "problems": [ { "text": "금일 발생 문제점/조치내용", "note": "비고" } ],',
      '  "checks": ["①~⑤ 점검 결과를 차례로 유 또는 무"],',
      '  "coop": "협조·지원·미결 사항",',
      '  "improve": "개선/건의사항"',
      '}'
    ].join('\n');
  }
  // 외부 AI 에 올리는 TPR 은 하루 1~2장까지(수강생 답 09-29 오후 늦게):
  // 「한 두 장은 문제 안 되는데 여러 장은 개발모델의 자료라 대외비」. 기본은 외부 전송 없이 사진 옆에 띄워 옮겨 적기이고,
  // AI 반자동은 사용자가 1~2장임을 확인하고 켤 때만 요청문을 복사할 수 있습니다. log = { 'YYYY-MM-DD': 장 수 }
  var AI_PAGE_LIMIT = 2;
  function aiPageAllowance(log, today) {
    var used = (log && +log[today]) || 0;
    return { used: used, left: Math.max(0, AI_PAGE_LIMIT - used), ok: used < AI_PAGE_LIMIT, limit: AI_PAGE_LIMIT };
  }
  function recordAiPage(log, today) {
    var out = {};
    out[today] = ((log && +log[today]) || 0) + 1; // 지난 날짜 기록은 남기지 않습니다(하루 단위 제한)
    return out;
  }
  // AI 답(JSON)을 입력 화면 값으로. 코드 블록(```)이나 앞뒤 문장이 섞여 있어도 { … } 만 꺼냅니다.
  function tprFromAi(textIn) {
    var s = String(textIn == null ? '' : textIn);
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return { ok: false, error: 'JSON({ … })을 찾지 못했습니다' };
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { ok: false, error: 'JSON 을 읽지 못했습니다: ' + e.message }; }
    var form = {}, warnings = [];
    STD_FIELDS.forEach(function (f) { if (obj[f.key] != null && typeof obj[f.key] !== 'object') form[f.key] = obj[f.key]; });
    if (obj.driver) { warnings.push('AI 답에 작성자 이름이 있어 비웠습니다. 운전자 코드를 직접 적어 주세요.'); form.driver = ''; }
    if (form.date && !parseDate(form.date)) warnings.push('작성일 「' + form.date + '」 을 날짜로 읽지 못했습니다');
    form.battery = Array.isArray(obj.battery) ? obj.battery.map(function (x) { return { label: x.label || '', start: x.start == null ? '' : x.start, end: x.end == null ? '' : x.end }; }) : [];
    form.problems = Array.isArray(obj.problems) ? obj.problems.map(function (x) { return typeof x === 'string' ? { text: x, note: '' } : { text: x.text || '', note: x.note || '' }; }) : [];
    form.checks = Array.isArray(obj.checks) ? obj.checks.slice(0, CHECK_ITEMS.length) : [];
    form.coop = obj.coop || '';
    form.improve = obj.improve || '';
    form.wheel_nut = normBool(obj.wheel_nut);
    form.dow = obj.dow == null ? '' : String(obj.dow);
    var dc = dateWeekdayCheck(form.date, form.dow);
    if (dc.mismatch) warnings.push(dc.msg);
    ['run_hours', 'hour_start', 'hour_end'].forEach(function (k) {
      if (form[k] !== undefined && form[k] !== '' && parseHours(form[k]) == null) warnings.push(FIELD[k].label + ' 「' + form[k] + '」 을 숫자로 읽지 못했습니다');
    });
    return { ok: true, form: form, warnings: warnings };
  }

  // ── 손글씨 날짜 ↔ 요일 대조 (수강생 제안 09-29: 「날짜를 1/3인데 1/30일로 인식 --> 요일도 적혀있는데 같이 병행하면」) ──
  // TPR 작성일 옆에는 요일이 적혀 있어, 날짜 숫자를 잘못 읽으면 요일이 맞지 않습니다.
  // 맞지 않으면 숫자를 잘못 읽었을 법한 날(한 자리 빠짐·더해짐·자리 바뀜) 가운데 요일이 맞는 날을 후보로 냅니다.
  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var DOW_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function normDow(v) {
    var s = String(v == null ? '' : v).replace(/요일/g, '').replace(/[()\s（）]/g, '').toLowerCase();
    if (!s) return '';
    var i = DOW_KO.indexOf(s.charAt(0));
    if (i < 0) i = DOW_EN.indexOf(s.slice(0, 3));
    return i < 0 ? '' : DOW_KO[i];
  }
  // opt.near: 이 날짜와 가까운 후보를 앞에(예: 같은 모델의 전 일지 다음 날)
  function dateWeekdayCheck(date, dowText, opt) {
    opt = opt || {};
    var d = parseDate(date), w = normDow(dowText);
    if (!d || !w) return { mismatch: false, date: d, written: w, actual: d ? weekdayKo(d) : '', candidates: [] };
    var actual = weekdayKo(d);
    if (actual === w) return { mismatch: false, date: d, written: w, actual: actual, candidates: [] };
    var p = d.split('-'), y = +p[0], m = +p[1], day = String(+p[2]);
    var vars = {};
    function add(x) { var n = +x; if (x !== '' && n >= 1 && n <= 31) vars[n] = true; }
    if (day.length === 2) { add(day.charAt(0)); add(day.charAt(1)); add(day.charAt(1) + day.charAt(0)); }
    else { add(day + '0'); ['1', '2', '3'].forEach(function (a) { add(a + day); }); }
    // 한 자리를 비슷한 숫자로 잘못 읽은 경우(1↔7, 3↔8, 5↔6, 0↔6·8·9)
    var LOOK = { '1': '7', '7': '1', '3': '8', '8': '30', '5': '6', '6': '50', '0': '689', '9': '0' };
    day.split('').forEach(function (ch, i) {
      (LOOK[ch] || '').split('').forEach(function (r) { add(day.slice(0, i) + r + day.slice(i + 1)); });
    });
    var cands = Object.keys(vars).map(function (n) { return validYmd(y, m, +n) ? ymd(y, m, +n) : null; })
      .filter(function (c) { return c && c !== d && weekdayKo(c) === w; });
    var ref = parseDate(opt.near) || d;
    function dist(c) { return Math.abs(new Date(c) - new Date(ref)); }
    cands.sort(function (a, b) { return dist(a) - dist(b) || (a < b ? -1 : 1); });
    return { mismatch: true, date: d, written: w, actual: actual, candidates: cands,
      msg: '작성일 ' + d.slice(5).replace('-', '/') + '은 ' + actual + '요일인데 일지에는 「' + w + '」요일로 적혀 있습니다' +
        (cands.length ? ' — 요일이 맞는 날: ' + cands.map(function (c) { return c.slice(5).replace('-', '/'); }).join(', ') : ' — 날짜 숫자를 다시 확인해 주세요') };
  }

  // ── 모델 정보(시험일지 정리 엑셀 머리 부분) ─────────────────
  // { model, unit_no, initialHour, targetHours, pg, project, fuel }
  function masterKey(model, unit) { return (model || '') + '|' + (unit || ''); }
  // 목표 가동시간 기본값(수강생 답 09-29 오후): 보통 1000시간, 특화해서 더 할 때 +500시간 = 1500시간
  var TARGET_BASE = 1000, TARGET_EXTRA = 500;
  function normMaster(m) {
    m = m || {};
    var t = parseNum(m.targetHours);
    var extended = m.extended === true || m.extended === 'true';
    return {
      model: String(m.model == null ? '' : m.model).trim(),
      unit_no: String(m.unit_no == null ? '' : m.unit_no).trim(),
      initialHour: parseNum(m.initialHour),
      // 직접 적은 목표가 있으면 그 값, 없으면 1000h(특화 +500h 표시 시 1500h)
      targetHours: t != null ? t : TARGET_BASE + (extended ? TARGET_EXTRA : 0),
      targetDefault: t == null,
      extended: extended,
      pg: String(m.pg == null ? '' : m.pg).trim(),
      project: String(m.project == null ? '' : m.project).trim(),
      fuel: m.fuel ? normFuel(m.fuel) : ''
    };
  }
  // 일지에 나오는 모델·호기와 등록된 모델 정보를 합친 목록(이름순)
  function unitList(rows, masters) {
    var map = {};
    Object.keys(masters || {}).forEach(function (k) { var m = normMaster(masters[k]); if (m.model) map[masterKey(m.model, m.unit_no)] = m; });
    rows.forEach(function (r) {
      if (!r.model) return;
      var k = masterKey(r.model, r.unit_no);
      if (!map[k]) map[k] = normMaster({ model: r.model, unit_no: r.unit_no, fuel: r.fuel_type && r.fuel_type !== ELECTRIC ? r.fuel_type : '' });
      if (!map[k].fuel && r.fuel_type) map[k].fuel = r.fuel_type;
    });
    return Object.keys(map).sort().map(function (k) { var m = map[k]; m.key = k; m.label = modelLabel(m.model, m.unit_no); return m; });
  }
  function rowsOfUnit(rows, key) { return rows.filter(function (r) { return r.model && masterKey(r.model, r.unit_no) === key; }); }
  // 정리 엑셀 위쪽 머리 부분에서 모델명/호기·초기 아워미터·목표 가동시간·PG 정보를 읽습니다.
  // 「MODEL-Y/#1」처럼 모델과 호기가 한 칸이면 / 또는 # 앞에서 나눕니다.
  function parseSummaryHeader(aoa) {
    var info = {};
    var labels = { '모델명호기': 'model', '모델명': 'model', '초기아워미터': 'initialHour', '목표가동시간': 'targetHours', 'pg정보': 'pg', '과제번호': 'project' };
    for (var r = 0; r < Math.min(5, aoa.length); r++) {
      var line = aoa[r] || [];
      for (var c = 0; c < line.length; c++) {
        var k = labels[squash(line[c])];
        if (!k || info[k] != null) continue;
        for (var c2 = c + 1; c2 < line.length; c2++) {
          var v = line[c2];
          if (v != null && String(v).trim() !== '') { info[k] = v; break; }
        }
      }
    }
    if (info.model == null) return null;
    var name = String(info.model).replace(/\s+/g, ' ').trim();
    // 「MODEL-Y/#1」「모델/1호기」「MODEL-X #4」「모델 1호기」
    var m = name.match(/^(.*\S)\s*\/\s*([^\/]+)$/) || name.match(/^(.*?)\s*(#\s*\d+\S*)$/) || name.match(/^(.*\S)\s+(\d+\s*호기)$/);
    var out = normMaster({ model: m ? m[1] : name, unit_no: m ? m[2].replace(/\s/g, '') : '', initialHour: info.initialHour, targetHours: info.targetHours, pg: info.pg, project: info.project });
    return out.model ? out : null;
  }

  // ── 시험일지 정리표(모델별 누적) ─────────────────────────────
  // 일자·주/야/휴 순으로 늘어놓고 누적 가동시간과 누적 아워미터(초기 아워미터 + 누적 가동시간)를 계산합니다.
  // 청구서의 「금월」과 같게 하려고 가동시간이 0 인 날(입고 점검 등)도 행은 남깁니다.
  function unitSummary(rows, master, opt) {
    opt = opt || {};
    master = normMaster(master);
    var key = masterKey(master.model, master.unit_no);
    var list = sortLogs(rowsOfUnit(rows, key).filter(function (r) { return r.date && (!opt.to || r.date <= opt.to); }));
    var cum = 0;
    var t = { hours: 0, basic: 0, bump: 0, inspect: 0, special: 0, heater: 0, ac: 0, fuel: {}, urea: 0, issues: 0, logs: 0 };
    FUELS.forEach(function (f) { t.fuel[f.key] = 0; });
    var lines = list.map(function (r) {
      var h = effectiveHours(r);
      cum = r2(cum + (h > 0 ? h : 0));
      var fuel = r.fuel_type || master.fuel;
      t.logs++;
      t.hours = cum;
      t.basic = r2(t.basic + (r.basic_cycles || 0));
      t.bump = r2(t.bump + (r.bump_cycles || 0));
      t.inspect = r2(t.inspect + (r.inspect_h || 0));
      t.special = r2(t.special + (r.special_h || 0) + (r.battery_check_h || 0));
      t.heater = r2(t.heater + (r.heater_h || 0));
      t.ac = r2(t.ac + (r.ac_h || 0));
      if (r.fuel_qty > 0 && t.fuel[fuel] != null) t.fuel[fuel] = r2(t.fuel[fuel] + r.fuel_qty);
      if (r.urea_l > 0) t.urea = r2(t.urea + r.urea_l);
      if (r.issue) t.issues++;
      return {
        id: r.id, date: r.date, shift: r.shift || '', hours: h, cycle_h: r.cycle_h, cum: cum,
        meter: master.initialHour != null ? r2(master.initialHour + cum) : null,
        hour_end: r.hour_end, basic: r.basic_cycles, bump: r.bump_cycles, inspect: r.inspect_h,
        special: (r.special_h != null || r.battery_check_h != null) ? r2((r.special_h || 0) + (r.battery_check_h || 0)) : null,
        heater: r.heater_h, ac: r.ac_h, fuel: fuel, fuel_qty: r.fuel_qty, urea: r.urea_l,
        weather: r.weather || '', driver: r.driver || '', issue: r.issue || ''
      };
    });
    var target = master.targetHours;
    return {
      master: master, key: key, label: modelLabel(master.model, master.unit_no), lines: lines, totals: t,
      asOf: lines.length ? lines[lines.length - 1].date : '',
      ratio: target > 0 ? t.hours / target : null,
      meter: master.initialHour != null ? r2(master.initialHour + t.hours) : null
    };
  }
  function pct(x, d) { return x == null ? '' : fmtNum(x * 100, d == null ? 1 : d) + '%'; }
  function fuelUnit(fuel) { return fuel === 'LPG' ? 'kg' : 'L'; }
  // 연료비 청구 품목: 경유·LPG + 요소수
  var UREA = '요소수';
  var BILL_ITEMS = ['경유', 'LPG', UREA];
  // 정리표 엑셀: 위 4줄 머리 + 6번째 줄 열 이름 + 일자별 행 (수강생 엑셀 배치를 따름)
  function summarySheet(sum) {
    var m = sum.master, t = sum.totals;
    var fuel = m.fuel && m.fuel !== ELECTRIC ? m.fuel : '경유';
    var aoa = [
      ['모델명/호기', m.model + (m.unit_no ? '/' + m.unit_no : ''), (sum.asOf ? sum.asOf.slice(5) : '') + ' 기준', '누적 가동시간(h)', t.hours],
      ['초기 아워미터(h)', m.initialHour == null ? '' : m.initialHour, '누적 Ratio', sum.ratio == null ? '' : Math.round(sum.ratio * 1000) / 10 + '%', '누적 아워미터(h)', sum.meter == null ? '' : sum.meter],
      ['목표 가동시간(h)', m.targetHours == null ? '' : m.targetHours, '남은 시간(h)', m.targetHours > 0 ? r2(Math.max(0, m.targetHours - t.hours)) : '', fuel + ' 합계(' + fuelUnit(fuel) + ')', t.fuel[fuel] || 0, '요소수 합계(L)', t.urea],
      ['PG 정보', m.pg, '과제번호', m.project, '기본 사이클 합계(회)', t.basic, '요철 사이클 합계(회)', t.bump],
      [],
      ['Date', '주/야/휴', '일 가동시간', '기본/요철 사이클', '누적 가동시간', '누적 아워미터', '기본 사이클', '요철 사이클', '장비 점검 및 TPR 작성',
        '특회 장비 수리', '히터가동시간', '에어컨가동 시간', fuel === 'LPG' ? 'LPG 사용량(kg)' : '경유 주입량', '요소수 주입량', '날씨', '운전자 Code', '문제점 / 조치내용']
    ];
    function v(x) { return x == null ? '' : x; }
    sum.lines.forEach(function (l) {
      aoa.push([l.date, l.shift, v(l.hours), v(l.cycle_h), l.cum, v(l.meter), v(l.basic), v(l.bump), v(l.inspect), v(l.special), v(l.heater), v(l.ac),
        l.fuel === fuel ? v(l.fuel_qty) : '', v(l.urea), l.weather, l.driver, l.issue]);
    });
    return aoa;
  }

  // ── 주간 현황(설계담당자 메일) ──────────────────────────────
  // asOf 까지의 누적 가동시간 / 목표, 최근 days 일(기본 7일)의 가동시간과 문제점
  function weeklyReport(rows, masters, asOf, days) {
    days = days || 7;
    var from = addDays(asOf, -(days - 1));
    var units = unitList(rows, masters);
    var list = units.map(function (u) {
      var mine = rowsOfUnit(rows, u.key).filter(function (r) { return r.date && r.date <= asOf; });
      var cum = 0, week = 0, last = '', total = 0, weekIssues = [], weekLogs = 0;
      sortLogs(mine).forEach(function (r) {
        var h = effectiveHours(r);
        if (h > 0) cum = r2(cum + h);
        if (r.date >= from) {
          weekLogs++;
          if (h > 0) week = r2(week + h);
          if (r.issue) weekIssues.push({ id: r.id, date: r.date, shift: r.shift || '', driver: r.driver || '', text: r.issue });
        }
        if (r.issue) total++;
        if (r.date > last) last = r.date;
      });
      var target = u.targetHours;
      var remaining = target > 0 ? r2(Math.max(0, target - cum)) : null;
      // 예상 완료일: 최근 days 일의 하루 평균 가동시간으로 남은 시간을 나눕니다(달력 일수, 참고용)
      var eta = null;
      if (remaining > 0 && week > 0) eta = addDays(asOf, Math.ceil(remaining / (week / days)));
      return {
        key: u.key, label: u.label, model: u.model, unit_no: u.unit_no, cum: cum, target: target,
        ratio: target > 0 ? cum / target : null, remaining: remaining, done: target > 0 && cum >= target,
        weekHours: week, weekIssues: weekIssues, weekLogs: weekLogs, totalIssues: total, lastDate: last, eta: eta
      };
    }).filter(function (x) { return x.lastDate || x.target > 0; });
    return { asOf: asOf, from: from, days: days, models: list };
  }
  function shiftLabel(s) { return s === '주' ? '주간' : s === '야' ? '야간' : s === '휴' ? '휴일' : s || ''; }
  function weeklyMail(rep, opt) {
    opt = opt || {};
    // 수강생 답(09-29 오후): 매주 수요일 R&D 전체에 현황·문제점과 내구시험일지(PDF)를 보냄
    var subject = '[내구시험 현황] ' + rep.asOf + '(' + weekdayKo(rep.asOf) + ') 기준 주간 보고 (' + rep.from + ' ~ ' + rep.asOf + ')';
    var L1 = [
      (opt.greeting || '안녕하세요. 이번 주 내구시험 현황과 문제점을 보내 드립니다.'),
      '',
      '■ 기준일: ' + rep.asOf + ' / 집계 기간: ' + rep.from + ' ~ ' + rep.asOf + ' (' + rep.days + '일)',
      '',
      '1. 모델별 진행 현황 (현 시험시간 / 목표시간)'
    ];
    if (!rep.models.length) L1.push('   - 진행 중인 모델이 없습니다.');
    rep.models.forEach(function (m) {
      var s = '   - ' + m.label + ': ' + fmtNum(m.cum) + 'h / ' + (m.target > 0 ? fmtNum(m.target) + 'h (' + pct(m.ratio) + ')' : '목표 미입력');
      s += ' · 이번 주 +' + fmtNum(m.weekHours) + 'h';
      if (m.done) s += ' · 시험 종료(목표 도달)';
      else if (m.eta) s += ' · 예상 완료 ' + m.eta + '(참고)';
      L1.push(s);
    });
    L1.push('', '2. 모델별 문제점 현황 (이번 주)');
    var any = false;
    rep.models.forEach(function (m) {
      if (!m.weekIssues.length) return;
      any = true;
      L1.push('   [' + m.label + '] ' + m.weekIssues.length + '건 (시험 시작 후 누적 ' + m.totalIssues + '건)');
      m.weekIssues.forEach(function (i) { L1.push('     · ' + i.date.slice(5) + (i.shift ? '(' + i.shift + ')' : '') + ' ' + i.text); });
    });
    if (!any) L1.push('   - 이번 주 기록된 문제점이 없습니다.');
    var logs = rep.models.reduce(function (n, m) { return n + (m.weekLogs || 0); }, 0);
    L1.push('', '3. 첨부', '   - 진행 그래프(이미지)', '   - 내구시험일지(PDF) ' + logs + '장' +
      (logs ? ' — ' + rep.models.filter(function (m) { return m.weekLogs; }).map(function (m) { return m.label + ' ' + m.weekLogs + '장'; }).join(', ') : ''));
    L1.push('', '원인 분석이 필요한 항목은 회신 부탁드립니다.', '', opt.sign || '감사합니다.');
    return { subject: subject, body: L1.join('\n') };
  }
  function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // 진척 막대 그래프(SVG 문자열). 막대 = 현 시험시간 / 목표시간, 100% 에 목표선.
  // 목표가 없는 모델은 가장 긴 누적시간을 기준으로 길이만 비교합니다.
  function progressSvg(rep, opt) {
    opt = opt || {};
    var W = opt.width || 760, rowH = 44, top = 56, labelW = 170, valW = 190;
    var trackW = W - labelW - valW - 24;
    var H = top + Math.max(1, rep.models.length) * rowH + 20;
    var maxCum = rep.models.reduce(function (m, x) { return Math.max(m, x.cum); }, 0) || 1;
    var font = 'font-family="Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, sans-serif"';
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="pgTitle">',
      '<title id="pgTitle">모델별 내구시험 진행 (현 시험시간 / 목표시간), ' + escXml(rep.asOf) + ' 기준</title>',
      '<rect width="100%" height="100%" fill="#ffffff"/>',
      '<text x="12" y="26" ' + font + ' font-size="17" font-weight="700" fill="#1b2430">내구시험 진행 현황 (현 시험시간 / 목표시간)</text>',
      '<text x="12" y="45" ' + font + ' font-size="12" fill="#56616f">' + escXml(rep.asOf) + ' 기준 · 이번 주 ' + escXml(rep.from) + ' ~ ' + escXml(rep.asOf) + '</text>'];
    if (!rep.models.length) out.push('<text x="12" y="' + (top + 24) + '" ' + font + ' font-size="14" fill="#56616f">진행 중인 모델이 없습니다</text>');
    rep.models.forEach(function (m, i) {
      var y = top + i * rowH;
      var ratio = m.target > 0 ? Math.min(1, m.cum / m.target) : m.cum / maxCum;
      var fill = m.done ? '#1b6e3a' : m.target > 0 ? '#2f6fb8' : '#8a96a3';
      out.push('<text x="12" y="' + (y + 22) + '" ' + font + ' font-size="14" font-weight="600" fill="#1b2430">' + escXml(m.label) + '</text>');
      out.push('<rect x="' + labelW + '" y="' + (y + 8) + '" width="' + trackW + '" height="20" rx="4" fill="#e3e9f0"/>');
      out.push('<rect x="' + labelW + '" y="' + (y + 8) + '" width="' + Math.max(2, Math.round(trackW * ratio)) + '" height="20" rx="4" fill="' + fill + '"/>');
      if (m.target > 0) out.push('<line x1="' + (labelW + trackW) + '" x2="' + (labelW + trackW) + '" y1="' + (y + 4) + '" y2="' + (y + 32) + '" stroke="#1b2430" stroke-width="2"/>');
      var val = fmtNum(m.cum) + ' / ' + (m.target > 0 ? fmtNum(m.target) + 'h  ' + pct(m.ratio) : '목표 미입력');
      out.push('<text x="' + (labelW + trackW + 12) + '" y="' + (y + 23) + '" ' + font + ' font-size="13" fill="#1b2430">' + escXml(val) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  // ── 기성처리 ① 운전시간 정산(개발장비 내구시험 기성 청구서) ─────
  // 소계 = (금월 실가동 + TPR 작성 및 점검 + 특화시험) × (1 + 과급), 기성금액 = 소계 × 단가(원 단위 반올림).
  // 특화시험 = 배터리 충전 점검 + 특화 시험(동력전달 특화 등)·장비수리 — 수강생 답(09-29 오후)으로 확정.
  // 과급: 야간 19%, 휴일 30% — 계약서에 명기된 고정값(수강생 답). 화면에서 바꾸지 않습니다.
  var DEFAULT_SURCHARGE = { '주': 0, '야': 19, '휴': 30 };
  // opts.holidays: 공휴일 목록(parseHolidays 의 map). 과급 구분은 적힌 주/야/휴가 아니라 날짜로 정합니다(billShift).
  function hourBillingLines(rows, masters, from, to, opts) {
    var hol = (opts && opts.holidays) || {};
    var units = unitList(rows, masters);
    var out = [];
    units.forEach(function (u) {
      var mine = rowsOfUnit(rows, u.key).filter(function (r) { return r.date && r.date <= to; });
      var inPeriod = mine.filter(function (r) { return r.date >= from; });
      if (!inPeriod.length) return;
      var cum = mine.reduce(function (s, r) { var h = effectiveHours(r); return h > 0 ? r2(s + h) : s; }, 0);
      SHIFTS.forEach(function (sh) {
        var l = { key: u.key, label: u.label, project: u.project, shift: sh.key, cum: cum, month: 0, tpr: 0, special: 0 };
        inPeriod.forEach(function (r) {
          if (billShift(r, hol) !== sh.key) return;
          var h = effectiveHours(r);
          if (h > 0) l.month = r2(l.month + h);
          l.tpr = r2(l.tpr + (r.inspect_h || 0));
          l.special = r2(l.special + (r.battery_check_h || 0) + (r.special_h || 0));
        });
        out.push(l);
      });
    });
    return out;
  }
  // opts: { rate: 원/h, surcharge: { 주: %, 야: %, 휴: % } }
  function calcHourBilling(lines, opts) {
    opts = opts || {};
    var rate = parseNum(opts.rate);
    var sc = opts.surcharge || DEFAULT_SURCHARGE;
    var t = { month: 0, tpr: 0, special: 0, subtotal: 0, amount: 0 };
    var out = lines.map(function (l) {
      var p = parseNum(sc[l.shift]);
      if (p == null) p = DEFAULT_SURCHARGE[l.shift] || 0;
      var base = r2(l.month + l.tpr + l.special);
      var subtotal = r4(base * (100 + p) / 100);
      // 부동소수 오차를 줄이려고 퍼센트 정수로 곱한 뒤 한 번만 반올림합니다
      var amount = rate > 0 ? Math.round(r4(base * (100 + p) * rate / 100)) : null;
      t.month = r2(t.month + l.month); t.tpr = r2(t.tpr + l.tpr); t.special = r2(t.special + l.special);
      t.subtotal = r4(t.subtotal + subtotal);
      if (amount != null) t.amount += amount;
      return Object.assign({}, l, { surcharge: p, base: base, subtotal: subtotal, rate: rate, amount: amount });
    });
    return { lines: out, totals: t, missingRate: !(rate > 0) };
  }
  // 청구서 아래 「5. 내구시험 현황」
  function hourBillingStatus(rows, masters, from, to) {
    var inP = rows.filter(function (r) { return r.date && r.model && r.date >= from && r.date <= to; });
    var days = {}, drivers = {}, hours = 0;
    inP.forEach(function (r) {
      var h = effectiveHours(r);
      if (h > 0) { days[r.date] = true; hours = r2(hours + h); }
      if (r.driver) drivers[r.driver] = true;
    });
    var rep = weeklyReport(rows, masters, to, 1);
    var done = rep.models.filter(function (m) {
      // 이 기간 안에 목표에 도달한 모델
      if (!m.done) return false;
      var before = rowsOfUnit(rows, m.key).filter(function (r) { return r.date && r.date < from; })
        .reduce(function (s, r) { var h = effectiveHours(r); return h > 0 ? r2(s + h) : s; }, 0);
      return before < m.target;
    }).map(function (m) { return m.label; });
    return { days: Object.keys(days).length, drivers: Object.keys(drivers).length, hours: hours, done: done };
  }
  function dotDate(d) { return String(d || '').replace(/-/g, '.'); }
  function won(n) { return '₩' + fmtNum(n, 0); }
  function sheetName(s, used) {
    var n = String(s).replace(/[\[\]:*?\/\\]/g, '_').slice(0, 31) || '시트';
    var base = n, i = 2;
    while (used[n]) { n = (base.slice(0, 28) + '(' + i + ')'); i++; }
    used[n] = true;
    return n;
  }
  function approvalRow(appr) {
    return (appr && appr.length ? appr : ['파트장', '팀장', '부문장']);
  }
  // 운전시간 기성 청구서 엑셀. 반환: { 시트이름: { aoa, merges } } — 첫 시트가 청구서, 이어서 모델별 상세
  function hourBillingSheets(bill, meta, rows, masters) {
    meta = meta || {};
    var appr = approvalRow(meta.approvers);
    var t = bill.totals;
    var aoa = [
      ['■ 개발장비 내구시험 기성 청구서', '', '', '', '', '', '', '', '결재', appr[0] || '', appr[1] || '', appr[2] || ''],
      ['1. 업체 : ' + (meta.company || ''), '', '', '', '', '', '', '', '', '', '', ''],
      ['2. 기간 : ' + dotDate(meta.from) + ' ~ ' + dotDate(meta.to), '', '', '', '', '', '', '', '', '', '', ''],
      ['3. 기성금액 : ' + (bill.missingRate ? '(단가 미입력)' : won(t.amount)) + ' (VAT 별도)', '', '', '', '', '', '', '', '', '/', '/', '/'],
      ['4. 기성내역', '', '', '', '', '', '', '', '', '', '', meta.team || ''],
      ['순', '기종', '주간/야간/휴일', 'M/H(h)', '', '', '', '', '', '단가(원/h)', '기성금액(원)', '과제번호'],
      ['', '', '', '장비 실가동 누적', '장비 실가동 금월', 'TPR 작성 및 점검', '특화 시험', '과급', '소계', '', '', '']
    ];
    var merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }, { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } }, { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },
      { s: { r: 5, c: 3 }, e: { r: 5, c: 8 } },
      { s: { r: 5, c: 9 }, e: { r: 6, c: 9 } }, { s: { r: 5, c: 10 }, e: { r: 6, c: 10 } }, { s: { r: 5, c: 11 }, e: { r: 6, c: 11 } }
    ];
    var groups = [];
    bill.lines.forEach(function (l) {
      var g = groups[groups.length - 1];
      if (!g || g.key !== l.key) groups.push(g = { key: l.key, label: l.label, lines: [] });
      g.lines.push(l);
    });
    groups.forEach(function (g, gi) {
      var r0 = aoa.length;
      g.lines.forEach(function (l, i) {
        aoa.push([i === 0 ? gi + 1 : '', l.label, shiftLabel(l.shift), i === 0 ? l.cum : '', l.month, l.tpr, l.special,
          l.surcharge ? l.surcharge + '%' : '', Math.round(l.subtotal * 10) / 10, l.rate > 0 ? l.rate : '', l.amount == null ? '' : l.amount, i === 0 ? (l.project || '') : '']);
      });
      if (g.lines.length > 1) [0, 3, 11].forEach(function (c) { merges.push({ s: { r: r0, c: c }, e: { r: r0 + g.lines.length - 1, c: c } }); });
    });
    aoa.push(['계', '', '', '', t.month, t.tpr, t.special, '', Math.round(t.subtotal * 10) / 10, '-', bill.missingRate ? '' : t.amount, '-']);
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 3 } });
    var st = meta.status || { days: 0, drivers: 0, hours: t.month, done: [] };
    aoa.push(['* 특화시험: 장비 운행 중 배터리/충전 상태 점검, 차량 이상 발생 시 장비 점검/수정한 시간'], [],
      ['5. 내구시험 현황'],
      ['  1) 월간 가동일수 : ' + st.days + '일'],
      ['  2) 가동 투입 인원 : ' + st.drivers + '명(일지의 운전자 기준)'],
      ['  3) 월간 가동 시간 : ' + fmtNum(t.month) + ' hr'],
      ['  4) 완료 모델: ' + (st.done.length ? '총 ' + st.done.length + '모델 시험 종료-' + st.done.join(', ') : '없음')],
      [], ['[ 유첨 ]'], ['  1) 기종별 내구시험 기성 청구서 : ' + groups.length + '매']);
    var sheets = { '청구서': { aoa: aoa, merges: merges } };
    // 모델별 상세 시트: 기간 안 일자별 행
    var used = { '청구서': true };
    groups.forEach(function (g) {
      var detail = [[g.label + ' 내구시험 기성 상세 (' + dotDate(meta.from) + ' ~ ' + dotDate(meta.to) + ')'], [],
        ['Date', '주/야/휴', '과급 구분(날짜 기준)', '일 가동시간(h)', 'TPR 작성 및 점검(h)', '배터리 충전 점검(h)', '특회 장비수리(h)', '누적 가동시간(h)', '운전자 Code', '문제점 / 조치내용', '비고']];
      var m = (masters || {})[g.key] || { model: g.key.split('|')[0], unit_no: g.key.split('|')[1] };
      unitSummary(rows, m, { to: meta.to }).lines.forEach(function (l) {
        if (l.date < meta.from) return;
        var r = rows.find(function (x) { return x.id === l.id; }) || {};
        var dk = dayKind(l.date, meta.holidays);
        detail.push([l.date, l.shift, shiftLabel(billShift({ date: l.date, shift: l.shift }, meta.holidays)) + (dk.kind === '평일' ? '' : '(' + (dk.name || dk.kind) + ')'),
          l.hours == null ? '' : l.hours, l.inspect == null ? '' : l.inspect, r.battery_check_h == null ? '' : r.battery_check_h,
          r.special_h == null ? '' : r.special_h, l.cum, l.driver, l.issue, r.provisional ? '가입력(예상치)' : r.estimate ? '가입력 후 확정' : '']);
      });
      sheets[sheetName(g.label, used)] = { aoa: detail };
    });
    return sheets;
  }

  // ── 기성처리 ② 연료비 정산(개발장비 내구시험 연료 주입 청구서) ─────
  // 정산 방식은 연료마다 다릅니다(수강생 답 09-30):
  //  - 경유·요소수: 「오피넷의 월 평균 단가를 사용하지 않고 주입 시 주유소 카드 결재 금액으로 처리」
  //    → 일지에 적은 결제 금액(fuel_won·urea_won, VAT 포함)을 그대로 더합니다. 리터당 단가를 곱하지 않습니다.
  //  - LPG: 「월단위로 결제… 오피넷의 월평균 단가로 사용량을 곱하여 계산하므로 일지에 사용량만 기재」
  //    → 기간 사용량을 달별로 나눠 그달 단가(원/kg)를 곱하고 원 단위 반올림해 더합니다.
  //    기간을 직접 정하므로(예: 05.27 ~ 06.30) 두 달에 걸칠 수 있어 달별로 계산합니다.
  var RECEIPT = { '경유': { qty: 'fuel_qty', won: 'fuel_won' } };
  RECEIPT[UREA] = { qty: 'urea_l', won: 'urea_won' };
  function fuelBillingLines(rows, masters, from, to) {
    var out = [];
    unitList(rows, masters).forEach(function (u) {
      var mine = rowsOfUnit(rows, u.key).filter(function (r) { return r.date && r.date <= to; });
      var inP = sortLogs(mine.filter(function (r) { return r.date >= from; }));
      if (!inP.length) return;
      var cum = mine.reduce(function (s, r) { var h = effectiveHours(r); return h > 0 ? r2(s + h) : s; }, 0);
      var month = inP.reduce(function (s, r) { var h = effectiveHours(r); return h > 0 ? r2(s + h) : s; }, 0);
      var base = { key: u.key, label: u.label, project: u.project, cum: cum, month: month, first: inP[0].date, last: inP[inP.length - 1].date };
      FUELS.forEach(function (f) {
        var l = Object.assign({}, base, { fuel: f.key, unit: fuelUnit(f.key), qty: 0, bottles: 0, byMonth: {}, won: 0, fills: 0, noWon: [] });
        var logs = 0;
        inP.forEach(function (r) {
          var fuel = r.fuel_type || u.fuel;
          if (fuel !== f.key) return;
          logs++;
          if (r.fuel_qty > 0) {
            l.qty = r2(l.qty + r.fuel_qty);
            var ym = monthOf(r.date);
            l.byMonth[ym] = r2((l.byMonth[ym] || 0) + r.fuel_qty);
          }
          if (r.lpg_bottles > 0) l.bottles = r2(l.bottles + r.lpg_bottles);
          if (f.key === '경유') {
            if (r.fuel_won > 0) { l.won += Math.round(r.fuel_won); l.fills++; }
            else if (r.fuel_qty > 0) l.noWon.push(r.date + (r.shift ? ' ' + r.shift : ''));
          }
        });
        if (l.qty > 0 || l.won > 0 || (u.fuel === f.key && logs)) out.push(l);
      });
      // 요소수: 모델에 따라 들어가며 청구 대상(수강생 답 09-29 오후) — 연료와 따로 한 줄, 결제 금액으로 정산
      var ul = Object.assign({}, base, { fuel: UREA, unit: 'L', qty: 0, bottles: 0, byMonth: {}, won: 0, fills: 0, noWon: [] });
      inP.forEach(function (r) {
        if (r.urea_l > 0) ul.qty = r2(ul.qty + r.urea_l);
        if (r.urea_won > 0) { ul.won += Math.round(r.urea_won); ul.fills++; }
        else if (r.urea_l > 0) ul.noWon.push(r.date + (r.shift ? ' ' + r.shift : ''));
      });
      if (ul.qty > 0 || ul.won > 0) out.push(ul);
    });
    return out;
  }
  // prices: { LPG: { price } } — 달별 단가가 없을 때 쓰는 기간 공통 LPG 단가(선택)
  // opts: { lpgMonthly: { 'YYYY-MM': { price, source, checked } }, bottleKg }
  // 결과 missingPrice: 금액을 못 낸 까닭 목록(예: 「LPG 2025-06 단가」, 「경유 결제 금액(빈 주입 2건)」)
  function lpgPriceOf(ym, prices, opts) {
    var m = opts && opts.lpgMonthly && opts.lpgMonthly[ym];
    var p = m ? parseNum(m.price) : null;
    if (p > 0) return p;
    p = prices && prices.LPG ? parseNum(prices.LPG.price) : null;
    return p > 0 ? p : null;
  }
  function calcFuelBilling(lines, prices, opts) {
    prices = prices || {}; opts = opts || {};
    var bottleKg = parseNum(opts.bottleKg) || 15;
    var missing = [];
    function miss(s) { if (missing.indexOf(s) < 0) missing.push(s); }
    var t = { qty: {}, amount: 0 };
    var out = lines.map(function (l) {
      var amount = null, price = null, parts = [], basis = '';
      if (l.fuel === 'LPG') {
        basis = 'monthly';
        var months = Object.keys(l.byMonth || {}).sort();
        if (!months.length && l.qty > 0) months = [''];
        var ok = true, sum = 0, ps = {};
        months.forEach(function (ym) {
          var q = ym ? l.byMonth[ym] : l.qty;
          var p = lpgPriceOf(ym, prices, opts);
          if (!(p > 0)) { ok = false; miss(ym ? 'LPG ' + ym + ' 단가' : 'LPG'); parts.push({ month: ym, qty: q, price: null, amount: null }); return; }
          var a = Math.round(r4(q * p));
          sum += a; ps[p] = true;
          parts.push({ month: ym, qty: q, price: p, amount: a });
        });
        amount = ok ? sum : null;
        var pk = Object.keys(ps);
        price = pk.length === 1 && ok ? +pk[0] : null;
      } else if (l.won !== undefined) {
        // 경유·요소수 — 결제 금액 합계. 금액이 빈 주입이 있으면 부분 합계만 보이고 청구 합계는 막습니다.
        basis = 'receipt';
        amount = l.won;
        if (l.noWon && l.noWon.length) miss(l.fuel + ' 결제 금액(빈 주입 ' + l.noWon.length + '건)');
      } else {
        // (예전 방식으로 만든 줄 — 단가 × 사용량)
        var p0 = prices[l.fuel] ? parseNum(prices[l.fuel].price) : null;
        if (l.qty > 0 && !(p0 > 0)) miss(l.fuel); else amount = l.qty > 0 ? Math.round(r4(l.qty * p0)) : 0;
        price = p0;
      }
      var note = '';
      if (l.fuel === 'LPG' && l.qty > 0) note = fmtNum(l.bottles > 0 ? l.bottles : l.qty / bottleKg, l.bottles > 0 || (l.qty / bottleKg) % 1 === 0 ? 0 : 1) + '통';
      else if (basis === 'receipt' && l.fills) note = '카드 결제 ' + l.fills + '회';
      t.qty[l.fuel] = r2((t.qty[l.fuel] || 0) + l.qty);
      if (amount != null) t.amount += amount;
      return Object.assign({}, l, { price: price, amount: amount, note: note, basis: basis, parts: parts });
    });
    return { lines: out, totals: t, missingPrice: missing };
  }
  function fuelBillingSheets(bill, meta, rows, masters, prices) {
    meta = meta || {}; prices = prices || {};
    var appr = approvalRow(meta.approvers);
    var t = bill.totals;
    var fuels = Object.keys(t.qty);
    var qtyTotal = fuels.length === 1 ? t.qty[fuels[0]] : '-';
    var aoa = [
      ['■ 개발장비 내구시험 연료 주입 청구서', '', '', '', '', '', '결재', appr[0] || '', appr[1] || '', appr[2] || ''],
      ['1. 모델별 청구 금액', '', '', '', '', '', '', '', '', ''],
      ['2. 기간 : ' + dotDate(meta.from) + ' ~ ' + dotDate(meta.to), '', '', '', '', '', '', '', '', ''],
      ['3. 주유 금액 : ' + (bill.missingPrice.length ? '(빈 칸: ' + bill.missingPrice.join(', ') + ')' : won(t.amount)) + ' (VAT 포함)', '', '', '', '', '', '', '/', '/', '/'],
      ['4. 주유 내역', '', '', '', '', '', '', '', '', meta.team || ''],
      ['순', '기종', '유종', '장비 가동(h)', '', '가스/경유/요소수 사용량(LPG kg · 경유·요소수 L)', '단가(원/kg)', '금액(원)', '과제번호', '비고'],
      ['', '', '', '총누적', '금월', '', '', '', '', '']
    ];
    var merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 5, c: 3 }, e: { r: 5, c: 4 } }];
    [0, 1, 2, 5, 6, 7, 8, 9].forEach(function (c) { merges.push({ s: { r: 5, c: c }, e: { r: 6, c: c } }); });
    bill.lines.forEach(function (l, i) {
      aoa.push([i + 1, l.label, l.fuel, l.cum, l.month, l.qty, l.basis === 'receipt' ? '-' : l.price == null ? (l.parts && l.parts.length > 1 ? '월별' : '') : l.price,
        l.amount == null ? '단가 없음' : l.amount, l.project || '', l.note]);
    });
    aoa.push(['계', '', '', '', '-', qtyTotal, '-', bill.missingPrice.length ? '' : t.amount, '', 'VAT 포함']);
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 3 } });
    var has = {}; bill.lines.forEach(function (l) { has[l.fuel] = true; });
    if (has['경유'] || has[UREA]) aoa.push(['※ 경유·요소수는 주입할 때 주유소에서 카드로 결제한 금액(VAT 포함)으로 정산합니다(리터당 단가를 곱하지 않음).']);
    if (has.LPG) aoa.push(['※ 가스(LPG) 사용량은 기간 사용량에 오피넷 월 평균 가격을 곱해 정산하며, 월 말 카드 결제합니다.']);
    if (meta.fuelNote) aoa.push(['※ ' + meta.fuelNote]);
    var unitKeys = [];
    bill.lines.forEach(function (l) { if (unitKeys.indexOf(l.key) < 0) unitKeys.push(l.key); });
    var ledgers = ['LPG', '경유'].filter(function (k) { return has[k]; });
    aoa.push([], ['[ 유첨 ]'], ['  1) 기종별 연료 주입 현황 : ' + unitKeys.length + '매']);
    if (ledgers.length) aoa.push(['  2) ' + ledgers.join(' / ') + ' 대장 : 각 1매 (입고·주유 대장 스캔본을 따로 첨부)']);
    if (has.LPG) aoa.push(['  ' + (ledgers.length ? 3 : 2) + ') LPG 단가 결정 내역(단가 시트) : 1매']);
    var sheets = { '청구서': { aoa: aoa, merges: merges } };
    var used = { '청구서': true, '단가': true };
    // 기종별 연료 주입 현황 — 받은 양식처럼 기종 한 장에 기간 안 가동 일지 전부(주유한 날에 사용량·금액)
    unitKeys.forEach(function (key) {
      var ls = bill.lines.filter(function (l) { return l.key === key; });
      var main = ls.filter(function (l) { return l.fuel !== UREA; })[0];
      var urea = ls.filter(function (l) { return l.fuel === UREA; })[0];
      var isLpg = main && main.fuel === 'LPG';
      var fuelName = main ? main.fuel : '경유';
      var m = (masters || {})[key] || { model: key.split('|')[0], unit_no: key.split('|')[1] };
      var sum = unitSummary(rows, m, { to: meta.to });
      var lines = sum.lines.filter(function (x) { return x.date >= meta.from; });
      var total = ls.reduce(function (s, l) { return l.amount == null ? s : s + l.amount; }, 0);
      var incomplete = ls.some(function (l) { return l.amount == null || (l.noWon && l.noWon.length); });
      var d = [['기종별 연료 주입 현황'],
        ['1. 모델 : ' + ls[0].label],
        ['2. 기간 : ' + dotDate(ls[0].first) + ' ~ ' + dotDate(ls[0].last)],
        ['3. 주유 금액 : ' + (incomplete ? '(빈 칸 있음) ' : '') + won(total) + ' (VAT 포함)'],
        ['4. 기성내역'],
        ['가동 일자', '주간/야간/휴일', '장비 가동(h) 총누적', '금월', isLpg ? 'LPG(kg)' : fuelName + ' ℓ', '요소수 ℓ', isLpg ? '단가(원/kg)' : '단가', '금액(원)', '비고']];
      lines.forEach(function (x) {
        var r = rows.find(function (y) { return y.id === x.id; }) || {};
        var fq = x.fuel === fuelName && r.fuel_qty > 0 ? r.fuel_qty : '';
        var amt = '';
        var note = [];
        if (!isLpg) {
          var a = (r.fuel_won > 0 ? Math.round(r.fuel_won) : 0) + (r.urea_won > 0 ? Math.round(r.urea_won) : 0);
          if (a) amt = a;
          if (r.urea_won > 0 && r.fuel_won > 0) note.push('요소수 ' + fmtNum(r.urea_won, 0) + '원 포함');
          if ((r.fuel_qty > 0 && !(r.fuel_won > 0)) || (r.urea_l > 0 && !(r.urea_won > 0))) note.push('결제 금액 빈 칸');
        }
        if (r.lpg_bottles > 0) note.push(fmtNum(r.lpg_bottles) + '통');
        d.push([x.date.slice(5), x.shift, x.cum, x.hours == null ? '' : x.hours, fq, r.urea_l > 0 ? r.urea_l : '', '', amt, note.join(', ')]);
      });
      if (main) {
        d.push(['소계 (' + fuelName + ', VAT 포함)', '', '', main.month, main.qty, '', isLpg ? (main.price == null ? (main.parts.length > 1 ? '월별' : '') : main.price) : '-', main.amount == null ? '' : main.amount, main.note]);
        if (isLpg && main.parts.length > 1) main.parts.forEach(function (p) {
          d.push(['  LPG ' + p.month, '', '', '', p.qty, '', p.price == null ? '단가 없음' : p.price, p.amount == null ? '' : p.amount, '']);
        });
      }
      d.push(['소계 (요소수, VAT 포함)', '', '', main ? '' : ls[0].month, '', urea ? urea.qty : 0, '-', urea ? urea.amount : 0, urea ? urea.note : '']);
      d.push(['합계(VAT 포함)', '', '', '', '', '', '', incomplete ? '' : total, incomplete ? '빈 칸을 채우면 계산됩니다' : '']);
      sheets[sheetName(ls[0].label, used)] = { aoa: d };
    });
    // 단가 시트 — LPG 는 달별 오피넷 월평균, 경유·요소수는 결제 금액이라 단가가 없습니다
    var pr = [['구분', '월', '단가(원)', '단위', '가격 출처', '조회일']];
    var lpgMonths = {};
    bill.lines.forEach(function (l) { if (l.fuel === 'LPG') Object.keys(l.byMonth || {}).forEach(function (ym) { lpgMonths[ym] = true; }); });
    var lm = Object.keys(lpgMonths).sort();
    if (!lm.length && prices.LPG) lm = [''];
    lm.forEach(function (ym) {
      var mp = (meta.lpgMonthly && meta.lpgMonthly[ym]) || (prices.LPG || {});
      var p = lpgPriceOf(ym, prices, { lpgMonthly: meta.lpgMonthly });
      pr.push(['LPG', ym || dotDate(meta.from) + ' ~ ' + dotDate(meta.to), p == null ? '' : p, '원/kg', mp.source || '오피넷 월 평균', mp.checked || '']);
    });
    pr.push(['경유', '-', '-', '-', '주입 때 주유소 카드 결제 금액(영수증)으로 정산 — 단가 없음', '']);
    pr.push([UREA, '-', '-', '-', '주입 때 주유소 카드 결제 금액(영수증)으로 정산 — 단가 없음', '']);
    sheets['단가'] = { aoa: pr };
    return sheets;
  }

  // ── 휴일·기성 마감 (수강생 답 09-29 오후 늦게) ─────────────────
  // 「휴일은 별도로 입력을 안 하고 날짜로 휴일을 구분」 「휴일 근무는 토요일 주간만 운행(계약상), 30% 동일」
  // 「근무일 기준 월 말일이 기성 마감일」 — 그래서 휴일·마감일 모두 날짜와 공휴일 목록으로 계산합니다.
  //
  // 공휴일 목록은 사용자가 고치는 글자(한 줄에 「YYYY-MM-DD 이름」)입니다. 코드에 정답 달력을 박아 두지 않습니다.
  // 양력 고정 공휴일은 해마다 같아 만들어 넣고, 음력 명절·대체공휴일·선거일은 해마다 달라
  // 2026년분만 초안으로 넣어 둡니다(화면에서 회사 달력과 대조해 고치고, 다음 해 것은 직접 더함).
  var FIXED_HOLIDAYS = [['01-01', '신정'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['06-06', '현충일'],
    ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '성탄절']];
  var LUNAR_2026 = [['2026-02-16', '설날 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설날 연휴'], ['2026-03-02', '대체공휴일(삼일절)'],
    ['2026-05-24', '부처님오신날'], ['2026-05-25', '대체공휴일(부처님오신날)'], ['2026-06-03', '전국동시지방선거'],
    ['2026-08-17', '대체공휴일(광복절)'], ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'],
    ['2026-10-05', '대체공휴일(개천절)']];
  function defaultHolidayText(years) {
    var lines = [];
    (years || []).forEach(function (y) {
      FIXED_HOLIDAYS.forEach(function (h) { lines.push(y + '-' + h[0] + ' ' + h[1]); });
      if (+y === 2026) LUNAR_2026.forEach(function (h) { lines.push(h[0] + ' ' + h[1]); });
    });
    return lines.sort().join('\n');
  }
  // 회사 휴무일 초안 — 수강생 답(09-29): 「회사 휴무일은 휴가, 근로자의날도 포함」. 일반 달력(공휴일 목록)에 더해 씁니다.
  // 근로자의 날만 날짜가 정해져 있어 넣어 두고, 휴가(하계·동계 등)는 회사 달력을 보고 「시작~끝 이름」으로 더합니다.
  function defaultCompanyHolidayText(years) {
    return (years || []).map(function (y) { return y + '-05-01 근로자의 날'; }).join('\n');
  }
  // 「2026-09-24 추석 연휴」 「2026.9.24, 추석」 등 → { map: { 'YYYY-MM-DD': 이름 }, bad: [못 읽은 줄] }
  // 휴가처럼 여러 날이면 「2026-08-03~2026-08-07 하계 휴가」 또는 「2026-08-03~08-07 하계 휴가」(최대 62일)
  var DATE_RE = '(\\d{4}[-./]\\s*\\d{1,2}[-./]\\s*\\d{1,2})';
  function parseHolidays(textIn) {
    var map = {}, bad = [];
    String(textIn == null ? '' : textIn).split(/\r?\n/).forEach(function (line) {
      var s = line.replace(/#.*$/, '').trim();
      if (!s) return;
      var rg = s.match(new RegExp('^' + DATE_RE + '\\.?\\s*[~～]\\s*((?:\\d{4}[-./]\\s*)?\\d{1,2}[-./]\\s*\\d{1,2})\\.?\\s*[,\\t ]?\\s*(.*)$'));
      if (rg) {
        var a = parseDate(rg[1].replace(/\s/g, ''));
        var bs = rg[2].replace(/\s/g, '');
        var b = a ? parseDate(/^\d{4}/.test(bs) ? bs : a.slice(0, 4) + '-' + bs.replace(/[./]/g, '-')) : null;
        if (!a || !b || b < a || addDays(a, 62) < b) { bad.push(line); return; }
        for (var d = a; d <= b; d = addDays(d, 1)) map[d] = (rg[3] || '').trim() || '회사 휴무';
        return;
      }
      var m = s.match(/^(\d{4}[-./]\s*\d{1,2}[-./]\s*\d{1,2})\.?\s*[,\t ]?\s*(.*)$/);
      var d = m ? parseDate(m[1].replace(/\s/g, '')) : null;
      if (!d) { bad.push(line); return; }
      map[d] = (m[2] || '').trim() || '공휴일';
    });
    return { map: map, bad: bad };
  }
  function dowOf(date) { var p = String(date).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); }
  // 날짜의 종류: 평일 · 토 · 일 · 공휴일(토·일과 겹치면 공휴일)
  function dayKind(date, hol) {
    hol = hol || {};
    if (!date) return { kind: '', name: '' };
    if (hol[date]) return { kind: '공휴일', name: hol[date] };
    var w = dowOf(date);
    return { kind: w === 6 ? '토' : w === 0 ? '일' : '평일', name: '' };
  }
  function isWorkday(date, hol) { return dayKind(date, hol).kind === '평일'; }
  // 기성 과급 구분: 평일은 적힌 주/야(휴라고 적혀도 주간), 토·일·공휴일은 휴일(30%)
  function billShift(row, hol) {
    var k = dayKind(row.date, hol).kind;
    if (k && k !== '평일') return '휴';
    return row.shift === '야' ? '야' : '주';
  }
  // 휴일 근무 검사 — 계약상 휴일 근무는 토요일 주간뿐입니다. 경고만 하고 계산은 휴일 30% 로 합니다.
  function holidayWorkIssues(row, hol) {
    var out = [];
    if (!row.date) return out;
    var dk = dayKind(row.date, hol);
    if (dk.kind === '일' || dk.kind === '공휴일') {
      out.push({ code: 'holiday_not_saturday', msg: (dk.kind === '일' ? '일요일' : '공휴일(' + dk.name + ')') + ' 일지입니다 — 계약상 휴일 근무는 토요일 주간뿐입니다. 기성은 휴일 과급 30% 로 계산했으니 날짜를 확인해 주세요' });
    }
    if (dk.kind !== '평일' && row.shift === '야') {
      out.push({ code: 'holiday_night', msg: '휴일 야간 일지입니다 — 계약상 휴일 근무는 토요일 주간뿐입니다. 기성은 휴일 과급 30% 로 계산했습니다' });
    }
    if (dk.kind === '평일' && row.shift === '휴') {
      out.push({ code: 'holiday_on_workday', msg: '평일인데 「휴」로 적혀 있습니다 — 휴일은 날짜로 정하므로 주간(과급 없음)으로 계산합니다. 회사 휴무일이면 공휴일 목록에 더해 주세요' });
    }
    return out;
  }
  // 그 달의 마지막 근무일(= 기성 마감일). month 는 1~12.
  function lastWorkday(year, month, hol) {
    var d = new Date(+year, +month, 0);
    for (var i = 0; i < 31; i++) {
      var ds = toDateStr(d);
      if (isWorkday(ds, hol)) return ds;
      d.setDate(d.getDate() - 1);
    }
    return null;
  }
  function cutoffOfMonth(ym, hol) { var p = String(ym).split('-'); return lastWorkday(+p[0], +p[1], hol); }
  function shiftMonth(ym, n) { var p = String(ym).split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  // 기성 기간: 전달 마감일 다음 날 ~ 그달 마감일. 마감일 뒤 토요일 근무 등은 다음 기간으로 넘어갑니다.
  function closingPeriodOf(ym, hol) {
    return { month: ym, from: addDays(cutoffOfMonth(shiftMonth(ym, -1), hol), 1), to: cutoffOfMonth(ym, hol), cutoff: cutoffOfMonth(ym, hol) };
  }
  // 오늘이 속한(아직 마감 전인) 기성 기간. 오늘이 그달 마감일을 지났으면 다음 달 기간입니다.
  function openClosingPeriod(today, hol) {
    var ym = monthOf(today);
    if (today > cutoffOfMonth(ym, hol)) ym = shiftMonth(ym, 1);
    return closingPeriodOf(ym, hol);
  }
  function workdaysBetween(from, to, hol) {
    var out = [];
    if (!from || !to || from > to) return out;
    for (var d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) if (isWorkday(d, hol)) out.push(d);
    return out;
  }

  // 마감일 가입력(예상치) → 가동 후 확정.
  // 「마지막 날은 근무 끝나기 전에 가동시간, 연료사용량 등 기성에 필요한 값만 미리 입력하여 마감하고, 가동 후 추가 데이터 업데이트」
  // 가입력으로 저장하면 그 값을 estimate 에 남기고, 확정 저장하면 estimate 는 그대로 둔 채 provisional 을 끕니다.
  // 그래서 「마감 때 낸 값」과 「확정 값」의 차이를 나중에도 보여 줄 수 있습니다.
  var PROVISIONAL_KEYS = ['run_hours', 'hour_end', 'inspect_h', 'battery_check_h', 'special_h', 'fuel_qty', 'lpg_bottles', 'urea_l', 'fuel_won', 'urea_won'];
  var PROVISIONAL_LABELS = { lpg_bottles: 'LPG 통 수' };
  function provLabel(k) { return PROVISIONAL_LABELS[k] || FIELD[k].label; }
  function snapshotEstimate(row) {
    var e = {};
    PROVISIONAL_KEYS.forEach(function (k) { e[k] = row[k] == null ? null : row[k]; });
    return e;
  }
  // newRow: 방금 저장하려는 행, oldRow: 고치기 전 행(새 일지면 null), wantProvisional: 「가입력」 표시 여부, today: 확정일
  function applyProvisional(newRow, oldRow, wantProvisional, today) {
    var r = Object.assign({}, newRow);
    delete r.provisional; delete r.estimate; delete r.confirmed_at;
    if (wantProvisional) { r.provisional = true; r.estimate = snapshotEstimate(r); return r; }
    if (oldRow && oldRow.estimate) {
      r.estimate = oldRow.estimate;
      r.confirmed_at = oldRow.provisional ? (today || '') : (oldRow.confirmed_at || today || '');
    }
    return r;
  }
  // 기간 안의 가입력 일지: 아직 확정 전(pending)과 확정된 것의 값 차이(confirmed)
  function provisionalReport(rows, from, to) {
    var pending = [], confirmed = [];
    sortLogs(rows.filter(function (r) { return r.date && r.date >= from && r.date <= to && (r.provisional || r.estimate); })).forEach(function (r) {
      var diffs = PROVISIONAL_KEYS.map(function (k) {
        var est = r.estimate ? r.estimate[k] : null, fin = r[k] == null ? null : r[k];
        if (est == null && fin == null) return null;
        return { key: k, label: provLabel(k), est: est, fin: fin, diff: r2((fin || 0) - (est || 0)) };
      }).filter(Boolean);
      var item = { id: r.id, date: r.date, shift: r.shift || '', label: modelLabel(r.model, r.unit_no), diffs: diffs, confirmed_at: r.confirmed_at || '' };
      if (r.provisional) pending.push(item); else confirmed.push(item);
    });
    return { pending: pending, confirmed: confirmed, changed: confirmed.filter(function (c) { return c.diffs.some(function (d) { return d.diff !== 0; }); }).length };
  }
  // 마감 때 낸 값(estimate)으로 되돌린 행 — 「마감 제출분」 청구서를 다시 계산할 때 씁니다
  function asSubmitted(rows) {
    return rows.map(function (r) { return r.estimate ? Object.assign({}, r, r.estimate) : r; });
  }
  // 마감 제출분 vs 확정 값 — 운전시간 기성금액·연료 사용량 차이
  function closingDiff(rows, masters, from, to, opts) {
    opts = opts || {};
    var hol = opts.holidays || {};
    var sub = asSubmitted(rows);
    var hs = calcHourBilling(hourBillingLines(sub, masters, from, to, { holidays: hol }), { rate: opts.rate });
    var hf = calcHourBilling(hourBillingLines(rows, masters, from, to, { holidays: hol }), { rate: opts.rate });
    var fs = calcFuelBilling(fuelBillingLines(sub, masters, from, to), opts.prices, opts);
    var ff = calcFuelBilling(fuelBillingLines(rows, masters, from, to), opts.prices, opts);
    var qty = {};
    BILL_ITEMS.forEach(function (k) {
      var a = fs.totals.qty[k] || 0, b = ff.totals.qty[k] || 0;
      if (a || b) qty[k] = { est: a, fin: b, diff: r2(b - a) };
    });
    return {
      hours: { est: hs.totals.month, fin: hf.totals.month, diff: r2(hf.totals.month - hs.totals.month) },
      subtotal: { est: hs.totals.subtotal, fin: hf.totals.subtotal, diff: r4(hf.totals.subtotal - hs.totals.subtotal) },
      amount: hs.missingRate ? null : { est: hs.totals.amount, fin: hf.totals.amount, diff: hf.totals.amount - hs.totals.amount },
      fuel: qty,
      fuelAmount: fs.missingPrice.length || ff.missingPrice.length ? null : { est: fs.totals.amount, fin: ff.totals.amount, diff: ff.totals.amount - fs.totals.amount }
    };
  }
  // 청구서 엑셀에 붙이는 「가입력·확정 대조」 시트
  function provisionalSheet(rep, diff) {
    var aoa = [['마감일 가입력(예상치)과 가동 후 확정 값 대조'], [],
      ['일자', '주/야/휴', '모델/호기', '상태', '항목', '가입력(예상치)', '확정', '차이']];
    function push(item, state) {
      if (!item.diffs.length) aoa.push([item.date, item.shift, item.label, state, '', '', '', '']);
      item.diffs.forEach(function (d, i) {
        aoa.push([i === 0 ? item.date : '', i === 0 ? item.shift : '', i === 0 ? item.label : '', i === 0 ? state : '', d.label,
          d.est == null ? '' : d.est, state === '확정 전' ? '' : (d.fin == null ? '' : d.fin), state === '확정 전' ? '' : d.diff]);
      });
    }
    rep.pending.forEach(function (i) { push(i, '확정 전'); });
    rep.confirmed.forEach(function (i) { push(i, '확정(' + (i.confirmed_at || '-') + ')'); });
    if (diff) {
      aoa.push([], ['청구서 영향', '', '', '', '항목', '마감 제출분', '확정 값', '차이']);
      aoa.push(['', '', '', '', '장비 실가동 금월(h)', diff.hours.est, diff.hours.fin, diff.hours.diff]);
      aoa.push(['', '', '', '', '소계(h)', diff.subtotal.est, diff.subtotal.fin, diff.subtotal.diff]);
      if (diff.amount) aoa.push(['', '', '', '', '기성금액(원)', diff.amount.est, diff.amount.fin, diff.amount.diff]);
      Object.keys(diff.fuel).forEach(function (k) { aoa.push(['', '', '', '', k + ' 사용량(' + fuelUnit(k) + ')', diff.fuel[k].est, diff.fuel[k].fin, diff.fuel[k].diff]); });
      if (diff.fuelAmount) aoa.push(['', '', '', '', '주유 금액(원)', diff.fuelAmount.est, diff.fuelAmount.fin, diff.fuelAmount.diff]);
    }
    return { aoa: aoa };
  }

  // 마감 준비 체크리스트 — 마지막 날 하루에 몰리지 않게, 기간 중 매일 보면서 미리 채웁니다.
  // input: { rows, masters, from, to, cutoff, today, holidays, rate, prices, lpgMonthly, bottleKg }
  // 결과: [{ key, label, state: 'ok' | 'todo' | 'wait', detail }]
  function closingChecklist(input) {
    var hol = input.holidays || {};
    var rows = input.rows || [], from = input.from, to = input.to, today = input.today, cutoff = input.cutoff || to;
    var inP = rows.filter(function (r) { return r.date && r.model && r.date >= from && r.date <= to; });
    var out = [];
    function item(key, label, state, detail) { out.push({ key: key, label: label, state: state, detail: detail || '' }); }
    // 1. 근무일 일지 빠짐 — 기간 시작 ~ 어제(오늘 일지는 아직 쓰는 중일 수 있음), 기간 안에 일지가 있는 모델별
    var until = today && today <= to ? addDays(today, -1) : to;
    var days = workdaysBetween(from, until, hol);
    var byUnit = {};
    inP.forEach(function (r) { var k = masterKey(r.model, r.unit_no); (byUnit[k] = byUnit[k] || { label: modelLabel(r.model, r.unit_no), dates: {}, first: r.date }).dates[r.date] = true; if (r.date < byUnit[k].first) byUnit[k].first = r.date; });
    var gaps = [];
    Object.keys(byUnit).forEach(function (k) {
      var u = byUnit[k];
      var miss = days.filter(function (d) { return d >= u.first && !u.dates[d]; });
      if (miss.length) gaps.push(u.label + ' ' + miss.length + '일(' + miss.slice(0, 4).map(function (d) { return d.slice(5); }).join(', ') + (miss.length > 4 ? ' …' : '') + ')');
    });
    item('gaps', '근무일 일지 빠짐 없음(' + dotDate(from).slice(5) + ' ~ ' + (until >= from ? dotDate(until).slice(5) : '-') + ')', gaps.length ? 'todo' : 'ok', gaps.join(' · '));
    // 2. 입력값 검사 오류
    var ids = {}; inP.forEach(function (r) { ids[r.id] = true; });
    var iss = validateRows(rows, { holidays: hol }).filter(function (i) { return ids[i.id]; });
    var errs = iss.filter(function (i) { return i.level === 'error'; }).length;
    item('errors', '입력값 검사 오류 없음', errs ? 'todo' : 'ok', errs ? errs + '건' : '');
    // 3. 휴일 근무 확인
    var holWarn = iss.filter(function (i) { return /^holiday_/.test(i.code); }).length;
    item('holiday', '휴일 근무는 토요일 주간만', holWarn ? 'todo' : 'ok', holWarn ? holWarn + '건 확인' : '');
    // 4. 단가
    item('rate', '운전시간 단가 입력', parseNum(input.rate) > 0 ? 'ok' : 'todo', '');
    var fb = calcFuelBilling(fuelBillingLines(rows, input.masters, from, to), input.prices, { bottleKg: input.bottleKg, lpgMonthly: input.lpgMonthly });
    item('prices', '경유·요소수 결제 금액 · LPG 월 단가 입력', fb.missingPrice.length ? 'todo' : 'ok', fb.missingPrice.join(', '));
    // 5. 과제번호
    var noProj = unitList(rows, input.masters).filter(function (u) { return byUnit[u.key] && !u.project; }).map(function (u) { return u.label; });
    item('project', '모델 정보에 과제번호', noProj.length ? 'todo' : 'ok', noProj.join(', '));
    // 6. 마감일 가입력
    var cutRows = inP.filter(function (r) { return r.date === cutoff; });
    var cutUnits = {}; cutRows.forEach(function (r) { cutUnits[masterKey(r.model, r.unit_no)] = true; });
    var notCut = Object.keys(byUnit).filter(function (k) { return !cutUnits[k]; }).map(function (k) { return byUnit[k].label; });
    item('cutoff', '마감일(' + dotDate(cutoff).slice(5) + ' ' + weekdayKo(cutoff) + ') 기성 값 가입력',
      today < cutoff ? 'wait' : notCut.length ? 'todo' : 'ok', today < cutoff ? '마감일 근무 끝나기 전에 가동시간·연료만 먼저 적습니다' : notCut.join(', '));
    // 7. 가입력 확정
    var pend = inP.filter(function (r) { return r.provisional; });
    item('confirm', '가입력 일지를 가동 후 확정', pend.length ? (today <= cutoff ? 'wait' : 'todo') : 'ok',
      pend.length ? pend.length + '장 확정 전' : '');
    return out;
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
    aoaToCsv: aoaToCsv,
    // 2026-09-29 실제 양식 기준
    SHIFTS: SHIFTS, SHIFT_ORDER: SHIFT_ORDER, CHECK_ITEMS: CHECK_ITEMS, BATTERY_SEGMENTS: BATTERY_SEGMENTS, EXTRA_KEYS: EXTRA_KEYS,
    DEFAULT_SURCHARGE: DEFAULT_SURCHARGE, TARGET_BASE: TARGET_BASE, TARGET_EXTRA: TARGET_EXTRA, UREA: UREA, BILL_ITEMS: BILL_ITEMS,
    lastWednesday: lastWednesday, issueAlertMail: issueAlertMail, normShift: normShift, sortLogs: sortLogs, fmtNum: fmtNum, addDays: addDays, weekdayKo: weekdayKo,
    prevMonthRange: prevMonthRange, modelLabel: modelLabel, shiftLabel: shiftLabel, fuelUnit: fuelUnit,
    tprToRow: tprToRow, rowToTpr: rowToTpr, batteryUse: batteryUse, tprPrompt: tprPrompt, tprFromAi: tprFromAi,
    masterKey: masterKey, normMaster: normMaster, unitList: unitList, rowsOfUnit: rowsOfUnit, parseSummaryHeader: parseSummaryHeader,
    unitSummary: unitSummary, summarySheet: summarySheet,
    weeklyReport: weeklyReport, weeklyMail: weeklyMail, progressSvg: progressSvg,
    hourBillingLines: hourBillingLines, calcHourBilling: calcHourBilling, hourBillingStatus: hourBillingStatus, hourBillingSheets: hourBillingSheets,
    fuelBillingLines: fuelBillingLines, calcFuelBilling: calcFuelBilling, lpgPriceOf: lpgPriceOf, fuelBillingSheets: fuelBillingSheets,
    // 2026-09-29 오후 늦게 — 휴일·기성 마감·가입력/확정
    defaultHolidayText: defaultHolidayText, parseHolidays: parseHolidays, dayKind: dayKind, isWorkday: isWorkday, billShift: billShift,
    holidayWorkIssues: holidayWorkIssues, defaultCompanyHolidayText: defaultCompanyHolidayText, lastWorkday: lastWorkday, closingPeriodOf: closingPeriodOf, openClosingPeriod: openClosingPeriod,
    shiftMonth: shiftMonth, workdaysBetween: workdaysBetween, PROVISIONAL_KEYS: PROVISIONAL_KEYS, applyProvisional: applyProvisional,
    provisionalReport: provisionalReport, asSubmitted: asSubmitted, closingDiff: closingDiff, provisionalSheet: provisionalSheet,
    closingChecklist: closingChecklist,
    // 2026-09-30 — 날짜·요일 대조, 결제 금액 정산, 회사 휴무일
    normDow: normDow, dateWeekdayCheck: dateWeekdayCheck, fixSegLabel: fixSegLabel, AI_PAGE_LIMIT: AI_PAGE_LIMIT, aiPageAllowance: aiPageAllowance, recordAiPage: recordAiPage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DLLogic = api;
})(typeof window !== 'undefined' ? window : this);
