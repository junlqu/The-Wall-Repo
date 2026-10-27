"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { avatarUrl } from "@/lib/avatar";
import { ACCOUNT_LINKS, CLIMBS_LINKS, EXTRAS_LINKS } from "@/lib/navLinks";
import { USER_LEVEL, logout, useSessionUser } from "@/lib/session";
import logo from "@/static/logo.svg";

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
  const router = useRouter();
  const user = useSessionUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [climbsOpen, setClimbsOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const isAdmin = user?.level === USER_LEVEL.admin;

  const closeMenu = () => {
    setMenuOpen(false);
    setClimbsOpen(false);
    setExtrasOpen(false);
  };

  const handleLogout = async () => {
    closeMenu();
    await logout();
    router.push("/");
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
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" onClick={closeMenu} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="The Wall Archives" width={logo.width} height={logo.height} className="h-14 w-auto" />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          {user && (
            <Link href="/dashboard" className="transition-colors hover:text-secondary">
              Dashboard
            </Link>
          )}
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

          <div className="group relative">
            <button type="button" className="flex items-center gap-1 transition-colors hover:text-secondary">
              Extras
              <ChevronIcon className="group-hover:rotate-180" />
            </button>

            <div className="invisible absolute left-1/2 top-full -translate-x-1/2 pt-3 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
              <div className="flex min-w-[160px] flex-col rounded-lg border border-secondary/20 bg-primary py-2 shadow-lg">
                {EXTRAS_LINKS.map((link) => (
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
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden rounded-full border border-secondary px-4 py-1.5 text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-primary md:inline-block"
            >
              Admin
            </Link>
          )}
          {user ? (
            <div className="group relative hidden md:block">
              <button type="button" className="flex items-center gap-2 text-left transition-colors hover:text-secondary">
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{user.fname}</span>
                  <span className="text-xs text-white/70">@{user.username}</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(user)}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border-2 border-black object-cover"
                />
              </button>

              <div className="invisible absolute right-0 top-full pt-3 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
                <div className="flex min-w-[160px] flex-col rounded-lg border border-secondary/20 bg-primary py-2 text-sm font-medium shadow-lg">
                  {ACCOUNT_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="px-4 py-2 transition-colors hover:bg-secondary/10 hover:text-secondary"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <div className="my-2 border-t border-secondary/20" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2 text-left transition-colors hover:bg-secondary/10 hover:text-secondary"
                  >
                    Log out
                  </button>
                </div>
              </div>
            </div>
          ) : user === null ? (
            <Link
              href="/login"
              className="hidden rounded-full border border-secondary px-4 py-1.5 text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-primary md:inline-block"
            >
              Login
            </Link>
          ) : (
            // Session still loading - hold the space so the nav doesn't jump.
            <span aria-hidden="true" className="hidden h-9 w-28 md:block" />
          )}

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
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col overflow-y-auto bg-primary px-6 pb-10 pt-6 md:hidden">
          <nav className="flex flex-1 flex-col gap-1 text-lg font-medium">
            {user && (
              <Link href="/dashboard" onClick={closeMenu} className="rounded px-2 py-4 hover:bg-secondary/10 hover:text-secondary">
                Dashboard
              </Link>
            )}
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

            <button
              type="button"
              onClick={() => setExtrasOpen((open) => !open)}
              aria-expanded={extrasOpen}
              className="flex items-center justify-between rounded px-2 py-4 text-left hover:bg-secondary/10 hover:text-secondary"
            >
              Extras
              <ChevronIcon className={extrasOpen ? "rotate-180" : ""} />
            </button>
            {extrasOpen && (
              <div className="flex flex-col pl-4">
                {EXTRAS_LINKS.map((link) => (
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

            {isAdmin && (
              <Link
                href="/admin"
                onClick={closeMenu}
                className="mt-4 rounded-full border border-secondary px-4 py-3 text-center font-semibold text-secondary hover:bg-secondary hover:text-primary"
              >
                Admin
              </Link>
            )}

            {user ? (
              // Pinned to the bottom of the menu: account links on the right above
              // the user, with Log out on the left of the user's row.
              <div className="mt-auto flex flex-col border-t border-secondary/20 pt-4 text-sm">
                <div className="flex flex-col items-end">
                  {ACCOUNT_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={closeMenu}
                      className="rounded px-2 py-2 text-right text-white/85 hover:bg-secondary/10 hover:text-secondary"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="shrink-0 rounded-full border border-secondary px-4 py-1.5 font-semibold text-secondary hover:bg-secondary hover:text-primary"
                  >
                    Log out
                  </button>
                  <div className="flex min-w-0 items-center gap-3 px-2">
                    <div className="flex min-w-0 flex-col text-right leading-tight">
                      <span className="truncate text-base font-semibold">{user.fname}</span>
                      <span className="truncate text-white/70">@{user.username}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl(user)}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-black object-cover"
                    />
                  </div>
                </div>
              </div>
            ) : (
              user === null && (
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="mt-4 rounded-full border border-secondary px-4 py-3 text-center font-semibold text-secondary hover:bg-secondary hover:text-primary"
                >
                  Login
                </Link>
              )
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
