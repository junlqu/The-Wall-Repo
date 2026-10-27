// Segmented control for switching between a few views of the same data.
export default function TabBar<T extends string | number>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string; ariaLabel?: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-md bg-neutral-200/70 p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-label={tab.ariaLabel}
          onClick={() => onChange(tab.id)}
          className={`min-w-7 flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
            tab.id === active ? "bg-white text-primary shadow-sm" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
