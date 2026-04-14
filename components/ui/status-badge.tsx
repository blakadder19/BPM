import { Badge } from "./badge";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  open:             { label: "Open",           variant: "success" },
  scheduled:        { label: "Scheduled",      variant: "default" },
  closed:           { label: "Closed",         variant: "info" },
  cancelled:        { label: "Cancelled",      variant: "danger" },
  live:             { label: "Live",           variant: "warning" },
  ended:            { label: "Ended",          variant: "default" },
  confirmed:        { label: "Confirmed",      variant: "success" },
  checked_in:       { label: "Checked In",     variant: "success" },
  waiting:          { label: "Waiting",        variant: "warning" },
  offered:          { label: "Offered",        variant: "info" },
  promoted:         { label: "Promoted",       variant: "success" },
  expired:          { label: "Expired",        variant: "default" },
  present:          { label: "Present",        variant: "success" },
  absent:           { label: "Absent",         variant: "danger" },
  late:             { label: "Late",           variant: "warning" },
  excused:          { label: "Excused",        variant: "info" },
  active:           { label: "Active",         variant: "success" },
  paused:           { label: "Paused",         variant: "warning" },
  exhausted:        { label: "Finished",       variant: "default" },
  finished:         { label: "Finished",       variant: "default" },
  replaced:         { label: "Replaced",       variant: "info" },
  renewed:          { label: "Renewed",        variant: "success" },
  renewal:          { label: "Renewal",        variant: "info" },
  membership:       { label: "Membership",     variant: "info" },
  pass:             { label: "Pass",           variant: "info" },
  pack:             { label: "Pack",           variant: "info" },
  drop_in:          { label: "Drop-in",        variant: "default" },
  promo_pass:       { label: "Promo Pass",     variant: "warning" },
  draft:            { label: "Draft",          variant: "default" },
  published:        { label: "Published",      variant: "success" },
  workshop:         { label: "Workshop",       variant: "info" },
  intensive:        { label: "Intensive",      variant: "warning" },
  masterclass:      { label: "Masterclass",    variant: "info" },
  full_pass:        { label: "Full Pass",      variant: "success" },
  combo_pass:       { label: "Combo Pass",     variant: "info" },
  single_session:   { label: "Single Session", variant: "default" },
  social_ticket:    { label: "Social Ticket",  variant: "info" },
  paid:             { label: "Paid",           variant: "success" },
  refunded:         { label: "Refunded",       variant: "default" },
  upcoming:         { label: "Upcoming",       variant: "info" },
  past:             { label: "Past",           variant: "default" },
  late_cancel:      { label: "Late Cancel",    variant: "warning" },
  late_cancelled:   { label: "Late Cancelled", variant: "warning" },
  missed:           { label: "Missed",         variant: "danger" },
  no_show:          { label: "No-show",        variant: "danger" },
  class:            { label: "Class",          variant: "info" },
  social:           { label: "Social",         variant: "default" },
  student_practice: { label: "Practice",       variant: "warning" },
  leader:           { label: "Leader",         variant: "info" },
  follower:         { label: "Follower",       variant: "warning" },
  subscription:     { label: "Subscription",   variant: "info" },
  admin:            { label: "Admin",          variant: "default" },
  walk_in:          { label: "Walk-in",        variant: "default" },
  waitlist_promotion: { label: "Waitlist Promo", variant: "success" },
  birthday:         { label: "Birthday",       variant: "success" },
  provisional:      { label: "Provisional",    variant: "warning" },
  bookable:         { label: "Bookable",       variant: "success" },
  already_booked:   { label: "Booked",         variant: "info" },
  already_waitlisted: { label: "Waitlisted",   variant: "warning" },
  waitlistable:     { label: "Join Waitlist",  variant: "warning" },
  restore_available: { label: "Restorable",    variant: "warning" },
  blocked:          { label: "Blocked",        variant: "danger" },
  not_bookable:     { label: "Not Bookable",   variant: "default" },
  pay_at_reception: { label: "Pay at Reception", variant: "default" },
  intake_closed:    { label: "Intake Closed",  variant: "warning" },
  credit_deducted:  { label: "Resolved (credit)", variant: "success" },
  monetary_pending: { label: "Unresolved",     variant: "danger" },
  waived:                { label: "Waived",              variant: "default" },
  attendance_corrected:  { label: "Attendance Corrected", variant: "default" },
  enquiry:               { label: "Enquiry",             variant: "info" },
  pending:               { label: "Pending",             variant: "warning" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: "default" as BadgeVariant,
  };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
