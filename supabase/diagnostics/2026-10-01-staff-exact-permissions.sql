-- Read-only. Staff permissions before / after migration 00080.
--
-- For every staff-relevant account: stored grant, CURRENT effective set
-- (old "preset ∪ stored" semantics with the pre-00080 presets, including the
-- legacy teacher fallback), the PROPOSED exact list 00080 would store, what
-- the conversion adds, and Finance exposure under the old ANY-OF gate
-- (finance:view | payments:view | payments:view_limited) versus the new gate
-- (finance:view only).

with presets(role_key, perms) as (
  values
    ('admin', '["dashboard:view","students:view","students:create","students:edit","students:view_finance","students:manage_affiliations","bookings:view","bookings:create","bookings:cancel","bookings:restore","attendance:view","attendance:mark_present","attendance:mark_absent","attendance:edit_history","checkin:view","checkin:scan","checkin:manual_checkin","payments:view","payments:mark_paid_reception","products:view","products:create","products:edit","products:archive","discounts:view","discounts:create","discounts:edit","discounts:preview","affiliations:view","affiliations:create","affiliations:edit","affiliations:verify","referrals:view","referrals:create","referrals:verify","referrals:reward","referrals:cancel","events:view","events:create","events:edit","events:mark_paid","classes:view","classes:create","classes:edit","classes:cancel","teachers:view","teachers:create","teachers:edit","settings:view","finance:view","finance:mark_paid"]'::jsonb),
    ('front_desk', '["dashboard:view","students:view","students:view_limited","bookings:view","bookings:create","bookings:cancel","attendance:view","attendance:mark_present","checkin:view","checkin:scan","checkin:manual_checkin","payments:view_limited","payments:mark_paid_reception","referrals:view","referrals:create","referrals:verify"]'::jsonb),
    ('teacher', '["dashboard:view","students:view_limited","bookings:view","attendance:view","attendance:mark_present","attendance:mark_absent","checkin:view","checkin:scan","checkin:manual_checkin","payments:view_limited","payments:mark_paid_reception"]'::jsonb),
    ('read_only', '["dashboard:view","students:view","bookings:view","attendance:view","checkin:view","payments:view","products:view","discounts:view","affiliations:view","referrals:view","events:view","classes:view","teachers:view","settings:view","finance:view"]'::jsonb)
),
-- Keys new to a preset in this release; the pre-00080 preset is `presets`
-- without them. Mirrors PRESET_ADDITIONS_00080 in lib/domain/permissions.ts.
preset_additions(role_key, keys) as (
  values ('teacher', array['attendance:mark_absent'])
),
staff as (
  select u.id, u.email, u.role::text as base_role, u.staff_role_key,
         coalesce(u.staff_status, 'active') as staff_status,
         case when jsonb_typeof(u.staff_permissions) = 'array'
              then u.staff_permissions else '[]'::jsonb end as stored
  from public.users u
  where u.staff_role_key is not null or u.role::text in ('admin', 'teacher')
),
resolved as (
  select s.*,
    case
      when s.staff_role_key is not null and s.staff_status <> 'active' then 'none (grant not active)'
      when s.staff_role_key = 'super_admin' then 'all (super_admin)'
      when s.staff_role_key is not null then 'explicit grant'
      when s.staff_status <> 'active' then 'none (status ' || s.staff_status || ')'
      when s.base_role = 'admin' then 'all (legacy admin fallback)'
      when s.base_role = 'teacher' then 'teacher preset (legacy teacher fallback)'
      else 'none'
    end as source,
    case
      when s.staff_role_key = 'super_admin' then null
      when s.staff_role_key = 'custom' then s.stored
      when s.staff_role_key is not null then (
        select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from (
          select jsonb_array_elements_text(pr.perms) p from presets pr where pr.role_key = s.staff_role_key
          union select jsonb_array_elements_text(s.stored)) m)
      when s.base_role = 'teacher' and s.staff_status = 'active' then
        (select perms from presets where role_key = 'teacher')
      else s.stored
    end as proposed_stored
  from staff s
),
compared as (
  select r.*,
    case
      when r.source like 'none%' then '[]'::jsonb
      when r.source like 'all%' then '"ALL"'::jsonb
      else (
        select coalesce(jsonb_agg(p order by p), '[]'::jsonb)
        from jsonb_array_elements_text(r.proposed_stored) p
        where not (
          p = any(coalesce(
            (select a.keys from preset_additions a
             where a.role_key = coalesce(r.staff_role_key, 'teacher')),
            '{}'::text[]))
          and not r.stored ? p))
    end as current_effective
  from resolved r
)
select
  email,
  base_role,
  staff_role_key,
  staff_status,
  stored as stored_permissions,
  source as current_effective_source,
  current_effective,
  case when staff_role_key = 'super_admin' then '"ALL (sentinel, stored list unchanged)"'::jsonb
       else proposed_stored end as proposed_post_00080_stored,
  case
    when source like 'none%' or source like 'all%' then '[]'::jsonb
    else (
      select coalesce(jsonb_agg(p order by p), '[]'::jsonb)
      from jsonb_array_elements_text(proposed_stored) p
      where not current_effective ? p)
  end as gained_by_00080,
  (source like 'all%') or (source not like 'none%' and (
      current_effective ? 'finance:view' or current_effective ? 'payments:view'
      or current_effective ? 'payments:view_limited')) as finance_today,
  (source like 'all%') or (source not like 'none%' and proposed_stored ? 'finance:view') as finance_after_fix,
  (source not like 'none%' and source not like 'all%'
      and not (current_effective ? 'finance:view')
      and (current_effective ? 'payments:view' or current_effective ? 'payments:view_limited')) as finance_only_via_payments,
  (staff_status <> 'active' and source not like 'none%') as inactive_with_access,
  (source like '%legacy%') as via_legacy_fallback
from compared
order by staff_role_key nulls first, email;
