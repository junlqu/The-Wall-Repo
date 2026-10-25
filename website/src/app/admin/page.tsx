import Link from "next/link";
import { ADMIN_SECTIONS, adminSectionHref, adminSubpageHref } from "@/lib/adminSections";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Admin</h1>
          <p className="mt-2 text-neutral-600">Manage announcements, climbs, comments, and members.</p>
        </div>

        {/* Quadrants size to their content - the flex basis only decides when
            two fit side by side, wrapping to one column on narrow screens. */}
        <div className="flex flex-wrap gap-6">
          {ADMIN_SECTIONS.map((section) => (
            <section
              key={section.slug}
              className="flex flex-1 basis-[26rem] flex-col gap-4 rounded-xl border border-t-4 border-primary/10 border-t-secondary bg-white p-6 shadow-sm"
            >
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
              <div className="flex flex-wrap gap-2">
                {section.subpages.map((subpage) => (
                  <Link
                    key={subpage.slug}
                    href={adminSubpageHref(section, subpage)}
                    className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:border-secondary hover:bg-secondary/10 hover:text-primary"
                  >
                    {subpage.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
