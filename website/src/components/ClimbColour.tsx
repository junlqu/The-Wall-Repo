import { type Climb, climbColour, swatchFor } from "@/lib/climbs";

// A combo's two colours as a dot cut at 45 degrees, its halves slid past each
// other along the cut with a sliver between them, so similar colours still read
// as two. In percents to stay in proportion at any size. Clipped rather than a
// gradient, as Multi-Colour is already a gradient of its own. The outline follows
// the halves, keeping pale colours visible.
export function SplitDot({ colour, secondary, className }: { colour: string; secondary: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 0 0.5px rgb(0 0 0 / 0.45))" }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: swatchFor(colour),
          clipPath: "polygon(0 0, 100% 0, 0 100%)",
          transform: "translate(-13%, 7%)",
        }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: swatchFor(secondary),
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          transform: "translate(13%, -7%)",
        }}
      />
    </span>
  );
}

export function Swatch({ colour, secondary, tape = false }: { colour: string; secondary?: string; tape?: boolean }) {
  if (secondary) return <SplitDot colour={colour} secondary={secondary} className="h-2.5 w-2.5" />;
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 ring-1 ring-black/10 ${tape ? "h-1.5 w-3 rounded-sm" : "h-2.5 w-2.5 rounded-full"}`}
      style={{ background: swatchFor(colour) }}
    />
  );
}

// A climb's hold colour(s) with dots, plus its tape when it has one - beside
// them where there's room, or always on its own row when `stacked`. With
// `tapeRow` the tape row is always there, saying so when there's no tape, so
// a list of them lines up.
export default function ClimbColour({
  climb,
  stacked = false,
  tapeRow = false,
}: {
  climb: Pick<Climb, "colour" | "secondary" | "tape">;
  stacked?: boolean;
  tapeRow?: boolean;
}) {
  return (
    <span className={`flex gap-x-2.5 gap-y-1 ${stacked || tapeRow ? "flex-col items-start" : "flex-wrap items-center"}`}>
      <span className="flex items-center gap-2">
        <Swatch colour={climb.colour} secondary={climb.secondary} />
        {climbColour(climb)}
      </span>
      {climb.tape ? (
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Swatch colour={climb.tape} tape />
          {climb.tape} tape
        </span>
      ) : (
        tapeRow && <span className="text-xs text-neutral-400">No tape</span>
      )}
    </span>
  );
}
