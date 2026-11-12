-- 待確認徽章帶上本人看得到的活動摘要。確認後清掉這些欄位，只留 PACE 徽章。
-- 只刪除重複的 pending，不刪已確認的徽章。

alter table public.badge_prompts add column if not exists strava_activity_id text not null default '';
alter table public.badge_prompts add column if not exists activity_name text not null default '';
alter table public.badge_prompts add column if not exists started_at timestamptz;
alter table public.badge_prompts add column if not exists distance_km numeric;
alter table public.badge_prompts add column if not exists elevation_gain_m numeric;
alter table public.badge_prompts add column if not exists elapsed_sec integer;

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

create unique index if not exists badge_prompts_pending_badge_uidx
  on public.badge_prompts (line_user_id, badge_key)
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
    insert into public.badge_prompts as p (
      line_user_id, badge_key, tier, earned_on, status,
      strava_activity_id, activity_name, started_at, distance_km, elevation_gain_m, elapsed_sec
    ) values (
      target,
      item->>'badge_key',
      new_tier,
      new_day,
      'pending',
      left(coalesce(item->>'strava_activity_id', ''), 40),
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

create or replace function public.confirm_my_badge(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.badge_prompts%rowtype;
begin
  if not private.current_is_approved() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into found from public.badge_prompts
    where id = prompt_id and line_user_id = private.current_line_id() and status = 'pending';
  if found.id is null then
    raise exception 'missing' using errcode = 'P0002';
  end if;
  insert into public.member_badges as b (line_user_id, badge_key, tier, earned_on)
  values (found.line_user_id, found.badge_key, found.tier, found.earned_on)
  on conflict (line_user_id, badge_key) do update
    set tier = case
          when b.badge_key = 'west_wuling' and (
            case excluded.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) > (
            case b.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) then excluded.tier
          else b.tier
        end,
        earned_on = case
          when b.badge_key = 'west_wuling' and (
            case excluded.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) > (
            case b.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) then excluded.earned_on
          else b.earned_on
        end;
  update public.badge_prompts
    set status = 'confirmed',
        strava_activity_id = '',
        activity_name = '',
        started_at = null,
        distance_km = null,
        elevation_gain_m = null,
        elapsed_sec = null
    where id = found.id;
end;
$$;

revoke all on function public.offer_badge_prompts(text, jsonb) from public, anon, authenticated;
grant execute on function public.offer_badge_prompts(text, jsonb) to service_role;
