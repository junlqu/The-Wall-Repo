// `size` is the icon's diameter in px; the "i" scales with it.
export default function InfoTip({ text, size = 16 }: { text: string; size?: number }) {
  // Pure CSS hover/focus (no click-toggle state) - a JS click handler here
  // would double-fire on touch devices, since a tap synthesizes both a
  // hover-like event and a click in quick succession, toggling it straight
  // back off. Focus-within covers tapping on mobile (tapping the button
  // focuses it), while group-hover covers desktop mouse hover.
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={text}
        // Inline style rather than Tailwind classes, since Tailwind can't
        // generate classes for sizes only known at runtime.
        style={{ width: size, height: size, fontSize: size * 0.625 }}
        className="flex shrink-0 items-center justify-center rounded-full border border-neutral-400 font-bold text-neutral-500"
      >
        i
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-40 mt-1 w-44 -translate-x-1/2 rounded-md bg-neutral-800 px-2 py-1 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100">
        {text}
      </span>
    </span>
  );
}
