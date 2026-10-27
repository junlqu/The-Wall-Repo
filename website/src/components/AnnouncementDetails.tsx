import { ArrowIcon, Grade, lineLabel } from "@/components/AnnouncementClimbPicker";
import ClimbColour from "@/components/ClimbColour";
import { type Announcement, COTW_SECTIONS, SET_KINDS } from "@/lib/announcements";

const HEADING_CLASS = "text-xs font-semibold uppercase tracking-wide text-neutral-500";
const TEXT_CLASS = "whitespace-pre-line text-sm text-neutral-700";

function Section({ heading, text }: { heading: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className={HEADING_CLASS}>{heading}</h4>
      <p className={TEXT_CLASS}>{text}</p>
    </div>
  );
}

function ClimbList({ announcement }: { announcement: Announcement }) {
  const { setKind, climbs = [] } = announcement.content;
  const isReplaced = setKind === "replaced";

  return (
    <div className="flex flex-col gap-1">
      <h4 className={HEADING_CLASS}>{setKind ? SET_KINDS[setKind].label : "Climbs"}</h4>
      <ul className="flex flex-col divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white text-sm text-neutral-700">
        {climbs.map((climb) => (
          <li key={climb.routeID} className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_4rem] items-center gap-3 px-3 py-2">
            {isReplaced ? (
              <span
                title={climb.change === "down" ? "Taken down" : "Put up"}
                className={climb.change === "down" ? "text-red-600" : "text-green-600"}
              >
                <ArrowIcon direction={climb.change ?? "up"} />
                <span className="sr-only">{climb.change === "down" ? "Taken down" : "Put up"}</span>
              </span>
            ) : (
              <span />
            )}
            <span>{lineLabel(climb.line)}</span>
            <ClimbColour climb={climb} />
            <Grade grade={climb.grade} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Everything an announcement says: a CotW's parts under their headings, a
// sets announcement's climbs, or the text of any other.
export default function AnnouncementDetails({ announcement }: { announcement: Announcement }) {
  const { content } = announcement;

  if (announcement.type === "cotw") {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        {COTW_SECTIONS.map(({ key, label }) =>
          content[key] ? <Section key={key} heading={label} text={content[key]} /> : null,
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {content.details && <p className={TEXT_CLASS}>{content.details}</p>}
      {announcement.type === "sets" && <ClimbList announcement={announcement} />}
    </div>
  );
}
