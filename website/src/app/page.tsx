import { cache, type ReactNode } from "react";
import Link from "next/link";
import CommunityCarousel from "@/components/CommunityCarousel";
import FallingRocks from "@/components/FallingRocks";
import { Kicker } from "@/components/Masthead";
import { ROUTE_GRADES } from "@/lib/grades";
import { BOOKING_URL, WAIVER_URL } from "@/lib/schedule";
import { RoundHolds } from "@/static/holds/RoundHolds";
import wordmark from "@/static/wordmark.svg";

// Next.js/React can invoke a Server Component's render function more than
// once per request (e.g. dev mode double-renders to help surface impure
// code) - wrapping the random seed in React's request-scoped cache() means
// every call within the same request returns the same memoized value, so
// the HTML and the RSC payload used to hydrate always agree.
const getFallingRocksSeed = cache(() => Math.floor(Math.random() * 2 ** 31));

// Everything below the hero is static copy - nothing here calls the API.

const JOIN_STEPS: { title: string; description: string; href?: string; action?: string }[] = [
  {
    title: "Book your spot",
    description: "Reserve a drop-in or a Learn-to-Climb lesson online. Our bookings open 48 hours ahead.",
    href: BOOKING_URL,
    action: "Book online",
  },
  {
    title: "Sign the waiver",
    description: "Every climber signs before climbing. Under 18? A parent or guardian signs for you.",
    href: WAIVER_URL,
    action: "Sign waiver",
  },
  {
    title: "Pay & gear up",
    description: "Pay at the front desk, then show your receipt to staff at the wall. Come 5 minutes early to keep your reserved spot.",
  },
];

const ROUTE_FEATURES = [
  { title: "Set in-house", description: "Our setters keep the wall fresh with new lines through the season." },
  { title: "Something for everyone", description: "Grades run from first-timer friendly to projects that take weeks." },
  { title: "Track your sends", description: "Log what you've climbed and see what everyone else thinks of a route." },
];

const CLIMBING_STYLES = [
  {
    name: "Top rope",
    tag: "Our flagship",
    description:
      "The rope runs through an anchor at the top, so a slip just means a gentle catch. It's where everyone starts and where most of our routes live.",
    hold: RoundHolds.shape8,
  },
  {
    name: "Lead",
    tag: "For experienced climbers",
    description:
      "Clip the rope into quickdraws as you go. Bigger falls, bigger thrills - the next step once you're comfortable on top rope.",
    hold: RoundHolds.shape10,
  },
  {
    name: "Bouldering",
    tag: "Littered across the wall",
    description:
      "Short, powerful problems close to the ground, no rope needed. A small space, but perfect for warming up or working on moves.",
    hold: RoundHolds.shape12,
  },
];

const FAQS: { question: string; answer: ReactNode }[] = [
  {
    question: "I've never climbed before. How does this work?",
    answer: (
      <>
        If you want to give it a try, we suggest buying a session with belay. The staff will belay the climbers, while the climbers can focus on making it up the wall.
        <br /><br />
        If you feel like this will be a long-term hobby, we suggest taking a Learn-to-Climb lesson. It covers the basics of belaying and rope safety.
        <br /><br />
        If you are a UTSC student, book a Learn-to-Climb lesson. Students must pass a belay test before they can join regular drop-ins. It costs the same as a regular drop-in.
      </>
    ),
  },
  {
    question: "Do I need my own gear?",
    answer: "No. Book a drop-in with gear and we'll set you up with shoes and a harness. If you are a member with your own gear, you can bring it and book a drop-in without gear.",
  },
  {
    question: "I don't have a belay partner. Can I still climb?",
    answer:
      "Yes - TPASC members and non-members can book an hour of belay service, where staff belay you. To belay at drop-ins, you'll need to pass a belay test at TPASC. Additionally, we are very well known for our excellent community, so feel free to ask around for belays, as long as you belay them back.",
  },
  {
    question: "How much does it cost?",
    answer: (
      <>
        It depends on who you are and what you are looking to do - UTSC students or members with their own gear drop in for free. See the{" "}
        <Link
          href="/schedule"
          className="font-semibold text-primary underline decoration-secondary underline-offset-2 hover:text-secondary"
        >
          full price list
        </Link>
        .
      </>
    ),
  },
  {
    question: "Can kids climb?",
    answer: "Yes. Belay service starts at age 5, and anyone under 18 needs a parent or guardian to sign the waiver.",
  },
  {
    question: "What should I wear?",
    answer: "Comfortable clothes you can move in - athletic wear works best. Skip anything loose enough to catch on a hold.",
  },
];

function SectionHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker className="text-secondary">{kicker}</Kicker>
      <h2 className="font-serif text-3xl leading-tight font-bold sm:text-4xl">{title}</h2>
      {children && <p className="max-w-2xl text-base leading-relaxed opacity-80">{children}</p>}
    </div>
  );
}

function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  return (
    <Link href={href} className={`group inline-flex w-fit items-center gap-2 font-semibold ${className}`}>
      {children}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

export default function Home() {
  const fallingRocksSeed = getFallingRocksSeed();

  return (
    <>
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden bg-neutral-500">
        <FallingRocks seed={fallingRocksSeed} />

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
          <h1 className="mt-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]">
            {/* SVGs aren't resized by next/image anyway, so a plain img is enough. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wordmark.src}
              alt="The Wall Archives"
              width={wordmark.width}
              height={wordmark.height}
              className="mx-auto h-auto w-72 sm:w-[28rem] md:w-[36rem] lg:w-[44rem]"
            />
          </h1>
        </div>
      </section>

      <section className="bg-white px-4 py-20 text-primary sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-6">
            <SectionHeading kicker="Community" title="Join the gang">
              Whether you&apos;re tying in for the first time or chasing your next project, you&apos;ll find a friendly
              crew here - swapping beta, cheering on sends, and pushing each other a little higher.
            </SectionHeading>
            <ArrowLink href="/updates" className="text-primary hover:text-secondary">
              See what&apos;s new at the wall
            </ArrowLink>
          </div>
          <CommunityCarousel />
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-20 text-primary sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading kicker="The schedule" title="Come climb with us">
              Drop in during open hours, or start with a Learn-to-Climb lesson. Getting on the wall takes three steps.
            </SectionHeading>
            <ArrowLink
              href="/schedule"
              className="rounded-full bg-primary px-5 py-2.5 text-sm text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              Full schedule &amp; prices
            </ArrowLink>
          </div>

          <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {JOIN_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-5 right-2 font-serif text-9xl font-black text-secondary/15"
                >
                  {i + 1}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-serif text-lg font-bold text-white"
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold text-neutral-900">{step.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-neutral-600">{step.description}</p>
                {step.href && (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary hover:text-secondary"
                  >
                    {step.action}
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="relative overflow-hidden bg-primary px-4 py-20 text-white sm:px-6 lg:px-8">
        <svg
          aria-hidden="true"
          viewBox="0 0 200 200"
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 fill-secondary/10"
        >
          {RoundHolds.shape9}
        </svg>
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading kicker="The routes" title="Always something new to try">
              The wall is covered in colour-coded routes, each set by our own team and refreshed through the season.
              Find one at your level, then come back for the next.
            </SectionHeading>
            <ArrowLink href="/climbs/routes" className="text-secondary hover:text-white">
              Browse the active routes
            </ArrowLink>
          </div>
          <div className="flex flex-col gap-4">
            {ROUTE_FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-white/15 bg-white/5 p-5">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-white/70">{feature.description}</p>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2 text-xs font-semibold tabular-nums text-white/70">
              <span>{ROUTE_GRADES[0]}</span>
              <span aria-hidden="true" className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-secondary to-white" />
              <span>{ROUTE_GRADES[ROUTE_GRADES.length - 1]}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 text-primary sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <SectionHeading kicker="The climbing" title="Ropes first, with a bit of bouldering">
            Most of the wall is roped climbing, with a small bouldering area on the side.
          </SectionHeading>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {CLIMBING_STYLES.map((style) => (
              <article
                key={style.name}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-6 transition-colors hover:border-secondary"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 200 200"
                  className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 fill-secondary/20 transition-transform duration-500 group-hover:rotate-12"
                >
                  {style.hold}
                </svg>
                <span className="w-fit rounded-full bg-secondary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                  {style.tag}
                </span>
                <h3 className="font-serif text-2xl font-bold">{style.name}</h3>
                <p className="relative text-sm leading-relaxed text-neutral-600">{style.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-20 text-primary sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <SectionHeading kicker="FAQ" title="Questions? We've got answers" />
          <div className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-sm">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-neutral-900 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-primary transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
