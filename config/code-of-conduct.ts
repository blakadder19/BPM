export interface CodeOfConductVersion {
  version: string;
  title: string;
  lastUpdated: string;
  sections: { heading: string; body: string }[];
}

export const CURRENT_CODE_OF_CONDUCT: CodeOfConductVersion = {
  version: "2.0",
  title: "Student Liability & Responsibility Policy",
  lastUpdated: "2026-04-01",
  sections: [
    {
      heading: "1. Purpose",
      body: "This policy outlines the responsibilities of students, members, and attendees of BPM Dance Studio in relation to the care, use, and respect of Studio property, facilities, equipment, and the property of others.",
    },
    {
      heading: "2. Scope",
      body: "This policy applies to all individuals attending BPM Dance Studio, including students, members, drop-in attendees, workshop and event participants, and visitors at BPM-operated activities.",
    },
    {
      heading: "3. Responsibility for Studio Property",
      body: "All attendees are expected to treat the Studio premises, furnishings, fixtures, and equipment with care, use equipment only for its intended purpose, and report accidental damage immediately.",
    },
    {
      heading: "4. Damage, Vandalism & Misuse",
      body: "Where damage is caused by deliberate action, reckless behaviour, negligence, or failure to follow Studio rules, the responsible individual may be held financially liable for reasonable repair, replacement, or cleaning costs.",
    },
    {
      heading: "5. Theft & Removal of Property",
      body: "The removal of Studio property without permission or interference with the personal belongings of others may result in investigation, suspension of access, or referral to law enforcement where appropriate.",
    },
    {
      heading: "6. Disciplinary Action",
      body: "Depending on severity, BPM Dance Studio may require reimbursement, issue warnings, suspend or terminate access or membership without refund, exclude individuals from future activities, or report matters to relevant authorities.",
    },
    {
      heading: "7. Minors",
      body: "Where the responsible individual is under 18, parents or legal guardians may be held responsible for damage or loss to the extent permitted by law.",
    },
    {
      heading: "8. Appeals & Disputes",
      body: "Individuals may submit a written explanation or dispute. BPM Dance Studio will review all relevant information before making a final decision.",
    },
    {
      heading: "9. Relationship to Other Policies",
      body: "This policy should be read in conjunction with the BPM Behaviour Policy & Code of Conduct, Terms & Conditions, and Health & Safety Policy.",
    },
    {
      heading: "10. Policy Review",
      body: "BPM Dance Studio reserves the right to review and update this policy. Any material changes will be communicated in advance.",
    },
  ],
};
