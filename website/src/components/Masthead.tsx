import Link from "next/link";
import type { ReactNode } from "react";

// The newspaper look shared by the public updates and schedule pages.

export function Masthead({ title, tagline, now }: { title: string; tagline: string; now: Date }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
        <span>{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
        <span>TPASC Climbing Wall</span>
      </div>
      <h1 className="text-center font-serif text-5xl font-black tracking-tight text-primary sm:text-7xl">{title}</h1>
      <p className="text-center text-sm text-neutral-600 italic sm:text-base">{tagline}</p>
      <div aria-hidden="true" className="h-1.5 border-y border-primary" />
    </header>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`text-xs font-bold uppercase tracking-[0.2em] ${className}`}>{children}</span>;
}

// With `href`, the title links to a page with more of the section.
export function SectionRule({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="shrink-0 font-serif text-2xl font-bold text-primary">
        {href ? (
          <Link href={href} className="group inline-flex items-center gap-2 hover:text-secondary">
            {title}
            <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        ) : (
          title
        )}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-neutral-300" />
    </div>
  );
}
