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
    { label: '지게차 충전(점심)', start: 41, end: 84 }, { label: '기본/요철 (2hr)', start: 84, end: 64 },
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
  assert.ok(mail.subject.includes('2025-07-29(화) 기준'));
  assert.ok(mail.body.includes('내구시험일지(PDF) 11장 — MODEL-Y #1 11장')); // 07-23 주·야, 24 주·야, 25 주·야, 26 휴, 28 주·야, 29 주 = 10장 + 문제점 일지 1장
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
test('일지 → 연료 줄: 연료 칸이 비면 모델 정보의 연료, 기간 밖 제외, 요소수는 따로 청구 줄', () => {
  const rs = [
    row({ date: '2026-08-03', model: 'G', driver: 'a', run_hours: 7, fuel_qty: 45 }),
    row({ date: '2026-08-05', model: 'G', driver: 'a', run_hours: 6, fuel_type: 'LPG', fuel_qty: 30 }),
    row({ date: '2026-09-01', model: 'G', driver: 'a', run_hours: 6, fuel_qty: 99 }),
    row({ date: '2026-08-05', model: 'D', driver: 'a', run_hours: 6, fuel_type: '경유', fuel_qty: 150.5, fuel_won: 225750, urea_l: 20, urea_won: 24000 })
  ];
  const ls = L.fuelBillingLines(rs, { g: { model: 'G', fuel: 'LPG' } }, '2026-08-01', '2026-08-31');
  assert.deepEqual(ls.map(l => [l.label, l.fuel, l.qty, l.month, l.cum]), [['D', '경유', 150.5, 6, 6], ['D', '요소수', 20, 6, 6], ['G', 'LPG', 75, 13, 13]]);
  // 경유·요소수는 결제 금액 그대로(단가를 곱하지 않음), LPG 는 75kg × 2,000원
  const b = L.calcFuelBilling(ls, { LPG: { price: 2000 } });
  assert.deepEqual(b.lines.map(l => [l.amount, l.note]), [[225750, '카드 결제 1회'], [24000, '카드 결제 1회'], [150000, '5통']]);
  assert.equal(b.totals.amount, 399750); // 225,750 + 24,000 + 150,000
  assert.deepEqual(L.calcFuelBilling(ls, {}).missingPrice, ['LPG 2026-08 단가']);
  const sh = L.fuelBillingSheets(b, { from: '2026-08-01', to: '2026-08-31' }, rs, {}, { LPG: { price: 2000 } });
  // 기종 한 장에 연료·요소수(받은 양식 「기종별 연료 주입 현황」처럼)
  assert.deepEqual(Object.keys(sh), ['청구서', 'D', 'G', '단가']);
  assert.deepEqual(sh['단가'].aoa.map(r => r[0]), ['구분', 'LPG', '경유', '요소수']);
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

console.log('2026-09-29 오후 수강생 답 반영');
test('목표 가동시간 기본 1000h, 특화 +500h = 1500h, 직접 적으면 그 값', () => {
  assert.equal(L.normMaster({ model: 'A' }).targetHours, 1000);
  assert.equal(L.normMaster({ model: 'A' }).targetDefault, true);
  assert.equal(L.normMaster({ model: 'A', extended: true }).targetHours, 1500);
  assert.equal(L.normMaster({ model: 'A', targetHours: '200 hr' }).targetHours, 200);
  const rep = L.weeklyReport([row({ date: '2026-09-01', model: 'N', driver: 'x', run_hours: 250 })], {}, '2026-09-01');
  assert.equal(rep.models[0].target, 1000);
  assert.equal(rep.models[0].ratio, 0.25);
});
test('과급은 계약 고정값 야간 19% · 휴일 30%', () => {
  assert.deepEqual(L.DEFAULT_SURCHARGE, { '주': 0, '야': 19, '휴': 30 });
});
test('정리 엑셀 「특화 장비 수리」 열 → 특화 시험 칸', () => {
  assert.equal(L.matchField('특화 장비 수리'), 'special_h');
  assert.equal(L.matchField('특회 장비 수리'), 'special_h');
});
test('주간 보고 기준일 기본값 = 오늘을 포함한 가장 최근 수요일', () => {
  assert.equal(L.lastWednesday('2026-09-29'), '2026-09-23'); // 화
  assert.equal(L.lastWednesday('2026-09-30'), '2026-09-30'); // 수
  assert.equal(L.lastWednesday('2026-10-04'), '2026-09-30'); // 일
});
test('문제점 즉시 알림 메일: 모델·발생 시각·문제점·점검 「유」 항목·사진', () => {
  const r = L.tprToRow({ ...TPR, problems: [{ text: '마스트 좌측 체인 소음이 커져 점검이 필요함(30자 넘는 문장 예시)', note: '사진1' }], checks: ['무', '유'], photo: 'IMG_01.jpg' });
  const m = L.issueAlertMail(r, { cum: 945.5, target: 1000 });
  assert.ok(m.subject.startsWith('[내구시험 문제점] MODEL-X #4 2025-01-03(주) — 마스트'));
  assert.ok(m.subject.endsWith('…'));
  assert.ok(m.body.includes('■ 발생: 2025-01-03(금) 주간'));
  assert.ok(m.body.includes('■ 누적 가동시간: 945.5h / 목표 1,000.0h'));
  assert.ok(m.body.includes('   1) 마스트 좌측 체인'));
  assert.ok(m.body.includes('② 유압/동력전달'));
  assert.ok(!m.body.includes('① 성능'));
  assert.ok(m.body.includes('첨부: 현장 사진 (IMG_01.jpg)'));
});

console.log('\n휴일·기성 마감 (09-29 오후 늦게 답변)');
const HOL = L.parseHolidays(L.defaultHolidayText([2026])).map;
test('공휴일 초안: 2026년 양력 고정 8일 + 음력·대체·선거 12일 = 20줄, 사용자가 고친 글자를 읽음', () => {
  const t = L.defaultHolidayText([2026]);
  assert.equal(t.split('\n').length, 20);
  assert.ok(t.includes('2026-09-25 추석'));
  const p = L.parseHolidays('2026-09-24 추석 연휴\n2026.10.9, 한글날\n회사 창립일\n# 주석 줄\n\n2026-05-01');
  assert.deepEqual(p.map, { '2026-09-24': '추석 연휴', '2026-10-09': '한글날', '2026-05-01': '공휴일' });
  assert.deepEqual(p.bad, ['회사 창립일']);
});
test('마감일 = 근무일 기준 월 말일: 사진 속 기간 끝 05.30(금)·04.30(수)과 같음', () => {
  assert.equal(L.lastWorkday(2025, 5, {}), '2025-05-30'); // 5/31 토
  assert.equal(L.lastWorkday(2025, 4, {}), '2025-04-30');
  assert.equal(L.lastWorkday(2026, 9, HOL), '2026-09-30');
  assert.equal(L.lastWorkday(2026, 5, HOL), '2026-05-29'); // 5/31 일, 5/30 토
  assert.equal(L.lastWorkday(2026, 2, HOL), '2026-02-27');
  // 말일이 공휴일이면 그 앞 근무일 — 목록은 사용자가 고친 대로
  assert.equal(L.lastWorkday(2026, 9, { ...HOL, '2026-09-30': '회사 휴무' }), '2026-09-29');
});
test('기성 기간 = 전달 마감일 다음 날 ~ 이달 마감일, 오늘이 마감일을 지나면 다음 기간', () => {
  assert.deepEqual(L.closingPeriodOf('2026-10', HOL), { month: '2026-10', from: '2026-10-01', to: '2026-10-30', cutoff: '2026-10-30' });
  assert.deepEqual(L.closingPeriodOf('2026-06', HOL), { month: '2026-06', from: '2026-05-30', to: '2026-06-30', cutoff: '2026-06-30' });
  assert.equal(L.openClosingPeriod('2026-09-29', HOL).to, '2026-09-30');
  assert.equal(L.openClosingPeriod('2026-09-30', HOL).to, '2026-09-30');
  assert.equal(L.openClosingPeriod('2026-05-30', HOL).month, '2026-06');
});
test('휴일은 날짜로: 토·일·공휴일 → 휴(30%), 평일은 적힌 주/야(휴라고 적혀도 주간)', () => {
  assert.deepEqual(L.dayKind('2026-09-26', HOL), { kind: '공휴일', name: '추석 연휴' });
  assert.equal(L.dayKind('2026-10-10', HOL).kind, '토');
  const b = (date, shift, hol = HOL) => L.billShift({ date, shift }, hol);
  assert.equal(b('2026-10-10', '주'), '휴');
  assert.equal(b('2026-10-10', ''), '휴');
  assert.equal(b('2026-10-06', '휴'), '주');
  assert.equal(b('2026-10-06', '야'), '야');
  assert.equal(b('2026-10-09', '주'), '휴');      // 한글날(금)
  assert.equal(b('2026-10-09', '주', {}), '주');  // 목록에서 빼면 평일
});
test('휴일 근무 경고: 토요일 주간만 정상, 일요일·공휴일·휴일 야간·평일 「휴」는 확인', () => {
  const c = (date, shift) => L.holidayWorkIssues({ date, shift }, HOL).map(i => i.code);
  assert.deepEqual(c('2026-10-10', '주'), []);
  assert.deepEqual(c('2026-10-10', '야'), ['holiday_night']);
  assert.deepEqual(c('2026-10-11', '주'), ['holiday_not_saturday']);
  assert.deepEqual(c('2026-10-11', '야'), ['holiday_not_saturday', 'holiday_night']);
  assert.deepEqual(c('2026-09-24', '주'), ['holiday_not_saturday']); // 추석 연휴(목)
  assert.deepEqual(c('2026-10-06', '휴'), ['holiday_on_workday']);
  assert.deepEqual(c('2026-10-06', '주'), []);
  const v = L.validateRows([row({ date: '2026-10-11', model: 'X', driver: 'a', run_hours: 3 })], { holidays: HOL });
  assert.deepEqual(v.map(i => i.code), ['holiday_not_saturday']);
});
test('운전시간 청구서 과급 구분도 날짜로: 주 11h·휴 11h → 110,000 + 143,000 = 253,000원(단가 10,000)', () => {
  const rs = [
    row({ date: '2026-10-02', model: 'X', driver: 'a', shift: '주', run_hours: 8 }),
    row({ date: '2026-10-03', model: 'X', driver: 'a', shift: '주', run_hours: 4 }),  // 토·개천절
    row({ date: '2026-10-10', model: 'X', driver: 'a', shift: '주', run_hours: 5 }),  // 토
    row({ date: '2026-10-06', model: 'X', driver: 'a', shift: '휴', run_hours: 3 }),  // 평일인데 휴 → 주
    row({ date: '2026-10-09', model: 'X', driver: 'a', shift: '주', run_hours: 2 })   // 한글날(금)
  ];
  const ls = L.hourBillingLines(rs, {}, '2026-10-01', '2026-10-30', { holidays: HOL });
  assert.deepEqual(ls.map(l => [l.shift, l.month]), [['주', 11], ['야', 0], ['휴', 11]]);
  assert.equal(L.calcHourBilling(ls, { rate: 10000 }).totals.amount, 253000); // 11×10,000 + 11×1.3×10,000
  // 공휴일 목록 없이: 한글날이 평일 → 주 13h·휴 9h → 130,000 + 117,000
  assert.equal(L.calcHourBilling(L.hourBillingLines(rs, {}, '2026-10-01', '2026-10-30'), { rate: 10000 }).totals.amount, 247000);
});
const PX = [
  row({ date: '2026-10-01', model: 'X', driver: 'a', shift: '주', run_hours: 8, fuel_type: '경유' }),
  row({ date: '2026-10-30', model: 'X', driver: 'a', shift: '주', run_hours: 6, fuel_type: '경유', fuel_qty: 20, fuel_won: 30000 })
];
test('마감일 가입력 → 가동 후 확정: 예상치를 남기고 차이를 보여 줌(가동 6 → 8.5h, 경유 20 → 30L)', () => {
  const pre = L.applyProvisional(PX[1], null, true, '2026-10-30');
  assert.equal(pre.provisional, true);
  assert.equal(pre.estimate.run_hours, 6);
  assert.equal(pre.estimate.fuel_qty, 20);
  assert.ok(L.validateRows([pre]).some(i => i.code === 'provisional'));
  const fin = L.applyProvisional({ ...pre, run_hours: 8.5, fuel_qty: 30 }, pre, false, '2026-11-02');
  assert.equal(fin.provisional, undefined);
  assert.equal(fin.confirmed_at, '2026-11-02');
  assert.equal(fin.estimate.run_hours, 6);
  // 확정 뒤 다시 고쳐도 예상치·확정일은 유지
  const again = L.applyProvisional({ ...fin, issue: '메모' }, fin, false, '2026-11-05');
  assert.equal(again.confirmed_at, '2026-11-02');
  const rep = L.provisionalReport([PX[0], fin], '2026-10-01', '2026-10-30');
  assert.equal(rep.pending.length, 0);
  assert.equal(rep.changed, 1);
  assert.deepEqual(rep.confirmed[0].diffs.filter(d => d.diff).map(d => [d.key, d.est, d.fin, d.diff]), [['run_hours', 6, 8.5, 2.5], ['fuel_qty', 20, 30, 10]]);
  assert.equal(L.provisionalReport([PX[0], pre], '2026-10-01', '2026-10-30').pending.length, 1);
});
test('마감 제출분 vs 확정: 금월 14 → 16.5h, 기성금액 140,000 → 165,000원, 주유 30,000 → 45,000원', () => {
  const pre = L.applyProvisional(PX[1], null, true, '2026-10-30');
  const fin = L.applyProvisional({ ...pre, run_hours: 8.5, fuel_qty: 30, fuel_won: 45000 }, pre, false, '2026-11-02');
  const d = L.closingDiff([PX[0], fin], {}, '2026-10-01', '2026-10-30', { holidays: HOL, rate: 10000, prices: { 경유: { price: 1500 } } });
  assert.deepEqual(d.hours, { est: 14, fin: 16.5, diff: 2.5 });
  assert.deepEqual(d.amount, { est: 140000, fin: 165000, diff: 25000 });
  assert.deepEqual(d.fuel['경유'], { est: 20, fin: 30, diff: 10 });
  assert.deepEqual(d.fuelAmount, { est: 30000, fin: 45000, diff: 15000 });
  const sh = L.provisionalSheet(L.provisionalReport([PX[0], fin], '2026-10-01', '2026-10-30'), d).aoa;
  assert.ok(sh.some(r => r[4] === '기성금액(원)' && r[7] === 25000));
  assert.ok(sh.some(r => r[0] === '2026-10-30' && r[3] === '확정(2026-11-02)' && r[7] === 2.5));
});
test('마감 준비 체크리스트: 기간 중엔 빠진 근무일·휴일 근무·단가를 미리, 마감 뒤엔 가입력 확정', () => {
  const base = ['01', '02', '06', '07', '08', '12', '13'].map(d => row({ date: '2026-10-' + d, model: 'X', driver: 'a', shift: '주', run_hours: 8 }));
  const sun = row({ date: '2026-10-11', model: 'X', driver: 'a', shift: '주', run_hours: 4 });
  const masters = { 'X|': { model: 'X', project: 'P-1' } };
  const st = (list, key) => list.find(i => i.key === key);
  const mid = L.closingChecklist({ rows: [...base, sun], masters, from: '2026-10-01', to: '2026-10-30', cutoff: '2026-10-30', today: '2026-10-15', holidays: HOL });
  // 근무일 10/1~10/14: 1·2·6·7·8·12·13·14 (3 토, 5 대체공휴일, 9 한글날 제외) → 14일만 빠짐
  assert.equal(st(mid, 'gaps').state, 'todo');
  assert.equal(st(mid, 'gaps').detail, 'X 1일(10-14)');
  assert.equal(st(mid, 'holiday').state, 'todo');
  assert.equal(st(mid, 'rate').state, 'todo');
  assert.equal(st(mid, 'project').state, 'ok');
  assert.equal(st(mid, 'cutoff').state, 'wait');
  assert.equal(st(mid, 'confirm').state, 'ok');
  const cut = L.applyProvisional(row({ date: '2026-10-30', model: 'X', driver: 'a', shift: '주', run_hours: 6 }), null, true, '2026-10-30');
  const after = L.closingChecklist({ rows: [...base, cut], masters, from: '2026-10-01', to: '2026-10-30', cutoff: '2026-10-30', today: '2026-11-02', holidays: HOL, rate: 10000 });
  assert.equal(st(after, 'cutoff').state, 'ok');
  assert.equal(st(after, 'confirm').state, 'todo');
  assert.equal(st(after, 'rate').state, 'ok');
});
test('예시 데이터: 지난달 마감일(08-31 월) 가입력 → 09-01 확정 1장, 가동 차이 +1.5h', () => {
  const rep = L.provisionalReport(S, '2026-08-01', '2026-08-31');
  assert.equal(rep.pending.length, 0);
  assert.equal(rep.confirmed.length, 1);
  assert.equal(rep.confirmed[0].date, '2026-08-31');
  assert.equal(rep.confirmed[0].confirmed_at, '2026-09-01');
  assert.equal(rep.confirmed[0].diffs.find(d => d.key === 'run_hours').diff, 1.5);
});
test('청구서 상세 시트: 과급 구분은 날짜 기준(토요일 「주」 → 휴일(토)), 가입력 표시', () => {
  const rs = [row({ date: '2026-10-10', model: 'X', driver: 'a', shift: '주', run_hours: 5 }),
    { ...L.applyProvisional(row({ date: '2026-10-30', model: 'X', driver: 'a', shift: '주', run_hours: 6 }), null, true, '2026-10-30') }];
  const b = L.calcHourBilling(L.hourBillingLines(rs, {}, '2026-10-01', '2026-10-30', { holidays: HOL }), {});
  const sh = L.hourBillingSheets(b, { from: '2026-10-01', to: '2026-10-30', holidays: HOL, status: { days: 2, drivers: 1, hours: 11, done: [] } }, rs, {});
  const d = sh['X'].aoa;
  assert.deepEqual(d.find(r => r[0] === '2026-10-10').slice(1, 3), ['주', '휴일(토)']);
  assert.equal(d.find(r => r[0] === '2026-10-30')[10], '가입력(예상치)');
});
test('외부 AI 에 올리는 TPR 은 하루 2장까지(여러 장은 대외비)', () => {
  let log = {};
  assert.deepEqual(L.aiPageAllowance(log, '2026-09-29'), { used: 0, left: 2, ok: true, limit: 2 });
  log = L.recordAiPage(log, '2026-09-29');
  log = L.recordAiPage(log, '2026-09-29');
  assert.equal(L.aiPageAllowance(log, '2026-09-29').ok, false);
  assert.equal(L.aiPageAllowance(log, '2026-09-29').left, 0);
  assert.equal(L.aiPageAllowance(log, '2026-09-30').ok, true);
  assert.deepEqual(L.recordAiPage(log, '2026-09-30'), { '2026-09-30': 1 });
});

console.log('2026-09-30 — 기간 직접 입력·결제 금액 정산·회사 휴무일·날짜↔요일');
// 사진(2026-09-30 게시물): 연료 주입 청구서 기간 2025.05.27 ~ 06.30. 모델명·과제번호는 사내 정보라 가명(기종F=경유, 기종G=LPG).
// 경유 기종: 주입 12회, 카드 결제 금액 합계 3,137,560원 · 2,020ℓ · 금월 359.5h(총누적 373.0 — 기간 전 13.5h)
const DIESEL = [
  ['05-27', '주', 9.5, 60, 94000], ['05-27', '야', 9.5], ['05-28', '주', 9.5, 207, 322000], ['05-28', '야', 9.5], ['05-29', '주', 8], ['05-29', '야', 9.5],
  ['05-30', '주', 9.5, 196, 306000], ['05-30', '야', 9.5], ['06-02', '주', 9.5], ['06-02', '야', 9.5], ['06-04', '주', 9.5, 254, 394000], ['06-04', '야', 9.5],
  ['06-05', '주', 9.5], ['06-05', '야', 9.5], ['06-09', '주', 9.5, 105, 163000], ['06-09', '야', 9.5], ['06-10', '주', 9.5], ['06-10', '야', 9.5],
  ['06-11', '주', 9.5, 262, 406000], ['06-11', '야', 9.5], ['06-12', '주', 9.5], ['06-12', '야', 9.5], ['06-13', '주', 9.5, 188, 291000], ['06-13', '야', 9.5],
  ['06-16', '주', 9.5], ['06-16', '야', 9.5], ['06-17', '주', 9.5, 40, 61560], ['06-17', '야', 9.5], ['06-18', '주', 9.5, 239, 368000], ['06-18', '야', 9.5],
  ['06-19', '주', 9.5], ['06-19', '야', 9.5], ['06-20', '주', 0, 223, 343000], ['06-24', '야', 9.5], ['06-25', '주', 9.5, 77, 122000], ['06-25', '야', 9.5],
  ['06-26', '주', 9.5], ['06-26', '야', 9.5], ['06-27', '주', 9.5, 169, 267000]
];
// LPG 기종: 교대마다 kg 사용량만 적음. 525kg × 오피넷 6월 평균 2,484원/kg = 1,304,100원, 35통
const LPGD = [
  ['06-17', '주', 0, 15], ['06-18', '주', 9, 30], ['06-18', '야', 9, 30], ['06-19', '주', 9, 30], ['06-19', '야', 9, 45], ['06-20', '주', 9, 15], ['06-20', '야', 9, 30],
  ['06-23', '주', 9, 30], ['06-23', '야', 9, 45], ['06-24', '주', 9, 30], ['06-24', '야', 2, 15], ['06-25', '주', 4, 30], ['06-25', '야', 2, 30],
  ['06-26', '주', 9, 15], ['06-26', '야', 6, 30], ['06-27', '주', 2, 15], ['06-27', '야', 7.5, 30], ['06-30', '주', 2, 30], ['06-30', '야', 2, 30]
];
const FROWS = [row({ date: '2025-05-20', model: '기종F', unit_no: '#1', driver: 'a', shift: '주', run_hours: 13.5, fuel_type: '경유' })]
  .concat(DIESEL.map(([d, sh, h, q, w]) => row({ date: '2025-' + d, model: '기종F', unit_no: '#1', driver: 'a', shift: sh, run_hours: h, fuel_type: '경유', fuel_qty: q, fuel_won: w })))
  .concat(LPGD.map(([d, sh, h, q]) => row({ date: '2025-' + d, model: '기종G', unit_no: '#1', driver: 'b', shift: sh, run_hours: h, fuel_type: 'LPG', fuel_qty: q })));
const LPG_M = { '2025-06': { price: '2,484', source: '오피넷 월 평균' } };
test('사진 재현: 경유 3,137,560원(결제 금액 합) + LPG 525kg × 2,484 = 1,304,100원 → 4,441,660원 · 35통', () => {
  const ls = L.fuelBillingLines(FROWS, {}, '2025-05-27', '2025-06-30');
  const b = L.calcFuelBilling(ls, {}, { lpgMonthly: LPG_M });
  assert.deepEqual(b.lines.map(l => [l.label, l.fuel, l.cum, l.month, l.qty, l.amount, l.note]),
    [['기종F #1', '경유', 373, 359.5, 2020, 3137560, '카드 결제 12회'], ['기종G #1', 'LPG', 117.5, 117.5, 525, 1304100, '35통']]);
  assert.equal(b.lines[1].price, 2484);
  assert.equal(b.totals.amount, 4441660);
  assert.deepEqual(b.missingPrice, []);
  const sh = L.fuelBillingSheets(b, { from: '2025-05-27', to: '2025-06-30', lpgMonthly: LPG_M }, FROWS, {}, {});
  const a = sh['청구서'].aoa;
  assert.equal(a[3][0], '3. 주유 금액 : ₩4,441,660 (VAT 포함)');
  assert.deepEqual(a.find(r => r[0] === 1).slice(5, 8), [2020, '-', 3137560]);  // 경유는 단가 칸 「-」
  // 기종별 현황: 기종의 실제 첫·끝 날(경유 05.27 ~ 06.27, LPG 06.17 ~ 06.30), 소계·합계
  const f = sh['기종F #1'].aoa;
  assert.equal(f[2][0], '2. 기간 : 2025.05.27 ~ 2025.06.27');
  assert.deepEqual(f.find(r => r[0] === '소계 (경유, VAT 포함)').slice(3, 8), [359.5, 2020, '', '-', 3137560]);
  assert.deepEqual(f.find(r => r[0] === '합계(VAT 포함)')[7], 3137560);
  const g = sh['기종G #1'].aoa;
  assert.equal(g[2][0], '2. 기간 : 2025.06.17 ~ 2025.06.30');
  assert.deepEqual(g.find(r => r[0] === '소계 (LPG, VAT 포함)').slice(4, 8), [525, '', 2484, 1304100]);
  assert.deepEqual(sh['단가'].aoa[1], ['LPG', '2025-06', 2484, '원/kg', '오피넷 월 평균', '']);
  assert.ok(a.some(r => /LPG \/ 경유 대장 : 각 1매 \(입고·주유 대장 스캔본을 따로 첨부\)/.test(r[0])));
});
test('LPG 가 두 달에 걸치면 달별 단가: 5월 30kg × 2,500 + 6월 45kg × 2,484 = 75,000 + 111,780 = 186,780원', () => {
  const rs = [row({ date: '2025-05-30', model: 'H', driver: 'a', run_hours: 9, fuel_type: 'LPG', fuel_qty: 30 }),
    row({ date: '2025-06-02', model: 'H', driver: 'a', run_hours: 9, fuel_type: 'LPG', fuel_qty: 45 })];
  const ls = L.fuelBillingLines(rs, {}, '2025-05-27', '2025-06-30');
  const b = L.calcFuelBilling(ls, {}, { lpgMonthly: { '2025-05': { price: 2500 }, '2025-06': { price: 2484 } } });
  assert.equal(b.lines[0].amount, 186780);
  assert.equal(b.lines[0].price, null); // 두 달 단가가 달라 한 값으로 적지 않음(엑셀 「월별」)
  assert.deepEqual(L.calcFuelBilling(ls, {}, { lpgMonthly: { '2025-06': { price: 2484 } } }).missingPrice, ['LPG 2025-05 단가']);
});
test('경유 결제 금액이 빈 주입이 있으면 합계를 막고 몇 건인지 알림(리터 × 단가로 채우지 않음)', () => {
  const rs = [row({ date: '2025-06-02', model: 'K', driver: 'a', run_hours: 9, fuel_type: '경유', fuel_qty: 60, fuel_won: 94000 }),
    row({ date: '2025-06-03', model: 'K', driver: 'a', run_hours: 9, fuel_type: '경유', fuel_qty: 50 }),
    row({ date: '2025-06-03', model: 'K', driver: 'a', run_hours: 1, urea_l: 10 })];
  const b = L.calcFuelBilling(L.fuelBillingLines(rs, {}, '2025-06-01', '2025-06-30'), { 경유: { price: 1500 } });
  assert.deepEqual(b.missingPrice, ['경유 결제 금액(빈 주입 1건)', '요소수 결제 금액(빈 주입 1건)']);
  assert.equal(b.lines[0].amount, 94000);
  const list = L.closingChecklist({ rows: rs, masters: {}, from: '2025-06-01', to: '2025-06-30', today: '2025-07-01', rate: 1 });
  assert.equal(list.find(i => i.key === 'prices').state, 'todo');
});
test('날짜 ↔ 요일: 1/30(목)인데 「금」 → 요일이 맞는 1/3 을 후보로, 맞으면 조용히', () => {
  const c = L.dateWeekdayCheck('2025-01-30', '금');
  assert.equal(c.mismatch, true);
  assert.deepEqual(c.candidates, ['2025-01-03']);
  assert.equal(L.dateWeekdayCheck('2025-01-03', '(금)').mismatch, false);
  assert.equal(L.dateWeekdayCheck('2025-01-03', '').mismatch, false); // 요일을 안 적었으면 검사하지 않음
  assert.deepEqual(['일요일', '(월)', 'Tue', '?'].map(L.normDow), ['일', '월', '화', '']);
  // 3 을 8 로 읽음: 06-08(일)인데 「화」 → 06-03(화)
  assert.deepEqual(L.dateWeekdayCheck('2025-06-08', '화').candidates, ['2025-06-03']);
  // AI 답에 요일이 있으면 같은 검사를 경고로
  const res = L.tprFromAi('{"date":"2025-01-30","dow":"금","model":"M"}');
  assert.ok(res.warnings.some(w => /01\/03/.test(w)));
  assert.equal(L.tprToRow(res.form).dow, '금');
  assert.ok(/요일과 맞는지/.test(L.tprPrompt()));
  // 현황 데이터 검사에도 경고로 남음
  const vr = row({ date: '2025-01-30', model: 'M', driver: 'a', run_hours: 1 }); vr.dow = '금';
  assert.ok(L.validateRows([vr]).some(i => i.code === 'dow_mismatch'));
});
test('회사 휴무일: 근로자의 날 초안 + 휴가 기간(시작~끝) → 휴일 판정·마감일에 반영', () => {
  assert.equal(L.defaultCompanyHolidayText([2026]), '2026-05-01 근로자의 날');
  const p = L.parseHolidays('2026-07-29~07-31 하계 휴가\n2026-05-01 근로자의 날');
  assert.deepEqual(Object.keys(p.map), ['2026-07-29', '2026-07-30', '2026-07-31', '2026-05-01']);
  assert.equal(L.dayKind('2026-07-30', p.map).name, '하계 휴가');
  // 2026-07-31(금)이 휴가라 7월 마감일은 07-28(화)
  assert.equal(L.lastWorkday(2026, 7, p.map), '2026-07-28');
  assert.equal(L.lastWorkday(2026, 7, {}), '2026-07-31');
  assert.deepEqual(L.parseHolidays('2026-08-10~2026-08-01 거꾸로').bad.length, 1);
});
test('배터리 구간 이름 「지게차 충전(정심)」 → 「(점심)」, 예전 일지도 고쳐 보임', () => {
  assert.ok(L.BATTERY_SEGMENTS.includes('지게차 충전(점심)'));
  assert.equal(L.rowToTpr({ battery: [{}, {}, { label: '지게차 충전(정심)', start: 41, end: 84 }] }).battery[2].label, '지게차 충전(점심)');
});

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' · 실패 있음' : ''));
