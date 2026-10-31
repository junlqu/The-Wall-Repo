import Link from "next/link";
import { ArrowIcon, Grade, lineLabel } from "@/components/AnnouncementClimbPicker";
import ClimbColour from "@/components/ClimbColour";
import { type Announcement, COTW_SECTIONS, SET_KINDS } from "@/lib/announcements";
import { climbHref } from "@/lib/climbs";

const HEADING_CLASS = "text-xs font-semibold uppercase tracking-wide";
const TEXT_CLASS = "whitespace-pre-line text-sm";

export function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
      <path
        fillRule="evenodd"
        d="M.66 10.59a1.65 1.65 0 0 1 0-1.19A10 10 0 0 1 10 3c4.26 0 7.9 2.67 9.34 6.41.15.38.15.8 0 1.19A10 10 0 0 1 10 17c-4.26 0-7.9-2.67-9.34-6.41zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Text colours for a light background, or a dark one (`onDark`).
function tones(onDark: boolean) {
  return {
    heading: `${HEADING_CLASS} ${onDark ? "text-white/60" : "text-neutral-500"}`,
    text: `${TEXT_CLASS} ${onDark ? "text-white/85" : "text-neutral-700"}`,
  };
}

function Section({ heading, text, onDark }: { heading: string; text: string; onDark: boolean }) {
  const tone = tones(onDark);
  return (
    <div className="flex flex-col gap-1">
      <h4 className={tone.heading}>{heading}</h4>
      <p className={tone.text}>{text}</p>
    </div>
  );
}

function ClimbList({ announcement, onDark }: { announcement: Announcement; onDark: boolean }) {
  const { setKind, climbs = [] } = announcement.content;
  const isReplaced = setKind === "replaced";

  return (
    <div className="flex flex-col gap-1">
      <h4 className={tones(onDark).heading}>{setKind ? SET_KINDS[setKind].label : "Climbs"}</h4>
      <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-200 bg-white text-sm text-neutral-700">
        {climbs.map((climb) => (
          <li key={climb.routeID}>
            <Link
              href={climbHref(climb.routeID)}
              className={`group grid items-center gap-2 px-3 py-2 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary sm:grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_4rem] sm:gap-3 ${
                isReplaced ? "grid-cols-[1rem_minmax(0,1fr)_4rem]" : "grid-cols-[minmax(0,1fr)_4rem]"
              }`}
            >
              {isReplaced ? (
                <span
                  title={climb.change === "down" ? "Taken down" : "Put up"}
                  className={climb.change === "down" ? "text-red-600" : "text-green-600"}
                >
                  <ArrowIcon direction={climb.change ?? "up"} />
                  <span className="sr-only">{climb.change === "down" ? "Taken down" : "Put up"}</span>
                </span>
              ) : (
                <span className="hidden sm:block" />
              )}
              {/* Stacked on a phone, where a row is too narrow for both. */}
              <span className="flex min-w-0 flex-col gap-0.5 sm:contents">
                <span className="text-xs text-neutral-500 sm:text-sm sm:text-neutral-700">{lineLabel(climb.line)}</span>
                <ClimbColour climb={climb} />
              </span>
              <span className="flex items-center justify-between gap-1">
                <Grade grade={climb.grade} />
                <span aria-hidden="true" className="text-neutral-400 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Everything an announcement says: a CotW's parts under their headings, a
// sets announcement's climbs, or the text of any other. `onDark` lightens the
// text for a dark background.
export default function AnnouncementDetails({
  announcement,
  onDark = false,
}: {
  announcement: Announcement;
  onDark?: boolean;
}) {
  const { content } = announcement;

  if (announcement.type === "cotw") {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        {COTW_SECTIONS.map(({ key, label }) =>
          content[key] ? <Section key={key} heading={label} text={content[key]} onDark={onDark} /> : null,
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {content.details && <p className={tones(onDark).text}>{content.details}</p>}
      {announcement.type === "sets" && <ClimbList announcement={announcement} onDark={onDark} />}
    </div>
  );
}
