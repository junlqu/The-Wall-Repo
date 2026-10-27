import Link from "next/link";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 shrink-0 text-neutral-400 transition-all group-hover:translate-x-0.5 group-hover:text-secondary"
    >
      <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

// One clickable row per subpage of an admin section. Rows only draw dividers
// between themselves - the caller decides the outer border.
export default function AdminSubpageRows({ section }: { section: AdminSection }) {
  return (
    <ul className="flex flex-col divide-y divide-neutral-100">
      {section.subpages.map((subpage) => (
        <li key={subpage.slug}>
          <Link
            href={adminSubpageHref(section, subpage)}
            className="group flex items-center justify-between gap-4 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-secondary/10 hover:text-primary"
          >
            {subpage.label}
            <ChevronRightIcon />
          </Link>
        </li>
      ))}
    </ul>
  );
}
