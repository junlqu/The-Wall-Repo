// The tabs down the side of the settings page, grouped into categories. Each
// tab is its own address - /settings?tab=<id> - so a link can open straight to
// one. The first tab of the first category is the one /settings opens on.

const TABS = {
  profile: { label: "Profile", description: "Your picture and name - how you appear on the wall." },
  account: { label: "Account", description: "Your username, and the email and phone you can log in with." },
  password: { label: "Password", description: "Change the password you log in with." },
  privacy: { label: "Privacy", description: "Choose what others can see on your profile." },
  preferences: { label: "Preferences", description: "Choose how the site works for you." },
  accessibility: { label: "Accessibility", description: "Make the site easier to see and use." },
  dashboard: { label: "Dashboard", description: "Choose what your dashboard shows." },
  cookies: { label: "Cookies", description: "Manage what the site keeps in your browser." },
  "data-privacy": { label: "Data Privacy", description: "How your data is kept and used." },
  "account-status": { label: "Account Status", description: "Manage your account, including deleting it." },
} as const;

export type SettingsTabID = keyof typeof TABS;
export type SettingsTab = { id: SettingsTabID; label: string; description: string };
export type SettingsCategory = { label: string; tabs: SettingsTab[] };

const tab = (id: SettingsTabID): SettingsTab => ({ id, ...TABS[id] });

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { label: "Personal", tabs: [tab("profile"), tab("account"), tab("password"), tab("privacy")] },
  { label: "General", tabs: [tab("preferences"), tab("accessibility"), tab("dashboard")] },
  { label: "Data & Privacy", tabs: [tab("cookies"), tab("data-privacy"), tab("account-status")] },
];

export const SETTINGS_TABS = SETTINGS_CATEGORIES.flatMap((category) => category.tabs);

const DEFAULT_TAB = SETTINGS_TABS[0].id;

export function settingsHref(id: SettingsTabID = DEFAULT_TAB) {
  return id === DEFAULT_TAB ? "/settings" : `/settings?tab=${id}`;
}

// What ?tab= opens - anything unknown falls back to the first tab.
export function toSettingsTab(value: string | null | undefined): SettingsTabID {
  return SETTINGS_TABS.find((item) => item.id === value)?.id ?? DEFAULT_TAB;
}

export function settingsCategoryOf(id: SettingsTabID): SettingsCategory {
  return SETTINGS_CATEGORIES.find((category) => category.tabs.some((item) => item.id === id))!;
}
