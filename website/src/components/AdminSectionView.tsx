import Link from "next/link";
import {
  type AdminSection,
  type AdminSubpage,
  adminSectionHref,
  adminSubpageHref,
} from "@/lib/adminSections";

// Shared frame for an admin section page and its subpages: breadcrumb, title,
// a tab per subpage, and (for now) an empty panel where the tool will go.
export default function AdminSectionView({
  section,
  subpage,
}: {
  section: AdminSection;
  subpage?: AdminSubpage;
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <Link href="/admin" className="hover:text-primary">
            Admin
          </Link>
          <span aria-hidden="true">/</span>
          {subpage ? (
            <>
              <Link href={adminSectionHref(section)} className="hover:text-primary">
                {section.title}
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-neutral-800">{subpage.label}</span>
            </>
          ) : (
            <span className="text-neutral-800">{section.title}</span>
          )}
        </nav>

        <div>
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">{subpage?.label ?? section.title}</h1>
          <p className="mt-2 text-neutral-600">{section.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {section.subpages.map((item) => {
            const isCurrent = item.slug === subpage?.slug;
            return (
              <Link
                key={item.slug}
                href={adminSubpageHref(section, item)}
                aria-current={isCurrent ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isCurrent
                    ? "border-primary bg-primary text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-secondary hover:bg-secondary/10 hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-neutral-700">Nothing here yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            {subpage ? "This tool is still being built." : "Pick one of the tools above to get started."}
          </p>
        </div>
      </div>
    </div>
  );
}
