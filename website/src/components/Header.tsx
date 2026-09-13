"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CLIMBS_LINKS = [
  { label: "Routes", href: "/climbs/routes" },
  { label: "Boulders", href: "/climbs/boulders" },
  { label: "Combos", href: "/climbs/combos" },
  { label: "Archives", href: "/climbs/archives" },
];

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${className}`}>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [climbsOpen, setClimbsOpen] = useState(false);

  const closeMenu = () => {
    setMenuOpen(false);
    setClimbsOpen(false);
  };

  // Full-screen overlay is open - stop the page behind it from scrolling.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full bg-primary text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" onClick={closeMenu} className="flex items-center">
          <span className="flex h-10 aspect-[3/2] items-center justify-center rounded-md border border-secondary/40 bg-secondary/20 text-[10px] font-semibold text-secondary">
            LOGO
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <Link href="/schedule" className="transition-colors hover:text-secondary">
            Schedule
          </Link>
          <Link href="/updates" className="transition-colors hover:text-secondary">
            Updates
          </Link>

          <div className="group relative">
            <button type="button" className="flex items-center gap-1 transition-colors hover:text-secondary">
              Climbs
              <ChevronIcon className="group-hover:rotate-180" />
            </button>

            <div className="invisible absolute left-1/2 top-full -translate-x-1/2 pt-3 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
              <div className="flex min-w-[160px] flex-col rounded-lg border border-secondary/20 bg-primary py-2 shadow-lg">
                {CLIMBS_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-4 py-2 transition-colors hover:bg-secondary/10 hover:text-secondary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden rounded-full border border-secondary px-4 py-1.5 text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-primary md:inline-block"
          >
            Login
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:text-secondary md:hidden"
          >
            {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-primary px-6 pb-10 pt-6 md:hidden">
          <nav className="flex flex-col gap-1 text-lg font-medium">
            <Link href="/schedule" onClick={closeMenu} className="rounded px-2 py-4 hover:bg-secondary/10 hover:text-secondary">
              Schedule
            </Link>
            <Link href="/updates" onClick={closeMenu} className="rounded px-2 py-4 hover:bg-secondary/10 hover:text-secondary">
              Updates
            </Link>

            <button
              type="button"
              onClick={() => setClimbsOpen((open) => !open)}
              aria-expanded={climbsOpen}
              className="flex items-center justify-between rounded px-2 py-4 text-left hover:bg-secondary/10 hover:text-secondary"
            >
              Climbs
              <ChevronIcon className={climbsOpen ? "rotate-180" : ""} />
            </button>
            {climbsOpen && (
              <div className="flex flex-col pl-4">
                {CLIMBS_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="rounded px-2 py-3 text-base text-white/85 hover:bg-secondary/10 hover:text-secondary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/login"
              onClick={closeMenu}
              className="mt-4 rounded-full border border-secondary px-4 py-3 text-center font-semibold text-secondary hover:bg-secondary hover:text-primary"
            >
              Login
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
