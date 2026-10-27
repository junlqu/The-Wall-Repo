// A two-way slider between two named views - "Numbers ⬤ Earnings". The
// highlighted name is the one showing; clicking anywhere flips it.
export default function ToggleSwitch({
  off,
  on,
  checked,
  onChange,
  label,
}: {
  off: string;
  on: string;
  // true shows `on`.
  checked: boolean;
  onChange: (checked: boolean) => void;
  // The switch's accessible name, read with its on/off state - "Show earnings".
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs font-semibold"
    >
      <span aria-hidden="true" className={`transition-colors ${checked ? "text-neutral-400" : "text-primary"}`}>
        {off}
      </span>
      <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-primary">
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
      <span aria-hidden="true" className={`transition-colors ${checked ? "text-primary" : "text-neutral-400"}`}>
        {on}
      </span>
    </button>
  );
}
