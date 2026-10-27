// Single source for the site navigation - the header and the footer both
// build their tabs from these lists so the two never drift apart.

export type NavLink = {
  label: string;
  href: string;
};

export const CLIMBS_LINKS: NavLink[] = [
  { label: "All Climbs", href: "/climbs" },
  { label: "Routes", href: "/climbs/routes" },
  { label: "Boulders", href: "/climbs/boulders" },
  { label: "Combos", href: "/climbs/combos" },
  { label: "Archives", href: "/climbs/archives" },
];

export const EXTRAS_LINKS: NavLink[] = [
  { label: "Combo Roulette", href: "/extras/comboroulette" },
  { label: "Twister", href: "/extras/twister" },
  { label: "Speed Climbing", href: "/extras/speedclimbing" },
];

export const ACCOUNT_LINKS: NavLink[] = [
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
];
