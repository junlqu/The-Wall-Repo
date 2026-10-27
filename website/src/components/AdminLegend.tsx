"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ADMIN_SECTIONS, adminSectionHref, adminSubpageHref } from "@/lib/adminSections";

// Below `md` - where the header switches to its hamburger menu - the legend
// fills the screen under the header instead of sliding out beside the page.
const MOBILE_QUERY = "(max-width: 767px)";

const PANEL_ID = "admin-legend";
// How far the tab's corners curve out into the page's edge.
const TAB_RADIUS_PX = 10;

function ChevronIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

function CloseIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.59l4.3-4.3a1 1 0 1 1 1.4 1.42L11.41 10l4.3 4.3a1 1 0 0 1-1.42 1.4L10 11.41l-4.3 4.3a1 1 0 0 1-1.4-1.42L8.59 10l-4.3-4.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

function linkClass(isCurrent: boolean) {
  return `min-w-0 flex-1 truncate rounded-md px-3 py-2 transition-colors ${
    isCurrent ? "bg-secondary/15 text-primary" : "text-neutral-700 hover:bg-secondary/10 hover:text-primary"
  }`;
}

// The concave corner joining the tab to the page's edge - a square filled
// everywhere but a quarter circle cut from its far corner. `corner` is which
// end of the tab it sits against.
function TabFillet({ corner }: { corner: "top" | "bottom" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        background: `radial-gradient(circle at 100% ${corner === "top" ? "0" : "100%"}, transparent ${TAB_RADIUS_PX}px, white ${TAB_RADIUS_PX + 0.5}px)`,
        width: TAB_RADIUS_PX,
        height: TAB_RADIUS_PX,
      }}
      className={`absolute left-0 ${corner === "top" ? "bottom-full" : "top-full"}`}
    />
  );
}

// Every admin page and subpage for quick access, in a drawer pulled out from
// the tab on the left edge. It slides over the page rather than moving it.
export default function AdminLegend() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const [open, setOpen] = useState(false);
  // Sections start closed, except the one holding the current page. A
  // section's chevron overrides that until the page changes.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [toggledOn, setToggledOn] = useState(pathname);
  if (toggledOn !== pathname) {
    setToggledOn(pathname);
    setToggled({});
  }
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the drawer as it opens and back to the tab as it closes.
  // The drawer is inert until it's re-rendered open, so this waits a frame.
  const openLegend = () => {
    setOpen(true);
    requestAnimationFrame(() => closeRef.current?.focus());
  };
  const closeLegend = () => {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Full screen on a phone hides the page, so following a link closes it.
  // Beside the page it stays open for the next hop.
  const onNavigate = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) setOpen(false);
  };

  const toggleSection = (slug: string, isExpanded: boolean) =>
    setToggled((current) => ({ ...current, [slug]: !isExpanded }));

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-label="Open admin pages"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={openLegend}
        // A drop shadow (not a box shadow) so it follows the curved corners too.
        className={`group fixed left-0 top-[4.75rem] z-30 drop-shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-all duration-300 ${
          open ? "pointer-events-none -translate-x-full opacity-0" : "opacity-100"
        }`}
      >
        <TabFillet corner="top" />
        {/* Smaller on a phone, where there's less page to spare. */}
        <span className="flex h-8 w-5 items-center justify-center rounded-r-md bg-white text-primary transition-colors group-hover:text-secondary md:h-10 md:w-8 md:rounded-r-lg">
          <ChevronIcon className="h-4 w-4 md:h-5 md:w-5" />
        </span>
        <TabFillet corner="bottom" />
      </button>

      <nav
        id={PANEL_ID}
        aria-label="Admin pages"
        inert={!open}
        className={`fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-white transition-transform duration-300 ease-out md:right-auto md:w-72 md:border-r md:border-neutral-200 md:shadow-lg ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Admin pages</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close admin pages"
            onClick={closeLegend}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 md:border md:border-neutral-200"
          >
            <CloseIcon className="h-5 w-5 md:hidden" />
            <ChevronIcon className="hidden h-5 w-5 rotate-180 md:block" />
          </button>
        </div>

        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 text-sm font-medium">
          <li>
            <Link
              href="/admin"
              aria-current={pathname === "/admin" ? "page" : undefined}
              onClick={onNavigate}
              className={`block ${linkClass(pathname === "/admin")} font-semibold`}
            >
              Dashboard
            </Link>
          </li>
          {ADMIN_SECTIONS.map((section) => {
            const href = adminSectionHref(section);
            const isCurrentSection = pathname === href || pathname.startsWith(`${href}/`);
            const isExpanded = toggled[section.slug] ?? isCurrentSection;
            const listId = `${PANEL_ID}-${section.slug}`;
            return (
              <li key={section.slug}>
                <div className="flex items-center gap-1">
                  <Link
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    onClick={onNavigate}
                    className={`${linkClass(pathname === href)} font-semibold ${
                      pathname.startsWith(`${href}/`) ? "text-primary" : ""
                    }`}
                  >
                    {section.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${section.title}`}
                    aria-expanded={isExpanded}
                    aria-controls={listId}
                    onClick={() => toggleSection(section.slug, isExpanded)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700"
                  >
                    <ChevronIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                </div>
                {/* Grid rows animate between 0fr and 1fr, so the list slides
                    to its own height without measuring it. */}
                <div
                  id={listId}
                  inert={!isExpanded}
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <ul className="ml-3 flex flex-col gap-0.5 overflow-hidden border-l border-neutral-200 pl-2">
                    {section.subpages.map((subpage) => {
                      const subpageHref = adminSubpageHref(section, subpage);
                      const isCurrent = pathname === subpageHref;
                      return (
                        <li key={subpage.slug} className="flex first:mt-0.5 last:mb-1">
                          <Link
                            href={subpageHref}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={onNavigate}
                            className={`${linkClass(isCurrent)} py-1.5 font-normal`}
                          >
                            {subpage.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
