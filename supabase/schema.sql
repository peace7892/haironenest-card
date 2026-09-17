-- 헤어원네스트 상담 카드 V2 — Supabase 표
-- 투두리스트 프로젝트를 같이 쓰므로 표 이름 앞에 card_ 를 붙인다.
-- Supabase 관리 화면 → SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 다시 실행해도 안전하다 (create if not exists / drop policy 후 재생성).

create table if not exists card_customers (
  id bigint primary key,
  name text not null,
  phone text not null default '',
  referrer text not null default '',
  is_legacy boolean not null default false,        -- 예전부터 오던 고객 (신규 집계 제외)
  profile jsonb not null default '{"talk":"","hair":""}',
  profile_history jsonb not null default '[]',
  deleted_at text,                                  -- 지우기(감추기) 시각. null이면 살아 있음
  created_at text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists card_visits (
  id bigint primary key,
  customer_id bigint not null references card_customers(id) on delete cascade,
  done text not null,
  next text not null default '',
  kinds text[] not null default '{}',              -- 시술 종류 칩: 커트·펌·염색·클리닉·기타
  history jsonb not null default '[]',
  created_at text not null,
  deleted_at text,
  updated_at timestamptz not null default now()
);
create index if not exists card_visits_customer on card_visits(customer_id);

create table if not exists card_passes (
  id bigint primary key,
  customer_id bigint not null references card_customers(id) on delete cascade,
  kind text not null,                               -- charge / use
  amount integer not null,
  note text not null default '',
  at text not null default '',                      -- 적은 시각
  visit_id bigint,                                  -- 안내문에서 방문 기록과 함께 넣은 경우
  updated_at timestamptz not null default now()
);
create index if not exists card_passes_customer on card_passes(customer_id);

create table if not exists card_today (
  date text primary key,                            -- YYYY-MM-DD
  entries jsonb not null default '[]',              -- [{customerId, at}]
  updated_at timestamptz not null default now()
);

create table if not exists card_daily_counts (
  date text primary key,
  handsos_count integer,                            -- 퇴근 때 적는 핸드SOS 오늘 시술 인원
  updated_at timestamptz not null default now()
);

create table if not exists card_settings (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}',                 -- 안내문 머리말·맺음말, 정액권 상품, nextId, 정착 기준일, 주기 배수
  updated_at timestamptz not null default now()
);

-- 자물쇠: 로그인한 사용자만 읽고 쓴다. 공개 키만 있는 사람은 아무것도 못 본다.
alter table card_customers    enable row level security;
alter table card_visits       enable row level security;
alter table card_passes       enable row level security;
alter table card_today        enable row level security;
alter table card_daily_counts enable row level security;
alter table card_settings     enable row level security;

drop policy if exists "card_customers_auth"    on card_customers;
drop policy if exists "card_visits_auth"       on card_visits;
drop policy if exists "card_passes_auth"       on card_passes;
drop policy if exists "card_today_auth"        on card_today;
drop policy if exists "card_daily_counts_auth" on card_daily_counts;
drop policy if exists "card_settings_auth"     on card_settings;

create policy "card_customers_auth"    on card_customers    for all to authenticated using (true) with check (true);
create policy "card_visits_auth"       on card_visits       for all to authenticated using (true) with check (true);
create policy "card_passes_auth"       on card_passes       for all to authenticated using (true) with check (true);
create policy "card_today_auth"        on card_today        for all to authenticated using (true) with check (true);
create policy "card_daily_counts_auth" on card_daily_counts for all to authenticated using (true) with check (true);
create policy "card_settings_auth"     on card_settings     for all to authenticated using (true) with check (true);
