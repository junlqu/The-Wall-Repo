// Single source for the admin area - the header's Admin menu, the admin
// dashboard's quadrants, and the statically generated /admin/[section] and
// /admin/[section]/[subpage] routes are all built from this list.

export type AdminSubpage = {
  slug: string;
  label: string;
};

export type AdminSection = {
  slug: string;
  title: string;
  description: string;
  subpages: AdminSubpage[];
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    slug: "announcements",
    title: "Announcements",
    description: "Update the community on features, new sets, events, CotW, closures, and more.",
    subpages: [
      { slug: "new", label: "Make new announcement" },
      { slug: "active", label: "See active announcements" },
      { slug: "archived", label: "See archived announcements" },
    ],
  },
  {
    slug: "climbs",
    title: "Climbs",
    description: "Setting, update and retire climbs, with import/export to excel.",
    subpages: [
      { slug: "new", label: "Add new climb" },
      { slug: "archive", label: "Archive climb" },
      { slug: "active", label: "See active climbs" },
      { slug: "archived", label: "See archived climbs" },
      { slug: "import", label: "Import climbs" },
      { slug: "export", label: "Export climbs" },
    ],
  },
  {
    slug: "equipment",
    title: "Equipment",
    description: "Track the gear on hand and retire what's worn out.",
    subpages: [
      { slug: "all", label: "See all equipment" },
      { slug: "new", label: "Add equipment" },
      { slug: "retire", label: "Retire equipment" },
    ],
  },
  {
    slug: "maintenance",
    title: "Maintenance",
    description: "Maintenance reports and logs database, with equipment tracking and scheduling.",
    subpages: [
      { slug: "new", label: "Start new maintenance report" },
      { slug: "all", label: "See all reports" },
    ],
  },
  {
    slug: "attendance",
    title: "Attendance",
    description: "Daily attendance, with weekly and monthly metrics.",
    subpages: [
      { slug: "all", label: "See all attendance" },
      { slug: "new", label: "Fill in attendance" },
    ],
  },
  {
    slug: "moderation",
    title: "Moderation",
    description: "Review online disputes and keep the comments civil.",
    subpages: [
      { slug: "grading-reports", label: "See grading reports" },
      { slug: "comments", label: "See all comments" },
    ],
  },
  {
    slug: "users",
    title: "User center",
    description: "Look up members and manage who can do what.",
    subpages: [
      { slug: "all", label: "All users" },
      { slug: "permissions", label: "User permissions" },
    ],
  },
];

export function adminSectionHref(section: AdminSection) {
  return `/admin/${section.slug}`;
}

export function adminSubpageHref(section: AdminSection, subpage: AdminSubpage) {
  return `/admin/${section.slug}/${subpage.slug}`;
}

export function getAdminSection(slug: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => section.slug === slug);
}
