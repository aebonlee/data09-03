// 실행: node test/logic.test.mjs   (의존성 없음)
// 기대값은 모두 손으로 계산해 적었습니다(계산식은 각 테스트 옆 주석).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
let seq = 0;
function row(o) { return { id: 't' + (++seq), ...L.normalizeRow(o) }; }

// ── 고정 예제(손 계산용) ───────────────────────────────────────
const FIX = [
  row({ date: '2026-08-28', model: 'M-A', unit_no: '1호기', driver: '갑', hour_start: 100, hour_end: 106.5, fuel_type: '경유', fuel_qty: 20.5 }),
  row({ date: '2026-09-01', model: 'M-A', unit_no: '1호기', driver: '갑', hour_start: 106.5, hour_end: 113, fuel_type: '디젤', fuel_qty: '19.25' }),
  row({ date: '2026-09-02', model: 'M-A', unit_no: '1호기', driver: '을', hour_start: 113, hour_end: 120.25, run_hours: 7.25, fuel_type: '경유', fuel_qty: '21.3 L', issue: '소음' }),
  row({ date: '2026.9.1', model: 'M-B', driver: '병', run_hours: 8, fuel_type: 'lpg', fuel_qty: 24.4 }),
  row({ date: '2026-09-03', model: 'M-B', driver: '병', run_hours: '5:30', fuel_type: 'LPG', fuel_qty: '16.1' }),
  row({ date: '2026-09-02', model: 'M-C', driver: '정', run_hours: 6, fuel_type: '전동', battery_pct: '72%', charge_kwh: 18.4, issue: '경고등' }),
  row({ date: '2026-09-04', model: 'M-C', driver: '정', run_hours: 4, fuel_type: '전기', charge_kwh: 12.35 })
];

console.log('값 읽기');
test('일자: 여러 표기와 엑셀 일련번호', () => {
  assert.equal(L.parseDate('2026-09-01'), '2026-09-01');
  assert.equal(L.parseDate('2026.9.1'), '2026-09-01');
  assert.equal(L.parseDate('2026/09/01 08:30'), '2026-09-01');
  assert.equal(L.parseDate('2026년 9월 1일'), '2026-09-01');
  assert.equal(L.parseDate('20260901'), '2026-09-01');
  assert.equal(L.parseDate(46266), '2026-09-01'); // 2026-01-01 = 46023, +243일
  assert.equal(L.parseDate(new Date(2026, 8, 1)), '2026-09-01');
});
test('일자: 없는 날짜·글자는 null', () => {
  assert.equal(L.parseDate('2026-02-30'), null);
  assert.equal(L.parseDate('어제'), null);
  assert.equal(L.parseDate(''), null);
});
test('숫자: 쉼표·단위 떼기, 못 읽으면 null', () => {
  assert.equal(L.parseNum('1,234.5'), 1234.5);
  assert.equal(L.parseNum('21.3 L'), 21.3);
  assert.equal(L.parseNum('72%'), 72);
  assert.equal(L.parseNum('abc'), null);
  assert.equal(L.parseNum('12-3'), null);
  assert.equal(L.parseNum(0), 0);
});
test('운행시간: 시:분 → 시간', () => {
  assert.equal(L.parseHours('5:30'), 5.5);
  assert.equal(L.parseHours('0:45'), 0.75);
  assert.equal(L.parseHours('7.25'), 7.25);
});
test('연료 종류 통일', () => {
  assert.equal(L.normFuel('디젤'), '경유');
  assert.equal(L.normFuel('lpg 가스'), 'LPG');
  assert.equal(L.normFuel('전동'), '전기');
  assert.equal(L.normFuel('휘발유'), '휘발유');
});
test('운행시간 = 적힌 값, 없으면 종료−시작', () => {
  assert.equal(L.effectiveHours(FIX[0]), 6.5);     // 106.5 − 100
  assert.equal(L.effectiveHours(FIX[2]), 7.25);    // 적힌 값
  assert.equal(L.effectiveHours(row({ hour_start: 100.1, hour_end: 100.3 })), 0.2); // 부동소수 찌꺼기 없이
  assert.equal(L.effectiveHours(row({ hour_end: 100 })), null);
});

console.log('월간 기성 집계');
const sep = L.filterRows(FIX, { from: '2026-09-01', to: '2026-09-30' });
const agg = L.aggregateMonthly(sep);
test('9월은 모델 3개, 8월 행은 빠짐', () => {
  assert.equal(sep.length, 6);
  assert.deepEqual(agg.map(a => a.month + ' ' + a.model), ['2026-09 M-A', '2026-09 M-B', '2026-09 M-C']);
});
test('M-A: 운행 6.5 + 7.25 = 13.75h, 경유 19.25 + 21.3 = 40.55L', () => {
  assert.equal(agg[0].hours, 13.75);
  assert.equal(agg[0].fuel['경유'], 40.55);
  assert.equal(agg[0].fuel.LPG, 0);
  assert.equal(agg[0].logs, 2);
  assert.equal(agg[0].days, 2);
});
test('M-B: 운행 8 + 5.5 = 13.5h, LPG 24.4 + 16.1 = 40.5', () => {
  assert.equal(agg[1].hours, 13.5);
  assert.equal(agg[1].fuel.LPG, 40.5);
});
test('M-C(전동): 운행 10h, 충전량 18.4 + 12.35 = 30.75kWh, 연료 0', () => {
  assert.equal(agg[2].hours, 10);
  assert.equal(agg[2].charge, 30.75);
  assert.equal(agg[2].fuel['경유'] + agg[2].fuel.LPG, 0);
});
test('여러 달이면 월별로 따로 묶음(8월 M-A 6.5h, 20.5L)', () => {
  const all = L.aggregateMonthly(FIX);
  assert.equal(all[0].month, '2026-08');
  assert.equal(all[0].hours, 6.5);
  assert.equal(all[0].fuel['경유'], 20.5);
});

console.log('연료비');
const prices = { '경유': { price: '1,612.5', unit: 'L' }, LPG: { price: 1053, unit: 'L' } };
const bill = L.calcBilling(agg, prices);
test('M-A 경유 40.55 × 1,612.5 = 65,386.875 → 65,387원', () => assert.equal(bill.lines[0].cost['경유'], 65387));
test('M-B LPG 40.5 × 1,053 = 42,646.5 → 42,647원', () => assert.equal(bill.lines[1].cost.LPG, 42647));
test('M-C 전동은 연료비 0원', () => assert.equal(bill.lines[2].total, 0));
test('합계: 65,387 + 42,647 = 108,034원, 운행 37.25h', () => {
  assert.equal(bill.totals.total, 108034);
  assert.equal(bill.totals.hours, 37.25);
  assert.equal(bill.totals.fuel['경유'], 40.55);
  assert.equal(bill.totals.charge, 30.75);
  assert.deepEqual(bill.missingPrice, []);
});
test('단가가 비면 그 연료는 계산하지 않고 표시(가격을 지어내지 않음)', () => {
  const b = L.calcBilling(agg, { '경유': { price: 1612.5 } });
  assert.deepEqual(b.missingPrice, ['LPG']);
  assert.equal(b.lines[1].cost.LPG, null);
  assert.equal(b.totals.total, 65387);
});
test('기성용 엑셀 시트 4개와 합계 행', () => {
  const sh = L.billingSheets('2026-09', bill, prices, sep, []);
  assert.deepEqual(Object.keys(sh), ['기성 요약', '연료 단가', '현황 데이터', '입력값 검사']);
  const sum = sh['기성 요약'];
  const last = sum[sum.length - 1];
  assert.equal(last[0], '합계');
  assert.equal(last[last.length - 1], 108034);
  assert.equal(sh['현황 데이터'].length, 7); // 머리행 + 6행
});

console.log('대시보드');
test('모델별 누적 운행시간: M-A 20.25 > M-B 13.5 > M-C 10', () => {
  const c = L.cumulativeByModel(FIX);
  assert.deepEqual(c.map(x => [x.model, x.hours]), [['M-A', 20.25], ['M-B', 13.5], ['M-C', 10]]);
  assert.equal(c[0].issues, 1);
  assert.equal(c[0].first, '2026-08-28');
});
test('월별 추이 표', () => {
  const t = L.monthlyTrend(FIX);
  assert.deepEqual(t.months, ['2026-08', '2026-09']);
  assert.equal(t.hours['M-A']['2026-08'], 6.5);
  assert.equal(t.hours['M-A']['2026-09'], 13.75);
  assert.equal(t.hours['M-B']['2026-08'], undefined);
});
test('최근 문제점은 최신 일자부터', () => {
  assert.deepEqual(L.recentIssues(FIX).map(r => r.issue), ['소음', '경고등']);
});
test('입력 누락일: M-A 08-28(금)~09-02 사이 → 29·30·31일, 주말 빼면 31일만', () => {
  const ma = L.missingDays(FIX).find(g => g.model === 'M-A');
  assert.deepEqual(ma.missing, ['2026-08-29', '2026-08-30', '2026-08-31']);
  const mw = L.missingDays(FIX, { skipWeekend: true }).find(g => g.model === 'M-A');
  assert.deepEqual(mw.missing, ['2026-08-31']);
});
test('입력 누락일: 기간 필터 안에서만 봄', () => {
  const ma = L.missingDays(FIX, { from: '2026-09-01' }).find(g => g.model === 'M-A');
  assert.deepEqual(ma.missing, []);
});

console.log('입력값 검사');
function codes(rows) { return L.validateRows(rows).map(i => i.id + ':' + i.code).sort(); }
test('고정 예제는 오류 없음(M-B·M-C 는 호기 없이도 통과)', () => {
  const iss = L.validateRows(FIX);
  assert.deepEqual(iss.filter(i => i.level === 'error'), []);
});
test('누적 아워미터 역행: 입력 순서와 무관하게 일자순으로 비교', () => {
  const b = row({ date: '2026-09-02', model: 'M-D', driver: 'x', hour_start: 490, hour_end: 497 });
  const a = row({ date: '2026-09-01', model: 'M-D', driver: 'x', hour_start: 500, hour_end: 505 });
  assert.deepEqual(codes([b, a]), [b.id + ':meter_backwards']);
});
test('역행 허용 오차 0.05h 이내는 통과', () => {
  const a = row({ date: '2026-09-01', model: 'M-D', driver: 'x', hour_start: 500, hour_end: 505 });
  const b = row({ date: '2026-09-02', model: 'M-D', driver: 'x', hour_start: 504.97, hour_end: 510 });
  assert.deepEqual(codes([a, b]), []);
});
test('다른 호기끼리는 비교하지 않음', () => {
  const a = row({ date: '2026-09-01', model: 'M-D', unit_no: '1', driver: 'x', hour_start: 500, hour_end: 505 });
  const b = row({ date: '2026-09-02', model: 'M-D', unit_no: '2', driver: 'x', hour_start: 10, hour_end: 15 });
  assert.deepEqual(codes([a, b]), []);
});
test('빈 칸·범위 밖·못 읽은 값', () => {
  const r1 = row({ date: '', model: '', run_hours: 3 });
  const r2 = row({ date: '2026-09-01', model: 'M', driver: 'x', run_hours: 25 });
  const r3 = row({ date: '2026-09-01', model: 'N', driver: 'x', run_hours: 2, battery_pct: 120 });
  const r4 = row({ date: '2026-09-01', model: 'O', driver: 'x', hour_start: 10, hour_end: 8 });
  const r5 = row({ date: '2026-09-01', model: 'P', driver: 'x', run_hours: 'abc' });
  const r6 = row({ date: '2026-09-01', model: 'Q', driver: 'x', run_hours: 2, fuel_qty: -1, fuel_type: '경유' });
  assert.deepEqual(codes([r1, r2, r3, r4, r5, r6]), [
    r1.id + ':blank', r1.id + ':required', r1.id + ':required',
    r2.id + ':range', r3.id + ':range', r4.id + ':end_before_start',
    r5.id + ':blank', r5.id + ':unreadable', r6.id + ':negative'
  ].sort());
});
test('운행시간과 아워미터 차이 불일치·연료 종류·중복', () => {
  const a = row({ date: '2026-09-01', model: 'M', driver: 'x', hour_start: 10, hour_end: 16, run_hours: 7 });
  const b = row({ date: '2026-09-01', model: 'M', driver: 'y', run_hours: 1, fuel_qty: 3 });
  const c = row({ date: '2026-09-02', model: 'M', driver: 'y', run_hours: 1, fuel_type: '휘발유', fuel_qty: 3 });
  assert.deepEqual(codes([a, b, c]), [a.id + ':hours_mismatch', b.id + ':blank', b.id + ':duplicate', c.id + ':unknown'].sort());
});
test('검사 요약 개수', () => {
  const r = row({ date: '', model: '', run_hours: 1, driver: 'x' });
  assert.deepEqual(L.issueSummary(L.validateRows([r])), { error: 2, warn: 0, rows: 1 });
});

console.log('열 맞추기(가져오기)');
const AOA = [
  ['내구시험 일지 정리(예시)'],
  ['날짜', '운전자', '시작아워', '종료아워', '연료', '주유량(L)', '특이사항', '메모'],
  [46266, '갑', 100, '106.5', '경유', '20.5L', '', '무시되는 열'],
  [],
  ['2026-09-02', '을', 106.5, 113, '디젤', 19, '소음', '']
];
test('제목 행을 건너뛰고 머리행(2번째 줄)을 찾음', () => assert.equal(L.detectHeaderRow(AOA), 1));
test('열 이름 자동 추천', () => {
  const m = L.autoMap(L.headersOf(AOA, 1));
  assert.deepEqual(m, { date: '날짜', driver: '운전자', hour_start: '시작아워', hour_end: '종료아워', fuel_type: '연료', fuel_qty: '주유량(L)', issue: '특이사항' });
});
test('저장해 둔 연결이 자동 추천보다 먼저', () => {
  const m = L.autoMap(L.headersOf(AOA, 1), { issue: '메모', model: '없는열' });
  assert.equal(m.issue, '메모');
  assert.equal(m.model, undefined);
});
test('모델 열이 없으면 시트 이름을 모델로, 빈 줄은 건너뜀', () => {
  const res = L.applyMapping(AOA, { headerRow: 1, mapping: L.autoMap(L.headersOf(AOA, 1)), sheetName: 'DEMO-X', fileName: 'a.xlsx', modelFallback: 'sheet' });
  assert.equal(res.rows.length, 2);
  assert.equal(res.skipped, 1);
  const [a, b] = res.rows;
  assert.equal(a.date, '2026-09-01');
  assert.equal(a.model, 'DEMO-X');
  assert.equal(L.effectiveHours(a), 6.5);
  assert.equal(a.fuel_qty, 20.5);
  assert.equal(b.fuel_type, '경유');
  assert.equal(b.issue, '소음');
  assert.equal(a._src, 'a.xlsx / DEMO-X 3행');
});
test('표준 형식으로 내보낸 시트는 그대로 다시 읽힘(왕복)', () => {
  const aoa = L.standardSheet(FIX);
  const hr = L.detectHeaderRow(aoa);
  const m = L.autoMap(L.headersOf(aoa, hr));
  assert.equal(Object.keys(m).length, L.STD_FIELDS.length);
  const back = L.applyMapping(aoa, { headerRow: hr, mapping: m, modelFallback: 'none' }).rows;
  const strip = r => { const o = { ...r }; delete o.id; delete o._src; return o; };
  assert.deepEqual(back.map(strip), FIX.map(strip));
});

console.log('예시 데이터');
const S = Sample.build(new Date(2026, 8, 28)).map((r, i) => ({ id: 's' + i, ...r }));
test('예시 데이터에 넣은 이상값 3종이 검사에 잡힘', () => {
  const iss = L.validateRows(S);
  assert.equal(iss.filter(i => i.code === 'meter_backwards').length, 1);
  assert.equal(iss.filter(i => i.code === 'blank' && i.field === 'driver').length, 1);
  const l30 = L.missingDays(S, { skipWeekend: true }).find(g => g.model.startsWith('DEMO-L30'));
  assert.equal(l30.missing.length, 2);
});
test('예시 데이터 기간: 2026-07-01 ~ 2026-09-25(어제 전 마지막 평일)', () => {
  assert.equal(S[0].date, '2026-07-01');
  assert.equal(S[S.length - 1].date, '2026-09-25');
});
test('CSV: BOM·따옴표 처리', () => {
  assert.equal(L.aoaToCsv([['a', 'b,c'], ['x"y', 1]]), '﻿a,"b,c"\r\n"x""y",1');
});

// ══ 2026-09-29 실제 양식 기준 ═════════════════════════════════
// 기대값은 수강생이 보낸 양식 사진의 숫자를 그대로 옮겨 손으로 대조했습니다(이름은 가명).
console.log('TPR 일지(내구시험일지 및 문제점 보고서)');
// 사진 1 의 값: 2025-01-03(금) 주간, 모델 MODEL-X #4, 충전 0.5, 가동 7.0, Hour Meter 938.5 / 945.5
const TPR = {
  date: '2025. 1. 3', driver: '운전자A', shift: '주간', weather: '맑음', model: 'MODEL-X', unit_no: '#4',
  charge_h: '0.5', run_hours: '7.0', hour_start: '938.5', hour_end: '945.5',
  cycle_h: '7.0', basic_cycles: '34', bump_cycles: '6', battery_check_h: '0.5', inspect_h: '0.5', ac_h: '', heater_h: '7.0', wheel_nut: false,
  battery: [
    { label: '기본/요철 (2hr)', start: 99, end: 70 }, { label: '기본/요철 (1hr 50분)', start: 70, end: 41 },
    { label: '지게차 충전(정심)', start: 41, end: 84 }, { label: '기본/요철 (2hr)', start: 84, end: 64 },
    { label: '기본/요철 (1hr 50분)', start: 64, end: 52 }, { label: '기본/요철 (50분)', start: '', end: '' }
  ],
  problems: [{ text: '', note: '' }], checks: ['무', '無', '무', 'x', '무'], coop: '', improve: ''
};
test('양식 값이 표준 행으로: 일자·주간·운행시간·빈 배터리 구간 제외', () => {
  const r = { id: 'tp1', ...L.tprToRow(TPR) };
  assert.equal(r.date, '2025-01-03');
  assert.equal(L.weekdayKo(r.date), '금');       // 양식에 적힌 요일과 같음
  assert.equal(r.shift, '주');
  assert.equal(L.effectiveHours(r), 7);
  assert.equal(r.hour_end - r.hour_start, 7);     // 945.5 − 938.5
  assert.equal(r.basic_cycles, 34);
  assert.equal(r.battery.length, 5);
  assert.deepEqual(r.checks, ['무', '무', '무', '무', '무']);
  assert.deepEqual(r.problems, []);
  assert.equal(r.issue, '');
  assert.deepEqual(L.validateRows([r]), []);
});
test('배터리 소모 = 방전 구간 합 29+29+20+12 = 90%, 충전 41→84 = 43%', () => {
  assert.deepEqual(L.batteryUse(L.tprToRow(TPR).battery), { use: 90, charge: 43 });
});
test('문제점 여러 줄 → 「문제점」 열 한 문장, 점검항목 유인데 문제점 없으면 확인', () => {
  const r = L.tprToRow({ ...TPR, problems: [{ text: '마스트 소음', note: '사진1' }, { text: '휠너트 재체결', note: '' }] });
  assert.equal(r.issue, '1) 마스트 소음 (사진1) / 2) 휠너트 재체결');
  const w = { id: 'tp2', ...L.tprToRow({ ...TPR, checks: ['유'] }) };
  assert.deepEqual(L.validateRows([w]).map(i => i.code), ['check_without_issue']);
});
test('LPG 는 통 수만 적어도 kg 으로(통당 15kg: 청구서 930kg = 62통)', () => {
  const r = L.tprToRow({ ...TPR, fuel_type: 'LPG', lpg_bottles: 2 });
  assert.equal(r.fuel_qty, 30);
  assert.equal(L.tprToRow({ ...TPR, fuel_type: 'LPG', lpg_bottles: 2 }, { bottleKg: 14 }).fuel_qty, 28);
});
test('행 → 입력 화면 → 행 왕복', () => {
  const r = L.tprToRow({ ...TPR, problems: [{ text: '소음', note: '' }] });
  const back = L.tprToRow(L.rowToTpr(r));
  assert.deepEqual(back, r);
});
test('AI 답(JSON) 읽기: 코드 블록·앞뒤 문장 무시, 작성자 이름은 비움', () => {
  const ans = '읽은 결과입니다.\n```json\n{"date":"2025-01-03","shift":"주","model":"MODEL-X","unit_no":"#4","run_hours":"7.0","driver":"홍길동",' +
    '"checks":["무","무","유"],"problems":[{"text":"소음","note":""}],"battery":[{"label":"a","start":99,"end":70}]}\n```\n';
  const res = L.tprFromAi(ans);
  assert.equal(res.ok, true);
  assert.equal(res.form.driver, '');
  assert.equal(res.warnings.length, 1);
  const r = L.tprToRow(res.form);
  assert.equal(r.run_hours, 7);
  assert.equal(r.checks[2], '유');
  assert.equal(r.issue, '소음');
  assert.equal(L.tprFromAi('모르겠어요').ok, false);
  assert.equal(L.tprFromAi('{ 깨진 }').ok, false);
});
test('요청문에 모든 칸 이름이 들어 있음', () => {
  const p = L.tprPrompt();
  for (const k of ['hour_start', 'basic_cycles', 'battery', 'checks', 'problems', 'coop']) assert.ok(p.includes('"' + k + '"'), k);
});
test('주/야/휴 읽기', () => {
  assert.equal(L.normShift('주간'), '주');
  assert.equal(L.normShift('야 간'), '야');
  assert.equal(L.normShift('휴일'), '휴');
  assert.equal(L.normShift('오후'), '오후');
});
test('같은 날 주간·야간은 중복이 아니고, 야간 시작이 주간 종료보다 작으면 역행', () => {
  const a = row({ date: '2026-09-01', model: 'Z', driver: 'x', shift: '야', hour_start: 107, hour_end: 114 });
  const b = row({ date: '2026-09-01', model: 'Z', driver: 'y', shift: '주', hour_start: 100, hour_end: 107.5 });
  assert.deepEqual(codes([a, b]), [a.id + ':meter_backwards']);
  const c = row({ date: '2026-09-01', model: 'Z', driver: 'y', shift: '야', hour_start: 107.5, hour_end: 114 });
  assert.deepEqual(codes([c, b]), []);
});

console.log('시험일지 정리표(모델별 누적)');
// 사진 2(정리 엑셀) 윗부분: 초기 아워미터 67.0, 목표 200. 일 가동시간을 그대로 옮기고 순서는 일부러 섞었습니다.
const SUMDATA = [
  ['07-11', '주', 7.5, 178], ['07-11', '야', 7.5], ['07-12', '휴', 3.5], ['07-14', '주', 4.0], ['07-15', '주', 0.0],
  ['07-16', '주', 7.5, 204], ['07-16', '야', 7.5], ['07-17', '주', 6.5], ['07-17', '야', 7.5], ['07-18', '주', 7.5, 159],
  ['07-18', '야', 9.5], ['07-21', '주', 9.5], ['07-21', '야', 9.5], ['07-22', '주', 9.5], ['07-22', '야', 9.5],
  ['07-23', '주', 9.5, 257], ['07-23', '야', 9.5, null, 20], ['07-24', '주', 9.5], ['07-24', '야', 9.5], ['07-25', '주', 9.5, 187],
  ['07-25', '야', 9.5], ['07-26', '휴', 7.5], ['07-28', '주', 9.5], ['07-28', '야', 9.5], ['07-29', '주', 9.5]
];
const SROWS = SUMDATA.map(([d, sh, h, fuel, urea]) => row({ date: '2025-' + d, model: 'MODEL-Y', unit_no: '#1', driver: '운전자B', shift: sh, run_hours: h, fuel_qty: fuel, urea_l: urea, inspect_h: h ? 0.5 : null })).reverse();
const SMASTER = { model: 'MODEL-Y', unit_no: '#1', initialHour: 67, targetHours: 200, pg: '예시', fuel: '경유' };
const SUM = L.unitSummary(SROWS, SMASTER);
test('누적 가동시간·누적 아워미터가 엑셀과 같음(7.5→74.5, 15→82, 18.5→85.5, 0h 날은 그대로)', () => {
  assert.deepEqual(SUM.lines.slice(0, 6).map(l => [l.date.slice(5), l.shift, l.cum, l.meter]),
    [['07-11', '주', 7.5, 74.5], ['07-11', '야', 15, 82], ['07-12', '휴', 18.5, 85.5], ['07-14', '주', 22.5, 89.5], ['07-15', '주', 22.5, 89.5], ['07-16', '주', 30, 97]]);
});
test('마지막 07-29: 누적 199.5h, 누적 아워미터 266.5h, Ratio 99.75%', () => {
  const last = SUM.lines[SUM.lines.length - 1];
  assert.equal(last.cum, 199.5);
  assert.equal(last.meter, 266.5);
  assert.equal(SUM.ratio, 0.9975);
});
test('경유 합계 178+204+159+257+187 = 985L, 요소수 20L (엑셀 머리와 같음)', () => {
  assert.equal(SUM.totals.fuel['경유'], 985);
  assert.equal(SUM.totals.urea, 20);
});
test('정리표 엑셀: 6번째 줄 열 이름, 다시 불러오면 모델·호기·경유가 채워짐(왕복)', () => {
  const aoa = L.summarySheet(SUM);
  assert.equal(aoa[5][0], 'Date');
  assert.equal(aoa[0][1], 'MODEL-Y/#1');
  const hr = L.detectHeaderRow(aoa);
  assert.equal(hr, 5);
  const m = L.autoMap(L.headersOf(aoa, hr));
  for (const k of ['date', 'shift', 'run_hours', 'cycle_h', 'hour_end', 'basic_cycles', 'bump_cycles', 'inspect_h', 'special_h', 'heater_h', 'ac_h', 'fuel_qty', 'urea_l', 'weather', 'driver', 'issue']) assert.ok(m[k], k);
  const back = L.applyMapping(aoa, { headerRow: hr, mapping: m, modelFallback: 'none' }).rows;
  assert.equal(back.length, 25);
  assert.equal(back[0].model, 'MODEL-Y');
  assert.equal(back[0].unit_no, '#1');
  assert.equal(back[0].fuel_type, '경유');
  assert.equal(L.unitSummary(back, SMASTER).totals.hours, 199.5);
});
test('정리 엑셀 머리 읽기: 「MODEL-Y/#1」 → 모델·호기, 「67.0 hr」 → 67', () => {
  const h = L.parseSummaryHeader([['모델명/호기', 'MODEL-Y/#1', '07-29 기준'], ['초기 아워미터', '67.0 hr', '누적 Ratio', '100%'], ['목표 가동시간', '200 hr'], ['PG 정보', '예시']]);
  assert.deepEqual([h.model, h.unit_no, h.initialHour, h.targetHours, h.pg], ['MODEL-Y', '#1', 67, 200, '예시']);
  assert.equal(L.parseSummaryHeader([['제목만']]), null);
  assert.equal(L.parseSummaryHeader([['모델명/호기', 'MODEL-X #4']]).unit_no, '#4');
  assert.equal(L.parseSummaryHeader([['모델명', 'DEMO(예시) 1호기']]).unit_no, '1호기');
});

console.log('주간 현황');
const WK = L.weeklyReport(SROWS, { k: SMASTER }, '2025-07-29', 7);
test('7/23~7/29: 이번 주 가동 9.5×9 + 7.5 = 93h, 누적 199.5 / 200', () => {
  const m = WK.models[0];
  assert.equal(WK.from, '2025-07-23');
  assert.equal(m.weekHours, 93);
  assert.equal(m.cum, 199.5);
  assert.equal(m.remaining, 0.5);
  assert.equal(m.done, false);
  assert.equal(m.eta, '2025-07-30'); // 0.5h ÷ (93h/7일) → 1일
});
test('주간 문제점·메일 본문·그래프', () => {
  const rows = [...SROWS, row({ date: '2025-07-28', model: 'MODEL-Y', unit_no: '#1', driver: 'x', shift: '야', run_hours: 0, issue: '전륜 <타이어> 편마모' })];
  const rep = L.weeklyReport(rows, { k: SMASTER }, '2025-07-29');
  assert.equal(rep.models[0].weekIssues.length, 1);
  const mail = L.weeklyMail(rep);
  assert.ok(mail.subject.includes('2025-07-29 기준'));
  assert.ok(mail.body.includes('MODEL-Y #1: 199.5h / 200.0h (99.8%)'));
  assert.ok(mail.body.includes('07-28(야) 전륜 <타이어> 편마모'));
  const svg = L.progressSvg(rep);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('MODEL-Y #1'));
  assert.ok(!svg.includes('<타이어>'));
});
test('목표 도달 모델은 「시험 종료」', () => {
  const r = L.weeklyReport(SROWS, { k: { ...SMASTER, targetHours: 150 } }, '2025-07-29');
  assert.equal(r.models[0].done, true);
  assert.ok(L.weeklyMail(r).body.includes('시험 종료'));
});

console.log('기성처리 ① 운전시간 정산');
// 사진 3(기성 청구서)의 금월·TPR·특화 값을 그대로 넣어 기성금액·합계가 청구서와 같은지 봅니다. 단가 24,400원/h 도 사진의 값.
const INV = [
  ['기종A', 1000, [42, 2, 2], [31, 1.5, 1.5], [0, 0, 0]],
  ['기종B', 1500, [31, 2, 2], [57, 3.5, 3.5], [0, 0, 0]],
  ['기종D#1', 1000, [125, 7, 0], [144.5, 7.5, 0], [0, 0, 0]],
  ['기종D#2', 403.5, [80, 4.5, 4.5], [74, 4, 4], [7, 0.5, 0.5]],
  ['기종E', 48.5, [17.5, 0.5, 0.5], [31, 1.5, 1.5], [0, 0, 0]],
  ['기종F', 120, [39, 3, 3], [81, 4.5, 4.5], [0, 0, 0]],
  ['기종G', 88, [40.5, 2, 0], [47.5, 2.5, 0], [0, 0, 0]]
];
const INV_LINES = INV.flatMap(([m, cum, ...sh]) => sh.map(([month, tpr, special], i) => ({ key: m, label: m, shift: ['주', '야', '휴'][i], cum, month, tpr, special })));
const HB = L.calcHourBilling(INV_LINES, { rate: '24,400' });
test('줄별 기성금액이 청구서와 같음', () => {
  const amt = HB.lines.map(l => l.amount);
  assert.deepEqual(amt, [1122400, 987224, 0, 854000, 1858304, 0, 3220800, 4413472, 0, 2171600, 2380952, 253760, 451400, 987224, 0, 1098000, 2613240, 0, 1037000, 1451800, 0]);
});
test('소계: 야간 (31+1.5+1.5)×1.19 = 40.46, 휴일 (7+0.5+0.5)×1.3 = 10.4', () => {
  assert.equal(HB.lines[1].subtotal, 40.46);
  assert.equal(HB.lines[11].subtotal, 10.4);
});
test('계: 금월 848.0 · TPR 46.5 · 특화 27.5 · 소계 1,020.5 · 기성금액 24,901,176원', () => {
  assert.equal(HB.totals.month, 848);
  assert.equal(HB.totals.tpr, 46.5);
  assert.equal(HB.totals.special, 27.5);
  assert.equal(Math.round(HB.totals.subtotal * 10) / 10, 1020.5);
  assert.equal(HB.totals.amount, 24901176);
});
test('단가가 비면 금액을 만들지 않음', () => {
  const b = L.calcHourBilling(INV_LINES, {});
  assert.equal(b.missingRate, true);
  assert.equal(b.lines[0].amount, null);
});
test('일지 → 청구서 줄: 기간 안 주/야/휴별 합, 누적은 기간 끝까지, 특화 = 배터리 점검 + 장비수리', () => {
  const rs = [
    row({ date: '2026-07-31', model: 'X', driver: 'a', shift: '주', run_hours: 10, inspect_h: 0.5 }),
    row({ date: '2026-08-03', model: 'X', driver: 'a', shift: '주간', run_hours: 7.5, inspect_h: 0.5, battery_check_h: 0.5 }),
    row({ date: '2026-08-03', model: 'X', driver: 'b', shift: '야', run_hours: 7.5, inspect_h: 0.5, special_h: 1 }),
    row({ date: '2026-08-04', model: 'X', driver: 'a', shift: '', run_hours: 4 }),
    row({ date: '2026-08-08', model: 'X', driver: 'c', shift: '휴', run_hours: 3.5 }),
    row({ date: '2026-09-01', model: 'X', driver: 'a', shift: '주', run_hours: 9 })
  ];
  const ls = L.hourBillingLines(rs, { x: { model: 'X', project: 'P-1' } }, '2026-08-01', '2026-08-31');
  assert.deepEqual(ls.map(l => [l.shift, l.month, l.tpr, l.special, l.cum, l.project]),
    [['주', 11.5, 0.5, 0.5, 32.5, 'P-1'], ['야', 7.5, 0.5, 1, 32.5, 'P-1'], ['휴', 3.5, 0, 0, 32.5, 'P-1']]);
  const st = L.hourBillingStatus(rs, { x: { model: 'X', targetHours: 30 } }, '2026-08-01', '2026-08-31');
  assert.deepEqual(st, { days: 3, drivers: 3, hours: 22.5, done: ['X'] });
});
test('청구서 엑셀: 모델마다 3줄 + 계, 기성금액 문구, 모델별 상세 시트', () => {
  const sh = L.hourBillingSheets(HB, { company: '예시 업체', from: '2025-05-06', to: '2025-05-30', status: { days: 19, drivers: 6, hours: 848, done: ['기종B'] } }, [], {});
  const a = sh['청구서'].aoa;
  assert.equal(a[3][0], '3. 기성금액 : ₩24,901,176 (VAT 별도)');
  assert.equal(a[2][0], '2. 기간 : 2025.05.06 ~ 2025.05.30');
  const total = a.find(r => r[0] === '계');
  assert.deepEqual([total[4], total[8], total[10]], [848, 1020.5, 24901176]);
  assert.equal(Object.keys(sh).length, 1 + 7);
  assert.ok(a.some(r => r[0] === '  4) 완료 모델: 총 1모델 시험 종료-기종B'));
});

console.log('기성처리 ② 연료비 정산');
// 사진 4(연료 주입 청구서): LPG 930kg·765kg × 2,505원/kg
const FL = [
  { key: 'a', label: '기종D #1', fuel: 'LPG', unit: 'kg', cum: 1000, month: 288.5, qty: 930, bottles: 0, urea: 0 },
  { key: 'b', label: '기종D #2', fuel: 'LPG', unit: 'kg', cum: 404, month: 179, qty: 765, bottles: 0, urea: 0 }
];
test('930×2,505 = 2,329,650 · 765×2,505 = 1,916,325 · 계 4,245,975원 · 비고 62통/51통', () => {
  const b = L.calcFuelBilling(FL, { LPG: { price: '2,505' } });
  assert.deepEqual(b.lines.map(l => l.amount), [2329650, 1916325]);
  assert.equal(b.totals.amount, 4245975);
  assert.equal(b.totals.qty.LPG, 1695);
  assert.deepEqual(b.lines.map(l => l.note), ['62통', '51통']);
  const sh = L.fuelBillingSheets(b, { from: '2025-04-30', to: '2025-05-30' }, [], {}, { LPG: { price: 2505 } });
  assert.equal(sh['청구서'].aoa[3][0], '3. 주유 금액 : ₩4,245,975 (VAT 포함)');
});
test('단가가 비면 금액 없음(가격을 지어내지 않음)', () => {
  const b = L.calcFuelBilling(FL, {});
  assert.deepEqual(b.missingPrice, ['LPG']);
  assert.equal(b.totals.amount, 0);
});
test('일지 → 연료 줄: 연료 칸이 비면 모델 정보의 연료, 기간 밖 제외, 요소수는 비고', () => {
  const rs = [
    row({ date: '2026-08-03', model: 'G', driver: 'a', run_hours: 7, fuel_qty: 45 }),
    row({ date: '2026-08-05', model: 'G', driver: 'a', run_hours: 6, fuel_type: 'LPG', fuel_qty: 30 }),
    row({ date: '2026-09-01', model: 'G', driver: 'a', run_hours: 6, fuel_qty: 99 }),
    row({ date: '2026-08-05', model: 'D', driver: 'a', run_hours: 6, fuel_type: '경유', fuel_qty: 150.5, urea_l: 20 })
  ];
  const ls = L.fuelBillingLines(rs, { g: { model: 'G', fuel: 'LPG' } }, '2026-08-01', '2026-08-31');
  assert.deepEqual(ls.map(l => [l.label, l.fuel, l.qty, l.month, l.cum]), [['D', '경유', 150.5, 6, 6], ['G', 'LPG', 75, 13, 13]]);
  const b = L.calcFuelBilling(ls, { LPG: { price: 2000 }, '경유': { price: 1500 } });
  assert.deepEqual(b.lines.map(l => [l.amount, l.note]), [[225750, '요소수 20.0L'], [150000, '5통']]);
});
test('숫자 표기', () => {
  assert.equal(L.fmtNum(24901176, 0), '24,901,176');
  assert.equal(L.fmtNum(1020.54), '1,020.5');
  assert.equal(L.fmtNum(-3.25, 1), '-3.3');
  assert.equal(L.prevMonthRange('2026-09-29').from, '2026-08-01');
  assert.equal(L.prevMonthRange('2026-01-15').to, '2025-12-31');
});
test('예시 데이터: 모델 정보 3개, 야간 일지·목표 도달 모델 포함', () => {
  const M = Sample.masters();
  assert.equal(Object.keys(M).length, 3);
  assert.ok(S.some(r => r.shift === '야'));
  const st = L.hourBillingStatus(S, M, '2026-08-01', '2026-08-31');
  assert.deepEqual(st.done, ['DEMO-L30(예시) 1호기']);
});

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' · 실패 있음' : ''));
