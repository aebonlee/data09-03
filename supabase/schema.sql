-- ============================================================================
-- data09-03 — 내구시험 일지 데이터 정리·기성 자동화
-- Supabase(PostgreSQL) 스키마 + RLS
--
--  무엇인가 : 지금은 브라우저 localStorage('data09-03.db') 한 곳에 들어 있는
--             일지 행(rows)·월별 연료 단가(prices)·열 맞추기 설정(mapping, seq)을
--             DB 표로 옮기기 위한 스크립트입니다.
--             필드 이름은 도구(js/logic.js STD_FIELDS)의 표준 열 이름을 그대로 씁니다.
--  실행 위치 : 수강생 본인 Supabase 프로젝트의 SQL Editor 에서 실행
--  재실행    : 안전합니다 (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS 선행)
--
--  본인 프로젝트에 올리는 것을 전제로 하므로 테이블 이름에 접두사를 붙이지 않았습니다.
--  도구에 사용자 역할 구분이 없으므로 모든 행은 만든 사람만 보고 고칩니다.
--
--  테이블 (5)
--    journal_rows        일지 행 — 한 행 = TPR 일지 한 장 (localStorage 의 rows)
--    fuel_prices         월별 평균 연료 단가 (1단계 월간 집계용 prices)
--    user_settings       불러오기 열 맞추기 기억값·행 번호·기성/메일 설정 (mapping, seq, settings)
--    unit_masters        모델·호기 정보 — 초기 아워미터·목표 가동시간·PG·과제번호·연료 (masters)
--    period_fuel_prices  기성 기간별 연료 단가 — 연료비 청구서용 (prices['시작~종료'])
--
--  2026-09-29 실제 양식(TPR 일지·시험일지 정리 엑셀·기성 청구서 2종) 반영:
--    journal_rows 에 주/야/휴·날씨·사이클·점검 시간 칸과 TPR 전용 값(tpr jsonb)을 더하고
--    표 두 개를 새로 만든다. 이미 1단계 스키마를 적용한 DB 에 다시 돌려도 된다(ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 테이블
-- ----------------------------------------------------------------------------

-- 일지 행
--  ⚠ 도구는 값이 틀린 행도 버리지 않고 저장한 뒤 「입력값 검사」로 표시한다
--    (일자 빈 칸, 음수, 누적 아워미터 역행, 24시간 초과 등은 error/warn 표시일 뿐 저장은 된다).
--    그래서 여기서도 그런 값을 CHECK 로 막지 않는다. 막으면 검사 화면에 올라와야 할 행이
--    DB 저장 단계에서 조용히 사라진다. 형식이 절대 성립할 수 없는 것만 막는다.
create table if not exists public.journal_rows (
  id          text not null check (id ~ '^r[0-9]+$'),   -- 도구가 붙이는 행 번호 'r1', 'r2' …
  date        date,                                     -- 일자 (못 읽으면 비고 raw 에 원래 값)
  model       text not null default '',                 -- 모델
  unit_no     text not null default '',                 -- 호기
  test_type   text not null default '',                 -- 시험 종류
  driver      text not null default '',                 -- 운전자
  hour_start  numeric(12,2),                            -- 시작 아워미터(h)
  hour_end    numeric(12,2),                            -- 종료 아워미터(h)
  run_hours   numeric(8,2),                             -- 운행시간(h)
  battery_pct numeric(6,2),                             -- 배터리소모율(%)
  charge_kwh  numeric(10,2),                            -- 충전량(kWh)
  fuel_type   text not null default '',                 -- 연료 종류 (경유·LPG·전기, 그 밖은 경고 표시)
  fuel_qty    numeric(10,2),                            -- 연료 소모량
  issue       text not null default '',                 -- 문제점
  photo       text not null default '',                 -- 사진 참조
  -- 도구의 내부 칸 _src · _unreadable · _raw (밑줄은 떼고 옮긴다)
  src         text not null default '',                 -- 가져온 곳 '파일 / 시트 12행'
  unreadable  text[] not null default '{}'              -- 숫자·날짜로 못 읽은 칸 이름
              check (unreadable <@ array['date','hour_start','hour_end','run_hours',
                                         'battery_pct','charge_kwh','fuel_qty']::text[]),
  raw         jsonb not null default '{}'::jsonb,       -- 못 읽은 칸의 원래 값 {칸: '값'}
  owner_id    uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ 프런트에서 upsert 할 때 onConflict 를 'owner_id,id' 로 반드시 지정할 것
  constraint journal_rows_pkey primary key (owner_id, id)
);
-- 2026-09-29 실제 TPR 일지·정리 엑셀 칸 (logic.js STD_FIELDS 에 더한 열)
alter table public.journal_rows add column if not exists shift           text not null default '';  -- 주/야/휴 (모르는 값은 검사에서 표시)
alter table public.journal_rows add column if not exists weather         text not null default '';  -- 날씨
alter table public.journal_rows add column if not exists charge_h        numeric(6,2);              -- 금일충전시간(h)
alter table public.journal_rows add column if not exists cycle_h         numeric(6,2);              -- 기본/요철 사이클(h)
alter table public.journal_rows add column if not exists basic_cycles    numeric(8,1);              -- 기본 사이클(회)
alter table public.journal_rows add column if not exists bump_cycles     numeric(8,1);              -- 요철 사이클(회)
alter table public.journal_rows add column if not exists battery_check_h numeric(6,2);              -- 배터리 충전 점검(h)
alter table public.journal_rows add column if not exists inspect_h       numeric(6,2);              -- 장비 점검·TPR 작성(h)
alter table public.journal_rows add column if not exists special_h       numeric(6,2);              -- 특화 시험(동력전달 특화 등)·장비수리(h)
alter table public.journal_rows add column if not exists heater_h        numeric(6,2);              -- 히터 가동(h)
alter table public.journal_rows add column if not exists ac_h            numeric(6,2);              -- 에어컨 가동(h)
alter table public.journal_rows add column if not exists urea_l          numeric(10,2);             -- 요소수 주입량(L)
-- TPR 양식에만 있는 값: battery[{label,start,end}] · problems[{text,note}] · checks[①~⑤ 유/무] · coop · improve · wheel_nut · lpg_bottles
alter table public.journal_rows add column if not exists tpr             jsonb not null default '{}'::jsonb;
alter table public.journal_rows drop constraint if exists journal_rows_tpr_check;
alter table public.journal_rows add  constraint journal_rows_tpr_check check (jsonb_typeof(tpr) = 'object');
-- 못 읽은 칸 목록: 숫자·날짜 칸이 늘었으므로 다시 만든다(이름이 고정이라 재실행 안전)
alter table public.journal_rows drop constraint if exists journal_rows_unreadable_check;
alter table public.journal_rows add  constraint journal_rows_unreadable_check
  check (unreadable <@ array['date','hour_start','hour_end','run_hours','charge_h','cycle_h','basic_cycles','bump_cycles',
                             'battery_check_h','inspect_h','special_h','heater_h','ac_h',
                             'battery_pct','charge_kwh','fuel_qty','urea_l']::text[]);

create index if not exists journal_rows_owner_date_idx on public.journal_rows (owner_id, date);
create index if not exists journal_rows_unit_idx       on public.journal_rows (owner_id, model, unit_no, date);

-- 월별 평균 연료 단가 — 기성 월 × 연료 한 행. 가격은 사람이 오피넷 등에서 찾아 적는다
create table if not exists public.fuel_prices (
  id         bigint generated always as identity primary key,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),   -- 'YYYY-MM'
  fuel       text not null check (fuel in ('경유', 'LPG')),              -- logic.js FUELS
  price      numeric(12,2) check (price >= 0),                           -- 원/단위, 비워 둘 수 있음
  unit       text not null default 'L' check (unit in ('L', 'kg')),
  source     text not null default '',                                   -- 가격 출처
  checked    date,                                                       -- 조회일
  owner_id   uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ⚠ 프런트에서 upsert 할 때 onConflict 를 'owner_id,month,fuel' 로 반드시 지정할 것
  constraint fuel_prices_owner_month_fuel_key unique (owner_id, month, fuel)
);

-- 모델·호기 정보 — 시험일지 정리 엑셀 위쪽(모델명/호기·초기 아워미터·목표 가동시간·PG 정보)
create table if not exists public.unit_masters (
  model        text not null check (model <> ''),
  unit_no      text not null default '',
  initial_hour numeric(12,2),                                         -- 초기 아워미터(h)
  target_hours numeric(10,2) check (target_hours > 0),                -- 목표 가동시간(h)
  pg           text not null default '',                             -- PG 정보
  project      text not null default '',                             -- 과제번호(기성 청구서)
  fuel         text not null default '' check (fuel in ('', '경유', 'LPG', '전기')),
  owner_id     uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- ⚠ 프런트에서 upsert 할 때 onConflict 를 'owner_id,model,unit_no' 로 반드시 지정할 것
  constraint unit_masters_pkey primary key (owner_id, model, unit_no)
);

-- 2026-09-29 오후 수강생 답: 목표는 보통 1000h, 특화하면 +500h(1500h). target_hours 가 비면 도구가 extended 로 1000/1500 을 정한다
alter table public.unit_masters add column if not exists extended boolean not null default false;

-- 기성 기간별 연료 단가 — 청구 기간이 달력 월과 다르므로(예: 04.30~05.30) 시작·종료일로 묶는다
create table if not exists public.period_fuel_prices (
  id          bigint generated always as identity primary key,
  period_from date not null,
  period_to   date not null,
  fuel        text not null check (fuel in ('경유', 'LPG', '요소수')),  -- 요소수도 청구 대상(수강생 답)
  price       numeric(12,2) check (price >= 0),                       -- VAT 포함 원/kg(LPG)·원/L(경유·요소수)
  unit        text not null default 'L' check (unit in ('L', 'kg')),
  source      text not null default '',
  checked     date,
  owner_id    uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint period_fuel_prices_order check (period_from <= period_to),
  -- ⚠ 프런트에서 upsert 할 때 onConflict 를 'owner_id,period_from,period_to,fuel' 로 반드시 지정할 것
  constraint period_fuel_prices_key unique (owner_id, period_from, period_to, fuel)
);

-- 오전판 스키마를 이미 적용한 DB 도 요소수를 받도록 연료 제약을 이름으로 다시 만든다(재실행 안전)
alter table public.period_fuel_prices drop constraint if exists period_fuel_prices_fuel_check;
alter table public.period_fuel_prices add  constraint period_fuel_prices_fuel_check check (fuel in ('경유', 'LPG', '요소수'));

-- 불러오기 설정 — 사람마다 한 행
create table if not exists public.user_settings (
  owner_id   uuid primary key default auth.uid(),
  mapping    jsonb not null default '{}'::jsonb          -- 마지막 열 맞추기 {표준열: 엑셀 머리글}
             check (jsonb_typeof(mapping) = 'object'),
  seq        int not null default 0 check (seq >= 0),    -- 마지막으로 붙인 행 번호
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 기성·메일 설정: company · team · approvers[직책] · rate · surcharge{주,야,휴} · bottleKg · mailTo · mailSign
alter table public.user_settings add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.user_settings drop constraint if exists user_settings_settings_check;
alter table public.user_settings add  constraint user_settings_settings_check check (jsonb_typeof(settings) = 'object');

-- ----------------------------------------------------------------------------
-- 2. 함수 — search_path 고정
-- ----------------------------------------------------------------------------

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $trg$
declare t text;
begin
  foreach t in array array['journal_rows','fuel_prices','user_settings','unit_masters','period_fuel_prices']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end;
$trg$;

-- ----------------------------------------------------------------------------
-- 3. RLS — 본인 행만 보고 쓴다. 비로그인(anon)은 정책이 없어 아무것도 못 한다
-- ----------------------------------------------------------------------------

alter table public.journal_rows  enable row level security;
alter table public.fuel_prices   enable row level security;
alter table public.user_settings enable row level security;
alter table public.unit_masters  enable row level security;
alter table public.period_fuel_prices enable row level security;

do $rls$
declare t text;
begin
  foreach t in array array['journal_rows','fuel_prices','user_settings','unit_masters','period_fuel_prices']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read',   t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
                   t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
                   t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
                   t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())',
                   t || '_delete', t);
  end loop;
end;
$rls$;

-- ----------------------------------------------------------------------------
-- 4. 함수 실행 권한
--
--  ⚠ GRANT 만으로는 제한되지 않는다. PostgreSQL 이 PUBLIC 에, Supabase 가
--    anon·authenticated·service_role 에 EXECUTE 를 미리 붙이므로 둘 다 끊는다.
--  트리거 전용 함수는 authenticated 를 남긴다(직접 호출하면 "can only be called
--  as trigger" 로 죽어 무해하다).
-- ----------------------------------------------------------------------------

revoke all on function public.set_updated_at() from public, anon;
grant execute on function public.set_updated_at() to authenticated;
