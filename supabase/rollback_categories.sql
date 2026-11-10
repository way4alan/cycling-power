-- 只收回團騎類型與年度挑戰補充欄位。
-- 不打開舊的 anon 權限，也不刪團員、團騎、報名、出席。
-- 類型與挑戰說明會不見。不要在還想留這些欄位時執行。

alter table public.rides drop constraint if exists rides_category_kind;
alter table public.rides drop constraint if exists rides_pacing_guide_len;
alter table public.rides drop constraint if exists rides_supply_points_len;
alter table public.rides drop constraint if exists rides_cutoff_times_len;
alter table public.rides drop constraint if exists rides_gear_list_len;
drop index if exists public.rides_category_date_idx;

alter table public.ride_templates drop constraint if exists ride_templates_category_kind;
alter table public.ride_templates drop constraint if exists ride_templates_pacing_guide_len;
alter table public.ride_templates drop constraint if exists ride_templates_supply_points_len;
alter table public.ride_templates drop constraint if exists ride_templates_cutoff_times_len;
alter table public.ride_templates drop constraint if exists ride_templates_gear_list_len;

alter table public.rides drop column if exists gear_list;
alter table public.rides drop column if exists cutoff_times;
alter table public.rides drop column if exists supply_points;
alter table public.rides drop column if exists pacing_guide;
alter table public.rides drop column if exists category;

alter table public.ride_templates drop column if exists gear_list;
alter table public.ride_templates drop column if exists cutoff_times;
alter table public.ride_templates drop column if exists supply_points;
alter table public.ride_templates drop column if exists pacing_guide;
alter table public.ride_templates drop column if exists category;
