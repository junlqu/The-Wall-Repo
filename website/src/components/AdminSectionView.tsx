import Link from "next/link";
import type { ReactNode } from "react";
import AdminSubpageRows from "@/components/AdminSubpageRows";
import {
  type AdminSection,
  type AdminSubpage,
  adminSectionHref,
  adminSubpageHref,
} from "@/lib/adminSections";

// Shared frame for an admin section page and its subpages. The section page
// lists its subpages as rows unless it passes its own children; a subpage
// gets a tab strip to hop between its siblings, then its tool as children or
// an empty panel until that tool is built.
export default function AdminSectionView({
  section,
  subpage,
  children,
}: {
  section: AdminSection;
  subpage?: AdminSubpage;
  children?: ReactNode;
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

        {subpage ? (
          <>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="flex min-w-max border-b border-neutral-200">
                {section.subpages.map((item) => {
                  const isCurrent = item.slug === subpage.slug;
                  return (
                    <Link
                      key={item.slug}
                      href={adminSubpageHref(section, item)}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                        isCurrent
                          ? "border-primary text-primary"
                          : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {children ?? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
                <p className="text-sm font-semibold text-neutral-700">Nothing here yet</p>
                <p className="mt-1 text-sm text-neutral-500">This tool is still being built.</p>
              </div>
            )}
          </>
        ) : (
          (children ?? (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
              <AdminSubpageRows section={section} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
