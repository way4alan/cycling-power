-- 本機測試資料。line_user_id 的形狀與 LINE 使用者 ID 相同（U + 32 hex）。
truncate table
  public.attendances,
  public.registrations,
  public.rides,
  public.riders,
  public.locations,
  public.guidelines,
  public.weather_locations
restart identity cascade;

insert into public.riders (id, line_user_id, name, ftp, weight, status, is_admin, attendance_count, name_color) values
  ('11111111-1111-1111-1111-111111111111', 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '甲', 200, 70, 'approved', false, 0, ''),
  ('22222222-2222-2222-2222-222222222222', 'Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '乙', 210, 68, 'approved', false, 3, '#112233'),
  ('33333333-3333-3333-3333-333333333333', 'Ucccccccccccccccccccccccccccccccc', '管', 250, 65, 'approved', true, 10, ''),
  ('44444444-4444-4444-4444-444444444444', 'Udddddddddddddddddddddddddddddddd', '新', 180, 60, 'pending', false, 0, '');

insert into public.rides (id, title, date, time, location) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '晨騎', '2026-11-08', '06:00', '愛河之心');

insert into public.registrations (id, ride_id, line_user_id, name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '乙');
