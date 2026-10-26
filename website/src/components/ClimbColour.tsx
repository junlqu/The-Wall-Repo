import { type Climb, climbColour, swatchFor } from "@/lib/climbs";

export function Swatch({ colour, tape = false }: { colour: string; tape?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 ring-1 ring-black/10 ${tape ? "h-1.5 w-3 rounded-sm" : "h-2.5 w-2.5 rounded-full"}`}
      style={{ background: swatchFor(colour) }}
    />
  );
}

// A climb's hold colour(s) with dots, plus its tape when it has one.
export default function ClimbColour({ climb }: { climb: Pick<Climb, "colour" | "secondary" | "tape"> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="flex items-center gap-2">
        <span className="flex items-center gap-0.5">
          <Swatch colour={climb.colour} />
          {climb.secondary && <Swatch colour={climb.secondary} />}
        </span>
        {climbColour(climb)}
      </span>
      {climb.tape && (
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Swatch colour={climb.tape} tape />
          {climb.tape} tape
        </span>
      )}
    </span>
  );
}
