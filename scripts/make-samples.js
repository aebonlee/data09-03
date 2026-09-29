// 예시 파일 생성: node scripts/make-samples.js
// js/sample-data.js 를 2026-09-28 기준 날짜로 풀어 samples/ 에 씁니다(모두 가상 데이터).
//  - 표준_현황엑셀_빈양식.xlsx      : 표준 열 머리행 + 작성 안내
//  - 예시데이터_표준현황.xlsx / .csv : 표준 열 그대로
//  - 예시데이터_모델별엑셀.xlsx     : 모델마다 시트 하나, 열 이름이 표준과 다르고 모델 열이 없음
//                                     (「열 맞추기」와 「시트 이름을 모델로」를 시험하는 용도)
//  - 예시데이터_시험일지정리.xlsx   : 2026-09-29 받은 정리 엑셀 배치(위 4줄 모델 정보 + 6번째 줄 열 이름)를 따른 모델별 시트
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const rows = Sample.build(new Date(2026, 8, 28));

function book(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return wb;
}
function write(name, sheets) { fs.writeFileSync(path.join(out, name), XLSX.write(book(sheets), { bookType: 'xlsx', type: 'buffer' })); }

write('표준_현황엑셀_빈양식.xlsx', L.templateSheets());
write('예시데이터_표준현황.xlsx', { '현황': L.standardSheet(rows) });
fs.writeFileSync(path.join(out, '예시데이터_표준현황.csv'), L.aoaToCsv(L.standardSheet(rows)));

// 모델별 엑셀: 담당자가 모델마다 따로 쓰던 형태를 흉내 낸 것(열 이름은 지어낸 가정)
const perModel = {};
for (const m of Sample.MODELS) {
  const mine = rows.filter(r => r.model === m.model);
  const electric = m.fuel === '전기';
  const head = ['날짜', '호기', '시험구분', '운전자', '시작아워', '종료아워', electric ? '배터리 소모율(%)' : '연료', electric ? '충전량(kWh)' : '주유량(L)', '특이사항', '사진'];
  const aoa = [[m.model.replace('(예시)', '') + ' 내구시험 일지 정리 (예시 데이터 — 가상의 값)'], head];
  for (const r of mine) {
    aoa.push([r.date, r.unit_no, r.test_type, r.driver, r.hour_start, r.hour_end,
      electric ? r.battery_pct : r.fuel_type, electric ? r.charge_kwh : r.fuel_qty, r.issue, r.photo]);
  }
  perModel[m.model] = aoa;
}
write('예시데이터_모델별엑셀.xlsx', perModel);

// 검증 1: 표준 현황 xlsx 를 앱과 같은 방식으로 다시 읽으면 원본과 같아야 합니다
function readBook(file) {
  const wb = XLSX.read(fs.readFileSync(path.join(out, file)), { type: 'buffer' });
  return wb.SheetNames.map(n => ({ name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
}
const strip = r => { const o = { ...r }; delete o._src; for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
const std = readBook('예시데이터_표준현황.xlsx')[0];
const hr = L.detectHeaderRow(std.aoa);
const back = L.applyMapping(std.aoa, { headerRow: hr, mapping: L.autoMap(L.headersOf(std.aoa, hr)), modelFallback: 'none' }).rows.map(strip);
const orig = rows.map(r => strip(L.normalizeRow(r)));
if (JSON.stringify(back) !== JSON.stringify(orig)) { console.error('표준 현황 왕복 불일치'); process.exit(1); }

// 검증 2: 모델별 엑셀을 자동 열 맞추기 + 시트 이름 모델로 읽으면 월 집계가 원본과 같아야 합니다
let merged = [];
for (const s of readBook('예시데이터_모델별엑셀.xlsx')) {
  const h = L.detectHeaderRow(s.aoa);
  const map = L.autoMap(L.headersOf(s.aoa, h));
  merged = merged.concat(L.applyMapping(s.aoa, { headerRow: h, mapping: map, sheetName: s.name, fileName: 'x.xlsx', modelFallback: 'sheet' }).rows);
}
const a1 = JSON.stringify(L.aggregateMonthly(merged));
const a2 = JSON.stringify(L.aggregateMonthly(rows.map(r => L.normalizeRow(r))));
if (a1 !== a2) { console.error('모델별 엑셀 집계 불일치\n' + a1 + '\n' + a2); process.exit(1); }
// 시험일지 정리 엑셀(실제 양식 배치). 다시 읽으면 모델 정보(머리)와 누적 가동시간이 원본과 같아야 합니다
const masters = Sample.masters();
const ids = rows.map((r, i) => ({ id: 's' + i, ...r }));
const sumBook = {};
for (const k of Object.keys(masters)) sumBook[masters[k].model.replace('(예시)', '') + ' ' + masters[k].unit_no] = L.summarySheet(L.unitSummary(ids, masters[k]));
write('예시데이터_시험일지정리.xlsx', sumBook);
for (const s of readBook('예시데이터_시험일지정리.xlsx')) {
  const h = L.detectHeaderRow(s.aoa);
  const info = L.parseSummaryHeader(s.aoa);
  const got = L.applyMapping(s.aoa, { headerRow: h, mapping: L.autoMap(L.headersOf(s.aoa, h)), sheetName: s.name, modelFallback: 'sheet' }).rows;
  const m = masters[L.masterKey(info.model, info.unit_no)];
  if (!m || info.targetHours !== m.targetHours || info.initialHour !== m.initialHour) { console.error('정리 엑셀 머리 불일치 ' + s.name); process.exit(1); }
  if (L.unitSummary(got, m).totals.hours !== L.unitSummary(ids, m).totals.hours) { console.error('정리 엑셀 누적 불일치 ' + s.name); process.exit(1); }
}
console.log('samples/ 생성·왕복 확인 완료: 일지 ' + rows.length + '행, 모델별 시트 ' + Object.keys(perModel).length + '개');
