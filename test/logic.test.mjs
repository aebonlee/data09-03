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

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' · 실패 있음' : ''));
