-- 團騎類型與年度挑戰補充欄位。可重複執行，不刪既有團騎、報名或出席。
-- 既有團騎預設為 sunday（週日固定團騎）。只有管理員能改 rides / ride_templates，沿用 PR2／PR4 的 RLS，不新增政策。
-- 先執行本檔，再更新網站。欄位還沒有時，網站把類型當成週日團騎，不會把讀取失敗當成新團員。

alter table public.rides add column if not exists category text not null default 'sunday';
alter table public.rides add column if not exists pacing_guide text not null default '';
alter table public.rides add column if not exists supply_points text not null default '';
alter table public.rides add column if not exists cutoff_times text not null default '';
alter table public.rides add column if not exists gear_list text not null default '';

alter table public.ride_templates add column if not exists category text not null default 'sunday';
alter table public.ride_templates add column if not exists pacing_guide text not null default '';
alter table public.ride_templates add column if not exists supply_points text not null default '';
alter table public.ride_templates add column if not exists cutoff_times text not null default '';
alter table public.ride_templates add column if not exists gear_list text not null default '';

do $$ begin
  alter table public.rides add constraint rides_category_kind check (category in ('sunday', 'challenge', 'monthly'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_pacing_guide_len check (char_length(pacing_guide) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_supply_points_len check (char_length(supply_points) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_cutoff_times_len check (char_length(cutoff_times) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_gear_list_len check (char_length(gear_list) <= 1000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.ride_templates add constraint ride_templates_category_kind check (category in ('sunday', 'challenge', 'monthly'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_pacing_guide_len check (char_length(pacing_guide) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_supply_points_len check (char_length(supply_points) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_cutoff_times_len check (char_length(cutoff_times) <= 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_gear_list_len check (char_length(gear_list) <= 1000);
exception when duplicate_object then null; end $$;

create index if not exists rides_category_date_idx on public.rides (category, date);
