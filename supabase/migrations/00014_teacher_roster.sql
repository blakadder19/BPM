-- Teacher roster: standalone teacher entries managed by admin.
-- These are NOT auth users — they are simple roster entries used
-- for scheduling and assignment purposes.

create table teacher_roster (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies(id),
  full_name       text not null,
  email           text,
  phone           text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table teacher_roster enable row level security;

create policy "Anyone authenticated can view teacher roster"
  on teacher_roster for select
  to authenticated using (true);

create policy "Admins manage teacher roster"
  on teacher_roster for all
  to authenticated using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger trg_teacher_roster_updated_at
  before update on teacher_roster
  for each row execute function update_updated_at();

-- Default teacher assignments: which teacher(s) teach which class template.
create table teacher_default_assignments (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references academies(id),
  class_id        uuid not null references classes(id) on delete cascade,
  class_title     text not null,
  teacher_1_id    uuid not null references teacher_roster(id) on delete cascade,
  teacher_2_id    uuid references teacher_roster(id) on delete set null,
  effective_from  date not null default current_date,
  effective_until date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table teacher_default_assignments enable row level security;

create policy "Anyone authenticated can view teacher assignments"
  on teacher_default_assignments for select
  to authenticated using (true);

create policy "Admins manage teacher assignments"
  on teacher_default_assignments for all
  to authenticated using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

create index idx_teacher_default_assignments_class on teacher_default_assignments(class_id);
create index idx_teacher_roster_academy on teacher_roster(academy_id);
