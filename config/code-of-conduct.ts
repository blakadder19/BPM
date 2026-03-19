export interface CodeOfConductVersion {
  version: string;
  title: string;
  lastUpdated: string;
  sections: { heading: string; body: string }[];
}

export const CURRENT_CODE_OF_CONDUCT: CodeOfConductVersion = {
  version: "1.0",
  title: "BPM Code of Conduct",
  lastUpdated: "2026-01-15",
  sections: [
    {
      heading: "Respect & Inclusivity",
      body: "BPM is a welcoming and inclusive community. All students, teachers, and staff are expected to treat each other with respect regardless of background, experience level, or dance ability. Harassment, discrimination, or intimidation of any kind will not be tolerated.",
    },
    {
      heading: "Hygiene & Personal Care",
      body: "Good personal hygiene is essential for an enjoyable partner dance experience. Please shower before class, use deodorant, bring a clean change of shirt for longer sessions, and avoid strong perfumes. Carry breath mints if needed.",
    },
    {
      heading: "Consent & Boundaries",
      body: "Always ask before adjusting another dancer's hold or position. Respect personal boundaries and comfort levels. If someone declines a dance or requests a different hold, accept gracefully. Report any concerns to staff immediately.",
    },
    {
      heading: "Class Etiquette",
      body: "Arrive on time. Late arrivals disrupt the flow for everyone. Follow teacher instructions and rotate partners when directed. Keep conversations to breaks. Mobile phones should be silenced during class.",
    },
    {
      heading: "Booking & Cancellation Policy",
      body: "Honour your bookings. If you cannot attend, cancel as early as possible to free the spot for others. Late cancellations (within 60 minutes of class) may incur a \u20AC2 fee. Repeated no-shows may result in further action.",
    },
    {
      heading: "Safety",
      body: "Dance within your ability level. Report any injuries to the teacher immediately. Keep the dance floor clear of bags, water bottles, and personal items. Wear appropriate dance shoes \u2014 no street shoes on the dance floor.",
    },
    {
      heading: "Venue Care",
      body: "Treat the venue with care. Clean up after yourself. Report any damage or safety concerns to staff. Do not bring food or drinks onto the dance floor.",
    },
  ],
};
