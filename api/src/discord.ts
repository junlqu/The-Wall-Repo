import { InvocationContext } from "@azure/functions";
import { Announcement, AnnouncementClimb, AnnouncementType, SetKind } from "./models/Announcement";

// Discord's own limits on an embed.
const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4096;

// Mirrors the labels in website/src/lib/announcements.ts.
const TYPE_LABELS: Record<AnnouncementType, string> = {
  cotw: "CotW",
  sets: "Sets",
  events: "Events",
  closures: "Closures",
  features: "Features",
  updates: "Updates",
  reminders: "Reminders",
  misc: "Misc",
};

const SET_KIND_LABELS: Record<SetKind, string> = {
  new: "New set",
  takedown: "Takedown",
  replaced: "Reset",
};

// Embed colour by priority, lowest to highest.
const PRIORITY_COLOURS = { low: 0x737373, medium: 0x3b82f6, high: 0xf59e0b, urgent: 0xef4444 };

function truncate(text: string, length: number) {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

// e.g. "Route · Red/Blue 5.10a · line 3", with ⬆/⬇ for a reset's climbs.
function describeClimb(climb: AnnouncementClimb) {
  const colour = climb.secondary ? `${climb.colour}/${climb.secondary}` : climb.colour;
  const type = climb.type[0].toUpperCase() + climb.type.slice(1);
  const parts = [type, `${colour} ${climb.grade}`.trim()];
  if (climb.line !== undefined) parts.push(`line ${climb.line}`);
  const change = climb.change === "up" ? "⬆ " : climb.change === "down" ? "⬇ " : "";
  return `- ${change}${parts.join(" · ")}`;
}

function describeDates({ targetDate, targetEndDate }: Announcement) {
  if (!targetDate) return undefined;
  return targetEndDate ? `${targetDate} to ${targetEndDate}` : targetDate;
}

function toEmbed(announcement: Announcement) {
  const { type, priority, title, author, announcedAt, announcement: content } = announcement;
  const body: string[] = [];
  if (content.details) body.push(content.details);
  if (content.climbs) body.push(content.climbs.map(describeClimb).join("\n"));
  for (const [label, text] of [
    ["Scoring", content.scoring],
    ["Rules", content.rules],
    ["Remarks", content.remarks],
  ] as const) {
    if (text) body.push(`**${label}**\n${text}`);
  }

  const dates = describeDates(announcement);
  const label = content.setKind ? SET_KIND_LABELS[content.setKind] : TYPE_LABELS[type];
  return {
    title: truncate(title, MAX_TITLE_LENGTH),
    description: truncate(body.join("\n\n"), MAX_DESCRIPTION_LENGTH),
    color: PRIORITY_COLOURS[priority],
    fields: dates ? [{ name: "When", value: dates, inline: true }] : [],
    footer: { text: `${label} · posted by ${author}` },
    timestamp: announcedAt,
  };
}

// The app setting holding the webhook for each type that has its own channel.
// Every other type goes to ANNOUNCEMENT_URL.
const WEBHOOK_SETTINGS: Partial<Record<AnnouncementType, string>> = {
  sets: "SETS_URL",
  cotw: "COTW_URL",
};

// Posts a new announcement to its Discord channel's webhook (see
// WEBHOOK_SETTINGS). A missing webhook or a failure is only logged - the
// announcement is already saved either way.
export async function notifyDiscord(announcement: Announcement, context: InvocationContext) {
  const setting = WEBHOOK_SETTINGS[announcement.type] ?? "ANNOUNCEMENT_URL";
  const url = process.env[setting];
  if (!url) {
    context.warn(`Missing ${setting} app setting, so the announcement wasn't posted to Discord.`);
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [toEmbed(announcement)], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      context.warn(`Discord webhook answered ${response.status}`, await response.text());
    }
  } catch (error) {
    context.warn("Failed to post the announcement to Discord", error);
  }
}
