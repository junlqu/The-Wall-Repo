import { swatchFor } from "@/lib/climbs";

// A `small` row draws its dots smaller, for a line that's only along for the ride.
export type ColourGridRow = { line: number; colours: { key: string; name: string }[]; small?: boolean };

// Lines' colours as dots, one row a line, to pick or leave out. `picked` holds
// the colours' keys, which tell the same colour on two lines apart. Every dot
// sits in the same size slot, so small rows keep the spacing of the rest and
// their dots line up with the rows above and below.
export default function ColourGrid({
  rows,
  picked,
  onToggle,
}: {
  rows: ColourGridRow[];
  picked: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ line, colours, small }) => (
        <div key={line} role="group" aria-label={`Line ${line}`} className="flex min-h-8 items-start gap-3">
          <span aria-hidden="true" className="w-3 shrink-0 pt-1.5 text-xs font-bold text-neutral-400 tabular-nums">
            {line}
          </span>
          {colours.length === 0 ? (
            <span aria-hidden="true" className="pt-1 text-neutral-300">
              —
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {colours.map((colour) => {
                const on = picked.includes(colour.key);
                return (
                  <span key={colour.key} className="flex h-8 w-8 items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onToggle(colour.key)}
                      aria-pressed={on}
                      aria-label={`${colour.name} on line ${line}`}
                      title={colour.name}
                      className={`rounded-full transition-shadow focus-visible:outline-none ${small ? "h-7 w-7" : "h-8 w-8"} ${
                        on
                          ? "ring-2 ring-primary ring-offset-2"
                          : "ring-1 ring-black/10 hover:ring-2 hover:ring-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-400"
                      }`}
                      style={{ background: swatchFor(colour.name) }}
                    />
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
