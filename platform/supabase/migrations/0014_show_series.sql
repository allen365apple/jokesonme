-- 0014 show series：演出類別（看我笑話／現代問題維修中心／專場），與 type（流程：monthly 觸發月號模板與隔天技術費）分開。
-- nullable，讓不知道 series 的舊插入程式不會失敗。
alter table shows add column if not exists series text;
alter table shows drop constraint if exists shows_series_check;
alter table shows add constraint shows_series_check
  check (series is null or series in ('看我笑話', '現代問題維修中心', '專場'));

-- 既有資料回填（依名稱）
update shows set series = case
  when name ~ '^現代問題維修中心' then '現代問題維修中心'
  when type = 'special' or name ~ '專場' then '專場'
  else '看我笑話' end
where series is null;

-- 2026-11-03 補演出日（Oen 場次字串／成員確認）
update shows s set performance_date = v.d::date
from (values
  ('bff98ab3-728e-4ea1-a427-3b43c2860d13', '2026-04-18'), -- 第 2 季 4 月號（成員確認）
  ('03faa061-d8b8-4d1d-a0b8-56f0477d7d20', '2026-05-16'),
  ('73f076f6-dc64-4a2b-89d4-7b188ce889f9', '2026-06-20'),
  ('ca3afc0e-5f13-4e4d-991e-2bb0731200dc', '2026-07-18'),
  ('e89ea76b-30e6-408f-b322-190905323301', '2026-08-22'),
  ('6def0d87-eb02-4ed3-9fd4-3712d2807a56', '2026-06-06'),
  ('d05fdd61-39de-4855-8ee8-c7e064202789', '2026-07-04'),
  ('957ceff5-5166-4f3f-842f-7c6ba46ffa87', '2026-08-01'),
  ('32ffe11a-84d2-480d-8984-9cc0e8ad5f3f', '2026-05-23'), -- 直球（5/23、5/30 兩場，取首場）
  ('e34a4b15-c5f3-4b9e-a10f-45620a80de04', '2026-08-29'), -- 向下管理
  ('6e8cebfb-4a5f-459b-afd6-000a07a073c2', '2026-03-21'), -- Opening Party
  ('5b1c103a-4f58-4641-82f8-91b6fe016ad2', '2026-03-19')  -- 年度會議｜看我畫大餅
) v(id, d)
where s.id = v.id::uuid and s.performance_date is null;
-- 向上管理維持 2026-09-05（原 7/11–12，颱風延期至 9/5–6；shows 無備註欄，記錄於此）

-- 看我笑話第 2 季 4–9 月號改為 monthly（現代問題維修中心維持 other）
update shows set type = 'monthly'
where id in ('bff98ab3-728e-4ea1-a427-3b43c2860d13', '03faa061-d8b8-4d1d-a0b8-56f0477d7d20', '73f076f6-dc64-4a2b-89d4-7b188ce889f9',
             'ca3afc0e-5f13-4e4d-991e-2bb0731200dc', 'e89ea76b-30e6-408f-b322-190905323301', '39bba6d9-9f55-463e-8f2a-a9039d31858e')
  and type = 'other';
