-- ============================================================
-- BPM Booking System · Migration 00007
-- Row-Level Security policies for all tables
-- ============================================================

-- ── Helper functions ────────────────────────────────────────

create or replace function public.current_user_role()
returns user_role as $$
  select role from users where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.is_admin()
returns boolean as $$
  select current_user_role() = 'admin';
$$ language sql security definer stable;

create or replace function public.is_teacher()
returns boolean as $$
  select current_user_role() = 'teacher';
$$ language sql security definer stable;

create or replace function public.current_academy_id()
returns uuid as $$
  select academy_id from users where id = auth.uid();
$$ language sql security definer stable;


-- ── Academies ───────────────────────────────────────────────
create policy "Users can view own academy"
  on academies for select
  using (id = current_academy_id());

create policy "Admins can manage academy"
  on academies for all
  using (is_admin() and id = current_academy_id());


-- ── Users ───────────────────────────────────────────────────
create policy "Users can view own record"
  on users for select
  using (id = auth.uid());

create policy "Admins can view all users in academy"
  on users for select
  using (is_admin() and academy_id = current_academy_id());

create policy "Admins can manage users in academy"
  on users for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Student profiles ────────────────────────────────────────
create policy "Students can view own profile"
  on student_profiles for select
  using (id = auth.uid());

create policy "Students can update own profile"
  on student_profiles for update
  using (id = auth.uid());

create policy "Admins can manage student profiles"
  on student_profiles for all
  using (is_admin());


-- ── Teacher profiles ────────────────────────────────────────
create policy "Teachers can view own profile"
  on teacher_profiles for select
  using (id = auth.uid());

create policy "Admins can manage teacher profiles"
  on teacher_profiles for all
  using (is_admin());


-- ── Dance styles (read-only for all, admin manages) ────────
create policy "Anyone authenticated can view dance styles"
  on dance_styles for select
  using (auth.uid() is not null);

create policy "Admins can manage dance styles"
  on dance_styles for all
  using (is_admin());


-- ── Classes (templates) ─────────────────────────────────────
create policy "Anyone authenticated can view active classes"
  on classes for select
  using (auth.uid() is not null);

create policy "Admins can manage classes"
  on classes for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Teacher pairs ───────────────────────────────────────────
create policy "Anyone authenticated can view teacher pairs"
  on teacher_pairs for select
  using (auth.uid() is not null);

create policy "Admins can manage teacher pairs"
  on teacher_pairs for all
  using (is_admin());


-- ── Bookable classes (instances) ────────────────────────────
create policy "Anyone authenticated can view non-draft instances"
  on bookable_classes for select
  using (auth.uid() is not null and status != 'cancelled');

create policy "Admins can view all instances"
  on bookable_classes for select
  using (is_admin());

create policy "Admins can manage instances"
  on bookable_classes for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Bookings ────────────────────────────────────────────────
create policy "Students can view own bookings"
  on bookings for select
  using (student_id = auth.uid());

create policy "Students can create bookings"
  on bookings for insert
  with check (student_id = auth.uid());

create policy "Students can cancel own bookings"
  on bookings for update
  using (student_id = auth.uid());

create policy "Admins can manage all bookings"
  on bookings for all
  using (is_admin());

create policy "Teachers can view bookings for their classes"
  on bookings for select
  using (is_teacher());


-- ── Waitlist ────────────────────────────────────────────────
create policy "Students can view own waitlist entries"
  on waitlist for select
  using (student_id = auth.uid());

create policy "Students can join waitlist"
  on waitlist for insert
  with check (student_id = auth.uid());

create policy "Admins can manage waitlist"
  on waitlist for all
  using (is_admin());


-- ── Attendance ──────────────────────────────────────────────
create policy "Students can view own attendance"
  on attendance for select
  using (student_id = auth.uid());

create policy "Admins can manage attendance"
  on attendance for all
  using (is_admin());

create policy "Teachers can manage attendance"
  on attendance for all
  using (is_teacher());


-- ── Products ────────────────────────────────────────────────
create policy "Anyone authenticated can view active products"
  on products for select
  using (auth.uid() is not null and is_active = true);

create policy "Admins can manage products"
  on products for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Student subscriptions ───────────────────────────────────
create policy "Students can view own subscriptions"
  on student_subscriptions for select
  using (student_id = auth.uid());

create policy "Admins can manage subscriptions"
  on student_subscriptions for all
  using (is_admin());


-- ── Wallet transactions ─────────────────────────────────────
create policy "Students can view own transactions"
  on wallet_transactions for select
  using (student_id = auth.uid());

create policy "Admins can manage transactions"
  on wallet_transactions for all
  using (is_admin());


-- ── Payments ────────────────────────────────────────────────
create policy "Students can view own payments"
  on payments for select
  using (student_id = auth.uid());

create policy "Admins can manage payments"
  on payments for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Penalties ───────────────────────────────────────────────
create policy "Students can view own penalties"
  on penalties for select
  using (student_id = auth.uid());

create policy "Admins can manage penalties"
  on penalties for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Business rules ──────────────────────────────────────────
create policy "Anyone authenticated can view business rules"
  on business_rules for select
  using (auth.uid() is not null);

create policy "Admins can manage business rules"
  on business_rules for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Admin tasks ─────────────────────────────────────────────
create policy "Admins can view and create admin tasks"
  on admin_tasks for all
  using (is_admin() and academy_id = current_academy_id());
