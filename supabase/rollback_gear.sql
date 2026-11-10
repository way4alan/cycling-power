-- 只收回個人裝備庫。不打開舊權限，也不刪團員、團騎、報名。
-- 車、輪組、耗材與里程紀錄會刪除。

drop trigger if exists gear_apply_mileage on public.mileage_logs;
drop trigger if exists zz_gear_apply_mileage on public.mileage_logs;
drop trigger if exists gear_single_mounted on public.wheelsets;
drop trigger if exists gear_guard_last_wheelset on public.wheelsets;
drop trigger if exists gear_seed_wheelset on public.wheelsets;
drop trigger if exists gear_seed_bike on public.bikes;
drop trigger if exists gear_stamp_pending on public.pending_activities;
drop trigger if exists z_gear_guard_chain on public.chain_replacements;
drop trigger if exists gear_stamp_chain_replacements on public.chain_replacements;
drop trigger if exists gear_stamp_mileage on public.mileage_logs;
drop trigger if exists gear_stamp_components on public.gear_components;
drop trigger if exists gear_stamp_wheelsets on public.wheelsets;
drop trigger if exists gear_stamp_bikes on public.bikes;

drop function if exists private.gear_apply_mileage();
drop function if exists private.gear_single_mounted();
drop function if exists private.gear_guard_chain();
drop function if exists private.gear_guard_last_wheelset();
drop function if exists private.gear_seed_bike();
drop function if exists private.gear_seed_wheelset();
drop function if exists private.gear_stamp_owner();

drop table if exists public.chain_replacements;
drop table if exists public.mileage_logs;
drop table if exists public.pending_activities;
drop table if exists public.gear_components;
drop table if exists public.wheelsets;
drop table if exists public.bikes;
