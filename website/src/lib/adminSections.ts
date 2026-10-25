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
    description: "Post news to the wall and manage what's live.",
    subpages: [
      { slug: "new", label: "Make new announcement" },
      { slug: "active", label: "See active announcements" },
      { slug: "archived", label: "See archived announcements" },
    ],
  },
  {
    slug: "climbs",
    title: "Climbs",
    description: "Set, retire, and move climbs in and out of the archives.",
    subpages: [
      { slug: "new", label: "Add new climb" },
      { slug: "archive", label: "Archive climb" },
      { slug: "active", label: "See active climbs" },
      { slug: "archived", label: "See archived climbs" },
      { slug: "import-export", label: "Import/Export climbs" },
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
    description: "Log wall and gear issues and follow them to a fix.",
    subpages: [
      { slug: "new", label: "Start new maintenance report" },
      { slug: "all", label: "See all reports" },
    ],
  },
  {
    slug: "attendance",
    title: "Attendance",
    description: "Record who came in and look back at past sessions.",
    subpages: [
      { slug: "all", label: "See all attendance" },
      { slug: "new", label: "Fill in attendance" },
    ],
  },
  {
    slug: "moderation",
    title: "Moderation",
    description: "Review grade disputes and keep the comments civil.",
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
