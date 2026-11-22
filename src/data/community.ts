export interface VolunteerTeam {
  id: string;
  name: string;
  description: string;
}

// Sources: archived volunteer-teams page and original event descriptions.
// Firsthand corrections take precedence over responsibilities listed in older records.
export const VOLUNTEER_TEAMS: VolunteerTeam[] = [
  {
    id: "cafe",
    name: "Cafe",
    description: "Cafe volunteers learned how to work in a coffeeshop, helped organize training for newcomers, and served customers during open hours.",
  },
  {
    id: "events-partnerships",
    name: "Events & Partnerships",
    description: "This team helped with community outreach, partnerships with local educational institutions and organizations, acquiring resources for free distribution, and many forms of event planning and coordination.",
  },
  {
    id: "fundraising",
    name: "Fundraising",
    description: "These volunteers coordinated a wide variety of fundraising activities, including coffee sales, community events, grant writing, and crowd funding campaigns.",
  },
  {
    id: "social-media",
    name: "Social Media",
    description: "Social media volunteers managed Liminal's online presence and curated content to promote events and other activities.",
  },
  {
    id: "renovations",
    name: "Renovations",
    description: "Renovation volunteers helped with planning and carrying out renovations on Liminal's physical space.",
  },
  {
    id: "administrative",
    name: "Administrative",
    description: "Administrative volunteers helped with administrative tasks, including sending emails, managing important documents, organizing team meetings, overseeing legal compliance, and bookkeeping.",
  },
];
