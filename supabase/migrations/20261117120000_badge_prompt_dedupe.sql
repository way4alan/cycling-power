-- 同一人、同一枚徽章只留一筆待確認。
-- 只刪除重複的 pending。已確認、已略過的提示，以及 member_badges，都不刪。
-- 活動編號是空字串或 NULL 時，不能因此再開一筆待確認。

delete from public.badge_prompts as p
where p.status = 'pending'
  and p.id in (
    select ranked.id from (
      select id, row_number() over (
        partition by line_user_id, badge_key
        order by
          case tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end desc,
          earned_on asc,
          created_at asc
      ) as n
      from public.badge_prompts
      where status = 'pending'
    ) as ranked
    where ranked.n > 1
  );

drop index if exists public.badge_prompts_pending_badge_uidx;

create unique index badge_prompts_pending_badge_uidx
  on public.badge_prompts (line_user_id, badge_key)
  nulls not distinct
  where status = 'pending';

create or replace function public.offer_badge_prompts(target text, offers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  new_tier text;
  new_day date;
  new_rank int;
  activity_id text;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(target, '') = '' or jsonb_typeof(offers) is distinct from 'array' then
    return;
  end if;
  for item in select value from jsonb_array_elements(offers)
  loop
    new_tier := coalesce(item->>'tier', '');
    new_day := nullif(item->>'earned_on', '')::date;
    if coalesce(item->>'badge_key', '') = '' or new_day is null then
      continue;
    end if;
    new_rank := case new_tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end;
    activity_id := left(coalesce(nullif(btrim(item->>'strava_activity_id'), ''), ''), 40);
    insert into public.badge_prompts as p (
      line_user_id, badge_key, tier, earned_on, status,
      strava_activity_id, activity_name, started_at, distance_km, elevation_gain_m, elapsed_sec
    ) values (
      target,
      item->>'badge_key',
      new_tier,
      new_day,
      'pending',
      activity_id,
      left(coalesce(item->>'activity_name', ''), 120),
      nullif(item->>'started_at', '')::timestamptz,
      nullif(item->>'distance_km', '')::numeric,
      nullif(item->>'elevation_gain_m', '')::numeric,
      nullif(item->>'elapsed_sec', '')::integer
    )
    on conflict (line_user_id, badge_key) where status = 'pending' do update
      set tier = excluded.tier,
          earned_on = excluded.earned_on,
          strava_activity_id = excluded.strava_activity_id,
          activity_name = excluded.activity_name,
          started_at = excluded.started_at,
          distance_km = excluded.distance_km,
          elevation_gain_m = excluded.elevation_gain_m,
          elapsed_sec = excluded.elapsed_sec
      where (
        case when p.badge_key = 'west_wuling'
          then new_rank > (case p.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end)
            or (new_rank = (case p.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end) and excluded.earned_on < p.earned_on)
          else excluded.earned_on < p.earned_on
        end
      );
  end loop;
end;
$$;

revoke all on function public.offer_badge_prompts(text, jsonb) from public, anon, authenticated;
grant execute on function public.offer_badge_prompts(text, jsonb) to service_role;
