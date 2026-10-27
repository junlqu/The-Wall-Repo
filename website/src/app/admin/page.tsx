import Link from "next/link";
import AdminOverview from "@/components/AdminOverview";
import AdminSubpageRows from "@/components/AdminSubpageRows";
import { type AdminSection, ADMIN_SECTIONS, adminSectionHref } from "@/lib/adminSections";

// Cards alternate between the two columns so they still read left to right,
// top to bottom, while each column stacks independently - a short card isn't
// stretched to match its neighbour.
const COLUMNS = [0, 1].map((column) =>
  ADMIN_SECTIONS.map((section, index) => ({ section, index })).filter(({ index }) => index % 2 === column),
);

function SectionCard({ section, index }: { section: AdminSection; index: number }) {
  return (
    <section
      // On one-column screens the column wrappers are display: contents, so
      // this order puts the cards back in their original sequence.
      style={{ order: index }}
      className="flex flex-col overflow-hidden rounded-xl border border-t-4 border-primary/10 border-t-secondary bg-white shadow-sm"
    >
      <div className="flex flex-col gap-2 p-6 pb-4">
        <Link href={adminSectionHref(section)} className="group flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-primary transition-colors group-hover:text-secondary">
            {section.title}
          </h2>
          <span
            aria-hidden="true"
            className="text-lg text-neutral-400 transition-all group-hover:translate-x-1 group-hover:text-secondary"
          >
            →
          </span>
        </Link>
        <p className="text-sm text-neutral-600">{section.description}</p>
      </div>
      <div className="border-t border-neutral-100">
        <AdminSubpageRows section={section} />
      </div>
    </section>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <AdminOverview />

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {COLUMNS.map((cards, column) => (
            <div key={column} className="contents md:flex md:min-w-0 md:flex-1 md:flex-col md:gap-6">
              {cards.map(({ section, index }) => (
                <SectionCard key={section.slug} section={section} index={index} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
