/*
 * 예시 데이터 — 시연용으로 지어낸 가상의 내구시험 일지입니다. 실제 시험 기록이 아닙니다.
 * 모델명·운전자(운전자A~D 가명)·문제점·아워미터·소모량 모두 만든 값이며, 모델 이름에 「예시」를 붙였습니다.
 * 2026-09-29: 실제 TPR 일지 칸(주/야/휴·날씨·사이클·점검시간·배터리 구간·점검항목 ①~⑤)과 모델 정보를 더했습니다.
 * 날짜는 불러오는 날을 기준으로 「두 달 전 1일 ~ 어제」 평일로 만듭니다.
 * 검사 기능을 보이려고 일부러 넣은 이상값 3종:
 *   ① DEMO-L30 은 평일 이틀 일지가 빠져 있습니다(입력 누락일)
 *   ② DEMO-D25 의 한 일지는 시작 아워미터가 전날 종료값보다 작습니다(누적값 역행)
 *   ③ DEMO-E20 의 한 일지는 운전자가 비어 있습니다(빈 칸)
 */
(function (root) {
  'use strict';
  // 같은 날 불러오면 같은 값이 나오도록 고정 씨앗 난수
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ds(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function r1(x) { return Math.round(x * 10) / 10; }

  // meter = 시험 시작 때 아워미터(초기 아워미터), target = 목표 가동시간 — 모두 지어낸 값
  var MODELS = [
    { model: 'DEMO-D25(예시)', unit: '1호기', fuel: '경유', meter: 1240.0, rate: 2.8, test: '주행내구', target: 600, pg: '예시 PG-A', project: 'M-예시-001', night: true },
    { model: 'DEMO-L30(예시)', unit: '1호기', fuel: 'LPG', meter: 856.5, rate: 3.1, test: '하역내구', target: 260, pg: '예시 PG-B', project: 'M-예시-002' },
    { model: 'DEMO-E20(예시)', unit: '1호기', fuel: '전기', meter: 432.0, rate: 0, test: '주행내구', target: 500, pg: '예시 PG-C', project: 'M-예시-003' }
  ];
  var DRIVERS = ['운전자A', '운전자B', '운전자C', '운전자D'];
  var WEATHER = ['맑음', '맑음', '맑음', '흐림', '비'];
  var ISSUES = [
    '좌측 마스트 체인에서 소음 발생(예시)',
    '작동유 온도 경고등 점등 후 소등(예시)',
    '운전석 계기판 화면 깜빡임(예시)',
    '브레이크 페달 유격 커짐(예시)',
    '포크 하강 속도 느려짐(예시)',
    '충전 커넥터 체결 불량(예시)'
  ];
  var NO = ['무', '무', '무', '무', '무'];

  // 모델 정보(시험일지 정리 엑셀 머리 부분)
  function masters() {
    var out = {};
    MODELS.forEach(function (m) {
      out[m.model + '|' + m.unit] = { model: m.model, unit_no: m.unit, initialHour: m.meter, targetHours: m.target, pg: m.pg, project: m.project, fuel: m.fuel };
    });
    return out;
  }

  function build(now) {
    now = now || new Date();
    var start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var rand = rng(20260928);
    var rows = [];
    MODELS.forEach(function (m, mi) {
      var meter = m.meter;
      var n = 0;
      for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        var wd = d.getDay();
        if (wd === 0 || wd === 6) continue;
        n++;
        if (mi === 1 && (n === 9 || n === 23)) continue; // ① 누락일
        // 주간 일지, 그리고 DEMO-D25 는 화·목 야간 일지도 한 장 더(과급 계산 시연)
        var shifts = m.night && (wd === 2 || wd === 4) ? ['주', '야'] : ['주'];
        var weather = WEATHER[Math.floor(rand() * WEATHER.length)];
        shifts.forEach(function (shift, si) {
          var hours = 5 + Math.floor(rand() * 7) * 0.5; // 5.0 ~ 8.0h
          var startMeter = meter;
          if (mi === 0 && n === 15 && si === 0) startMeter = r1(meter - 12); // ② 누적값 역행
          var endMeter = r1(startMeter + hours);
          meter = endMeter;
          var electric = m.fuel === '전기';
          var row = {
            date: ds(d), model: m.model, unit_no: m.unit, test_type: m.test,
            driver: DRIVERS[(n + mi + si * 2) % DRIVERS.length], shift: shift, weather: weather,
            hour_start: startMeter, hour_end: endMeter, run_hours: hours,
            charge_h: electric ? 0.5 : null, cycle_h: hours,
            basic_cycles: Math.round(hours * 4.6), bump_cycles: Math.round(hours * 0.9),
            battery_check_h: electric ? 0.5 : null, inspect_h: 0.5, special_h: null,
            heater_h: null, ac_h: d.getMonth() >= 6 && d.getMonth() <= 7 ? hours : null,
            battery_pct: null, charge_kwh: null, fuel_type: m.fuel, fuel_qty: null, urea_l: null, issue: '', photo: '',
            checks: NO.slice(), problems: [], wheel_nut: true, _tpr: true
          };
          if (electric) {
            row.battery_pct = Math.round(55 + rand() * 35);
            row.charge_kwh = r1(row.battery_pct * 0.32);
            row.battery = [{ label: '기본/요철 (2hr)', start: 99, end: 99 - Math.round(row.battery_pct / 2) },
              { label: '기본/요철 (1hr 50분)', start: 99 - Math.round(row.battery_pct / 2), end: 99 - row.battery_pct }];
            if (n === 11) row.driver = ''; // ③ 빈 칸
          } else if (si === 0 && (wd === 1 || wd === 4)) {
            // 주입은 주 2회(월·목 주간)에 몰아서 — 정리 엑셀의 「경유 주입량」 칸처럼
            row.fuel_qty = r1(hours * m.rate * 3 * (0.9 + rand() * 0.2));
            if (m.fuel === '경유' && wd === 4 && n % 3 === 0) row.urea_l = 20;
          }
          if (rand() < 0.12) {
            row.issue = ISSUES[Math.floor(rand() * ISSUES.length)];
            row.problems = [{ text: row.issue, note: '' }];
            row.checks[0] = '유';
            row.photo = 'IMG_' + ds(d).replace(/-/g, '') + '_' + (mi + 1) + '(예시).jpg';
          }
          rows.push(row);
        });
      }
    });
    rows.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : (a.shift === '야' ? 1 : -1);
    });
    return rows;
  }

  var api = { build: build, masters: masters, MODELS: MODELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DLSample = api;
})(typeof window !== 'undefined' ? window : this);
