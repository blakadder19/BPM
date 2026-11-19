/**
 * The event title a new event purchase freezes (`event_title_snapshot`,
 * migration 00082). Read from the event record at the moment the purchase
 * row is created, so renaming the event later never rewrites what an old
 * receipt shows. Throws rather than freezing a blank title.
 */
export function freezeEventTitle(title: string | null | undefined): string {
  const t = title?.trim();
  if (!t) throw new Error("Cannot create an event purchase without an event title to freeze.");
  return t;
}
