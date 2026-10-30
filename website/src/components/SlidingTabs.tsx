// Three-way (or more) slider for switching a chart between views. The white
// thumb slides under whichever is chosen.
export default function SlidingTabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  className = "w-44",
}: {
  label: string;
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  // Sets the width - the tabs share it equally.
  className?: string;
}) {
  const index = tabs.findIndex((tab) => tab.id === active);
  return (
    <div role="tablist" aria-label={label} className={`relative flex rounded-md bg-neutral-200/70 p-0.5 ${className}`}>
      <span
        aria-hidden="true"
        style={{ width: `calc((100% - 0.25rem) / ${tabs.length})`, transform: `translateX(${index * 100}%)` }}
        className="absolute inset-y-0.5 left-0.5 rounded bg-white shadow-sm transition-transform duration-200"
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={`relative flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
            tab.id === active ? "text-primary" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
