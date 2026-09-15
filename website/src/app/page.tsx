import Link from "next/link";
import FallingRocks from "@/components/FallingRocks";

const DATA_BLOCKS = [
  {
    title: "Schedule",
    description: "Upcoming changes, holidays, and wall hours.",
    href: "/schedule",
  },
  {
    title: "Active Routes",
    description: "Grades, styles, setters, and who's sent what.",
    href: "/climbs/routes",
  },
  {
    title: "Archives",
    description: "Every past route, colour, and grade on record.",
    href: "/climbs/archives",
  },
  {
    title: "Updates",
    description: "Announcements and route-setting news.",
    href: "/updates",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden bg-neutral-500">
        <FallingRocks />

        <div className="relative z-10 w-fit px-4 text-center">
          <div
            className="pointer-events-none absolute -inset-x-12 -inset-y-10 -z-10 sm:-inset-x-20 sm:-inset-y-14 md:-inset-x-28 md:-inset-y-16"
            style={{
              background:
                "radial-gradient(ellipse closest-side, rgba(50,50,52,0.78) 0%, rgba(50,50,52,0.78) 55%, rgba(50,50,52,0) 90%)",
            }}
          />
          <p className="text-base font-semibold uppercase tracking-[0.3em] text-white/90 sm:text-lg md:text-xl">
            Welcome to
          </p>
          <h1 className="text-5xl font-black uppercase tracking-wide text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)] sm:text-7xl md:text-8xl lg:text-9xl">
            The Wall
          </h1>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-primary sm:text-3xl">Explore the wall</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DATA_BLOCKS.map((block) => (
              <Link
                key={block.href}
                href={block.href}
                className="group flex flex-col gap-2 rounded-xl border border-primary/10 bg-neutral-50 p-6 transition-colors hover:border-secondary hover:bg-secondary/5"
              >
                <span className="text-lg font-semibold text-primary">{block.title}</span>
                <span className="text-sm text-neutral-600">{block.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
