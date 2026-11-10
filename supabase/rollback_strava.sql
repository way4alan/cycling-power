-- 只收回 Strava 連線。不刪車、輪組、耗材，也不打開舊權限。
-- 已記入的里程還在。token 與一次性 state 會刪除。

drop trigger if exists zz_gear_revise_mileage on public.mileage_logs;
drop function if exists public.strava_backend(text, jsonb);
drop function if exists private.gear_revise_mileage();
drop function if exists private.gear_shift_km(text, uuid, uuid, numeric, boolean, boolean);

drop table if exists private.strava_oauth_states;
drop table if exists private.strava_tokens;

alter table if exists public.pending_activities drop constraint if exists pending_activities_mileage_fk;
alter table if exists public.pending_activities drop column if exists mileage_log_id;
alter table if exists public.pending_activities drop column if exists gear_external_id;
alter table if exists public.pending_activities drop column if exists ask_chain;
drop index if exists public.mileage_logs_external_uidx;
alter table if exists public.mileage_logs drop column if exists external_id;
alter table if exists public.mileage_logs drop column if exists external_source;
