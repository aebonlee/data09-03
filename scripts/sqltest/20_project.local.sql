-- ============================================================================
-- 로컬 검증 전용 — data09-03 프로젝트별 검증 (운영 실행 금지, 가드 내장)
--
--  역할 전환으로 실제 사용자처럼 질의한다.
--    set role authenticated + request.jwt.claim.sub = 사용자 uuid  → auth.uid()
--    set role anon                                                   → 비로그인
-- ============================================================================
do $guard$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator'))
     or exists (select 1 from pg_namespace where nspname = 'graphql') then
    raise exception '이 파일은 로컬 검증 전용입니다. 운영 데이터베이스에서 실행할 수 없습니다.';
  end if;
end;
$guard$;

do $t$ begin raise notice '[프로젝트] data09-03 — 재실행 · 제약 · RLS · 함수 권한'; end $t$;

-- ── 0. 재실행 안전 (run.sh 가 schema.sql 을 두 번 적용한 뒤다) ──────────────
do $t$
declare v_n int;
begin
  perform public._assert_eq(
    (select count(*)::int from pg_tables where schemaname = 'public'
      and tablename in ('journal_rows','fuel_prices','user_settings')), 3, '표 3개가 한 번씩만 있다 (두 번 적용 후)');
  select count(*) into v_n from pg_trigger t where not t.tgisinternal and t.tgname like '%\_updated\_at';
  perform public._assert_eq(v_n, 3, 'updated_at 트리거가 표마다 하나씩 (중복 생성 없음)');
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('journal_rows','fuel_prices','user_settings');
  perform public._assert_eq(v_n, 12, '정책이 표마다 4개씩, 중복 없이 12개');
end $t$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com')
on conflict (id) do nothing;

-- ── 1. 사용자 A ──────────────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $t$
declare v_raised boolean;
begin
  insert into public.journal_rows (id, date, model, unit_no, test_type, driver, hour_start, hour_end, run_hours, fuel_type, fuel_qty)
  values ('r1', '2026-09-01', 'DEMO-D25', '1호기', '주행내구', '운전자A', 1240.0, 1246.5, 6.5, '경유', 12.3);

  -- 도구가 「검사 화면에서 표시」하는 틀린 값은 저장이 되어야 한다 (막으면 행이 사라진다)
  insert into public.journal_rows (id, date, model, hour_start, hour_end, run_hours, battery_pct, unreadable, raw, src)
  values ('r2', null, '', 1300, 1200, 30, 120, array['date'], '{"date": "2026-13-45"}', '일지.xlsx / 시트1 3행');
  perform public._assert_eq((select count(*) from public.journal_rows), 2::bigint,
    '일자 없음·아워미터 역행·24시간 초과·100% 초과 행도 검사용으로 저장된다');

  v_raised := false;
  begin insert into public.journal_rows (id, model) values ('row-3', 'X');
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '행 번호는 r+숫자 형식 (CHECK)');

  v_raised := false;
  begin insert into public.journal_rows (id, model) values ('r1', '중복');
  exception when unique_violation then v_raised := true; end;
  perform public._assert(v_raised, '내 행 번호 중복은 PK 가 막는다');

  v_raised := false;
  begin insert into public.journal_rows (id, unreadable) values ('r9', array['driver']);
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '못 읽은 칸 목록에는 숫자·날짜 칸만 (CHECK)');

  insert into public.fuel_prices (month, fuel, price, unit, source, checked)
  values ('2026-09', '경유', 1500, 'L', '오피넷 월평균', '2026-09-30');

  v_raised := false;
  begin insert into public.fuel_prices (month, fuel, price) values ('2026-09', '경유', 1600);
  exception when unique_violation then v_raised := true; end;
  perform public._assert(v_raised, '같은 월·같은 연료 단가는 하나만 (UNIQUE)');

  v_raised := false;
  begin insert into public.fuel_prices (month, fuel) values ('2026-9', 'LPG');
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '기성 월은 YYYY-MM (CHECK)');

  v_raised := false;
  begin insert into public.fuel_prices (month, fuel) values ('2026-09', '휘발유');
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '연료는 경유·LPG 만 (CHECK)');

  v_raised := false;
  begin insert into public.fuel_prices (month, fuel, price) values ('2026-09', 'LPG', -1);
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '단가는 음수일 수 없다 (CHECK)');

  v_raised := false;
  begin insert into public.fuel_prices (month, fuel, unit) values ('2026-09', 'LPG', 'gal');
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '단위는 L·kg 만 (CHECK)');

  insert into public.user_settings (mapping, seq) values ('{"date": "일자", "model": "모델"}', 2);

  v_raised := false;
  begin update public.user_settings set seq = -1;
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, '행 번호 seq 는 음수일 수 없다 (CHECK)');

  v_raised := false;
  begin update public.user_settings set mapping = '[]';
  exception when check_violation then v_raised := true; end;
  perform public._assert(v_raised, 'mapping 은 객체여야 한다 (CHECK)');
end $t$;

-- ── 2. 사용자 B — A 의 자료를 못 보고 못 고친다 ───────────────────────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $t$
declare v_n int; v_raised boolean := false;
begin
  perform public._assert_eq((select count(*) from public.journal_rows),  0::bigint, 'B 는 A 의 일지 행을 못 본다');
  perform public._assert_eq((select count(*) from public.fuel_prices),   0::bigint, 'B 는 A 의 연료 단가를 못 본다');
  perform public._assert_eq((select count(*) from public.user_settings), 0::bigint, 'B 는 A 의 설정을 못 본다');

  update public.journal_rows set driver = '조작';
  get diagnostics v_n = row_count;
  perform public._assert_eq(v_n, 0, 'B 는 A 의 일지를 고칠 수 없다');
  delete from public.fuel_prices;
  get diagnostics v_n = row_count;
  perform public._assert_eq(v_n, 0, 'B 는 A 의 단가를 지울 수 없다');

  begin
    insert into public.journal_rows (id, model, owner_id)
    values ('r50', '남의 이름으로', '00000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then v_raised := true; end;
  perform public._assert(v_raised, 'B 는 남의 owner_id 로 행을 만들 수 없다');

  -- 행 번호·월·연료가 같아도 사람이 다르면 따로 저장된다
  insert into public.journal_rows (id, model) values ('r1', 'B 의 모델');
  insert into public.fuel_prices (month, fuel, price) values ('2026-09', '경유', 1700);
  insert into public.user_settings default values;
  perform public._assert_eq((select count(*) from public.journal_rows), 1::bigint,
    '사람이 다르면 같은 행 번호도 따로 저장된다 (키에 owner_id 포함)');
end $t$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $t$
declare v_before timestamptz; v_after timestamptz;
begin
  perform public._assert_eq((select price from public.fuel_prices where month = '2026-09' and fuel = '경유'),
    1500.00::numeric(12,2), 'A 의 단가는 B 의 단가와 섞이지 않는다');
  select updated_at into v_before from public.journal_rows where id = 'r1';
  perform pg_sleep(0.01);
  update public.journal_rows set issue = '소음' where id = 'r1';
  select updated_at into v_after from public.journal_rows where id = 'r1';
  perform public._assert(v_after > v_before, 'updated_at 트리거가 수정 시각을 갱신한다');
end $t$;

-- ── 3. 비로그인(anon) ─────────────────────────────────────────────────────
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $t$
declare v_ok boolean; v_raised boolean := false; v_t text;
begin
  foreach v_t in array array['journal_rows','fuel_prices','user_settings']
  loop
    execute format('select count(*) = 0 from public.%I', v_t) into v_ok;
    perform public._assert(v_ok, 'anon 은 ' || v_t || ' 을 한 행도 못 본다');
  end loop;
  begin
    insert into public.fuel_prices (month, fuel, owner_id)
    values ('2026-10', 'LPG', '00000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then v_raised := true; end;
  perform public._assert(v_raised, 'anon 은 쓸 수 없다');
end $t$;
reset role;

-- ── 4. 함수 ACL — PUBLIC·anon 에 EXECUTE 가 없다 (proacl 직접 확인) ───────────
--    함수는 트리거 함수 하나뿐이고 RLS 정책 식에 함수를 쓰지 않으므로 anon 예외가 없다.
do $t$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public' and p.proname not like '\_assert%'
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or a.grantee = 'anon'::regrole);
  perform public._assert(v_bad is null,
    'proacl 에 PUBLIC·anon EXECUTE 가 없다' || coalesce(' (발견: ' || v_bad || ')', ''));
  perform public._assert(
    (select proconfig @> array['search_path=public'] from pg_proc where proname = 'set_updated_at'),
    'set_updated_at 의 search_path=public 고정');
end $t$;

do $t$ begin raise notice ''; raise notice '전부 통과했습니다.'; end $t$;
