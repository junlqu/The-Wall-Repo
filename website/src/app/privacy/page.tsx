import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { settingsHref } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

// Change whenever the policy does.
const EFFECTIVE_DATE = "November 8, 2026";

const LINK_CLASS = "font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary";

// Numbered in this order. #data and #cookies are linked to from the settings
// page, so keep those ids.
const SECTIONS = [
  { id: "introduction", title: "Introduction" },
  { id: "data", title: "Information We Collect" },
  { id: "use", title: "How We Use Your Information" },
  { id: "disclosure", title: "How Your Information Is Shared" },
  { id: "cookies", title: "Cookies" },
  { id: "third-parties", title: "Third-Party Services" },
  { id: "retention", title: "Data Retention" },
  { id: "security", title: "Security" },
  { id: "rights", title: "Your Rights and Choices" },
  { id: "children", title: "Children's Privacy" },
  { id: "changes", title: "Changes to This Policy" },
  { id: "contact", title: "Contact Us" },
] as const;

type SectionID = (typeof SECTIONS)[number]["id"];

const COLLECTED: [string, string, string][] = [
  [
    "Account information",
    "First and last name, username, and, if you choose to provide them, email address and phone number.",
    "To create and identify your account, let you log in, and display your name on your contributions.",
  ],
  [
    "Login credentials",
    "Your password, stored only as a one-way cryptographic hash.",
    "To verify your identity when you log in, change your password or delete your account.",
  ],
  [
    "Profile picture",
    "A 128 × 128 pixel image cropped and resized on your device from a photo you select. The original photo is not uploaded.",
    "To display alongside your name across the Site.",
  ],
  [
    "Climbing activity",
    "Comments, suggested grades, ratings (0-10), sends and the send dates you enter, and the climbs you save.",
    "To publish your contributions on each climb, maintain ascent lists and ratings, and show new comments and sends on climbs you save on your dashboard.",
  ],
  [
    "Follows",
    "The members you follow, and the date and time you started following each one.",
    "To show their comments and sends on your dashboard, show follower counts, let you see who follows you, and identify your friends (members you follow who also follow you) when applying your visibility choices.",
  ],
  [
    "Announcement activity",
    "The updates you have liked or viewed.",
    "To show like counts and indicate which updates are new to you.",
  ],
  [
    "Account activity and settings",
    "Account creation date, the time you last opened your dashboard, account level, profile visibility choices, cookie preference, and activity totals derived from your contributions.",
    "To personalize your dashboard, apply your privacy choices and control access to administrative features.",
  ],
  [
    "Bans and timeouts",
    "Any ban or timeout placed on your account: when it started and when it ends (or, for a ban, that it is permanent), the reason given, and the staff member who placed it.",
    "To enforce the Site's rules: to stop a banned account from logging in, or a timed-out account from posting, until it ends, and to keep a record of past bans and timeouts.",
  ],
];

const COOKIES: [string, string, string, string][] = [
  [
    "wall_session",
    "Keeps you logged in. Contains a signed token holding your user ID, username, first name, account level and the time your profile picture was last updated, and, while you are timed out, when your timeout ends and the reason given.",
    "Strictly necessary",
    "30 days, or until you log out",
  ],
];

const RETENTION: [string, string][] = [
  ["Account information and profile picture", "Until you delete your account."],
  [
    "Follows",
    "The list of members you follow is deleted when you delete your account, so you no longer count as anyone's follower. Climbs you saved stay linked to your de-identified record.",
  ],
  [
    "Comments, grades, ratings and sends",
    "Retained after account deletion in de-identified form, no longer linked to your name or username, so that climb histories remain accurate.",
  ],
  [
    "De-identified account record",
    "After deletion, a record containing your internal identifier, settings, activity totals and any ban and timeout history is retained so that existing contributions remain consistent. It contains no name, username, email, phone or usable password.",
  ],
  ["Bans and timeouts", "Kept with your account record, including after they end and after account deletion."],
  ["Session cookie", "30 days from your last login, or until you log out."],
  ["Technical logs", "In line with our hosting provider's standard retention periods."],
  ["Data exports", "Generated when you request them and not stored by us."],
];

// The number a section shows, counting from 1.
const numberOf = (id: SectionID) => SECTIONS.findIndex((section) => section.id === id) + 1;

function Section({ id, children }: { id: SectionID; children: ReactNode }) {
  const number = numberOf(id);
  const { title } = SECTIONS[number - 1];
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-neutral-200 pt-10 first:border-t-0 first:pt-0">
      <h2 id={`${id}-heading`} className="flex items-baseline gap-3 text-xl font-bold text-primary sm:text-2xl">
        <span className="font-mono text-base font-semibold text-secondary tabular-nums">{String(number).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-4 text-[0.9375rem] leading-7 text-neutral-700">{children}</div>
    </section>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-base font-semibold text-neutral-900">{children}</h3>;
}

function Table({ caption, headers, rows, mono }: { caption: string; headers: string[]; rows: string[][]; mono?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-neutral-50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b border-neutral-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map(([first, ...rest]) => (
            <tr key={first} className="align-top">
              <th scope="row" className={`px-4 py-3 font-semibold text-neutral-900 ${mono ? "font-mono text-xs" : ""}`}>
                {first}
              </th>
              {rest.map((cell, index) => (
                <td key={index} className="px-4 py-3 leading-6 text-neutral-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6 marker:text-neutral-400">{children}</ul>;
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-neutral-900">{children}</span>;
}

// The privacy policy. Keep it in step with what the API actually stores (see
// api/src/models) and the cookies it sets (api/src/authUtils.ts).
export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <header className="bg-primary text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Legal</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-white/80">
            How The Wall Archives collects, uses, shares and protects your personal information.
          </p>
          <p className="mt-6 text-sm text-white/60">Effective {EFFECTIVE_DATE}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8">
        <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start print:hidden">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Contents</h2>
          <ol className="mt-4 flex flex-col gap-1 border-l border-neutral-200 text-sm">
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px flex gap-3 border-l-2 border-transparent py-1 pl-4 text-neutral-600 transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="font-mono text-xs leading-5 text-neutral-400 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="flex flex-col gap-10 rounded-lg border border-neutral-200 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
          <Section id="introduction">
            <p>
              This Privacy Policy explains how the TPASC Climbing Wall Community (&ldquo;<Term>we</Term>&rdquo;,
              &ldquo;<Term>us</Term>&rdquo; or &ldquo;<Term>our</Term>&rdquo;) handles personal information in connection
              with The Wall Archives website and its related services (the &ldquo;<Term>Site</Term>&rdquo;).
            </p>
            <p>
              &ldquo;<Term>Personal information</Term>&rdquo; means information about an identifiable individual. This
              Policy applies to visitors who browse the Site and to members who create an account
              (&ldquo;<Term>you</Term>&rdquo;). By using the Site, you acknowledge the practices described in this
              Policy.
            </p>
            <p>
              We collect only what is needed to operate the Site. We do not sell personal information, display
              advertising, or use analytics or tracking technologies.
            </p>
          </Section>

          <Section id="data">
            <Subheading>2.1 Visitors without an account</Subheading>
            <p>
              You can browse the Site without an account. We do not collect personal information from visitors who are
              not logged in. When such a visitor opens an update, we increase that update&apos;s anonymous view count by
              one; nothing identifying the visitor is recorded.
            </p>
            <Subheading>2.2 Members</Subheading>
            <p>When you create an account and use the Site, we collect the following information:</p>
            <Table
              caption="Information collected from members"
              headers={["Category", "Information", "Purpose"]}
              rows={COLLECTED}
            />
            <Subheading>2.3 Information collected automatically</Subheading>
            <p>
              When you log in, we set a single session cookie, described in{" "}
              <a href="#cookies" className={LINK_CLASS}>
                Section {numberOf("cookies")}
              </a>
              . Our hosting provider also records standard technical logs of requests and errors, which are used solely
              to operate, secure and troubleshoot the Site.
            </p>
            <Subheading>2.4 Information that is not personal</Subheading>
            <p>
              The Site also holds records about the climbing wall itself, including climbs, hours, prices, closures and
              attendance. Attendance records contain only hourly visitor counts and do not identify any individual.
            </p>
          </Section>

          <Section id="use">
            <p>We use personal information only to:</p>
            <List>
              <li>create, maintain and authenticate your account;</li>
              <li>display your profile and your contributions to climbs and updates;</li>
              <li>
                personalize your dashboard, including activity totals and new comments and sends on climbs you save and
                from members you follow;
              </li>
              <li>apply the visibility and cookie preferences you choose;</li>
              <li>allow authorized staff to administer accounts and access levels, and to ban or time out accounts that break the Site&apos;s rules;</li>
              <li>keep the Site secure and diagnose technical problems; and</li>
              <li>comply with applicable legal obligations.</li>
            </List>
            <p>
              We do not use your information for advertising, profiling or automated decision-making, and we do not sell,
              rent or trade it.
            </p>
          </Section>

          <Section id="disclosure">
            <Subheading>4.1 Information visible to other users</Subheading>
            <List>
              <li>
                <Term>Always visible:</Term> your profile picture, username, first name and last initial, and the
                comments, grades, ratings and sends you post on climbs.
              </li>
              <li>
                <Term>Visible at your choice:</Term> the statistics, recent activity, and follower and following counts on
                your profile. For each, you choose in your{" "}
                <Link href={settingsHref("privacy")} className={LINK_CLASS}>
                  privacy settings
                </Link>{" "}
                whether it is shown to everyone, only to your friends (members you follow who also follow you), or to no
                one.
              </li>
              <li>
                <Term>Visible to the members involved:</Term> when you follow a member, they can see that you follow them,
                both on your profile and in their list of followers. Only you can see the full lists of who you follow and
                who follows you.
              </li>
              <li>
                <Term>Never publicly visible:</Term> your email address, phone number and password.
              </li>
            </List>
            <Subheading>4.2 Authorized staff</Subheading>
            <p>
              Members with staff or administrator access can view account details, including names, usernames, email
              addresses, phone numbers, account creation dates, activity totals and ban and timeout history, for the
              purpose of administering accounts. They can correct those details, reset your profile picture to its
              default, ban your account for a set time or permanently, and time it out for a set time, giving a reason
              each time. While a ban is in effect you are logged out and cannot log in; the login page shows when it
              ends and the reason given. While a timeout is in effect you stay logged in but cannot post or edit
              comments, like updates or add combos; the Site shows when it ends and the reason given. No one, including
              staff, can view your password.
            </p>
            <Subheading>4.3 Service providers</Subheading>
            <p>
              We rely on a limited number of service providers, described in{" "}
              <a href="#third-parties" className={LINK_CLASS}>
                Section {numberOf("third-parties")}
              </a>
              , who process information only as needed to provide their services to us.
            </p>
            <Subheading>4.4 Legal requirements</Subheading>
            <p>
              We may disclose personal information where required by law, or where necessary to protect the safety of
              our members or the integrity of the Site.
            </p>
          </Section>

          <Section id="cookies">
            <p>
              A cookie is a small file that a website stores in your browser. The Site uses one cookie, which is strictly
              necessary for logging in:
            </p>
            <Table caption="Cookies used by the Site" headers={["Name", "Purpose", "Type", "Duration"]} rows={COOKIES} mono />
            <p>
              This cookie is set only when you log in or create an account. It is marked <em>HttpOnly</em>, so it cannot
              be read by scripts running on the page, and <em>SameSite=Lax</em>, which helps prevent other websites from
              using it to act on your behalf.
            </p>
            <p>
              The Site does not use analytics, advertising or tracking cookies, and does not store information in your
              browser&apos;s local or session storage. Should we introduce optional cookies in the future, they will be
              listed here and will remain disabled unless you enable them in your{" "}
              <Link href={settingsHref("cookies")} className={LINK_CLASS}>
                cookie settings
              </Link>
              .
            </p>
            <p>
              You can block or delete cookies through your browser settings. Doing so will prevent you from logging in,
              but you can still browse the Site&apos;s public pages.
            </p>
          </Section>

          <Section id="third-parties">
            <List>
              <li>
                <Term>Microsoft Azure</Term> hosts the Site, its database and its server functions. Your information may
                be stored on servers located outside your province or country.
              </li>
              <li>
                <Term>EZFacility</Term> operates TPASC&apos;s booking system. Our servers retrieve the climbing
                wall&apos;s session times from EZFacility; your browser does not contact EZFacility unless you follow a
                link to its site.
              </li>
              <li>
                <Term>Discord</Term> receives new updates for posting to the climbing wall&apos;s Discord server,
                including the username of the member who posted the update. No information about other members is sent.
              </li>
            </List>
            <p>
              The Site links to external services, such as the TPASC booking site and the Smartwaiver waiver form.
              These services are governed by their own privacy policies, and we are not responsible for their
              practices. The Site&apos;s fonts are served from our own host, so loading a page does not contact any
              third-party font service.
            </p>
          </Section>

          <Section id="retention">
            <p>We keep personal information only for as long as it is needed for the purposes described in this Policy:</p>
            <Table caption="How long information is kept" headers={["Information", "Retention period"]} rows={RETENTION} />
          </Section>

          <Section id="security">
            <p>We use reasonable safeguards to protect personal information, including:</p>
            <List>
              <li>hashing passwords with bcrypt, so they are never stored or transmitted back in readable form;</li>
              <li>signing session tokens so they cannot be altered, and expiring them after 30 days;</li>
              <li>serving the Site over encrypted HTTPS connections;</li>
              <li>requiring your current password to change your password or delete your account; and</li>
              <li>restricting administrative access to authorized staff.</li>
            </List>
            <p>
              No method of transmission or storage is completely secure. While we work to protect your information, we
              cannot guarantee its absolute security.
            </p>
          </Section>

          <Section id="rights">
            <p>You can exercise the following rights directly from your account settings:</p>
            <List>
              <li>
                <Term>Access:</Term> download a copy of your account information, including the members you follow, and
                all of your comments, grades,
                ratings and sends from{" "}
                <Link href={settingsHref("data-privacy")} className={LINK_CLASS}>
                  Data Privacy
                </Link>
                .
              </li>
              <li>
                <Term>Correction:</Term> update your name, email address, phone number and profile picture in your{" "}
                <Link href={settingsHref()} className={LINK_CLASS}>
                  settings
                </Link>
                .
              </li>
              <li>
                <Term>Visibility:</Term> choose whether each part of your profile is seen by everyone, only your
                friends, or no one in your{" "}
                <Link href={settingsHref("privacy")} className={LINK_CLASS}>
                  privacy settings
                </Link>
                .
              </li>
              <li>
                <Term>Deletion:</Term> delete your account from{" "}
                <Link href={settingsHref("account-status")} className={LINK_CLASS}>
                  Account Status
                </Link>
                . Deletion removes your name, username, email address, phone number, profile picture and password, takes
                down your profile and ends your session permanently. Your contributions remain in de-identified form, as
                described in{" "}
                <a href="#retention" className={LINK_CLASS}>
                  Section {numberOf("retention")}
                </a>
                .
              </li>
            </List>
            <p>
              For any other request concerning your personal information, including removal of specific contributions,
              please{" "}
              <a href="#contact" className={LINK_CLASS}>
                contact us
              </a>
              .
            </p>
          </Section>

          <Section id="children">
            <p>
              The Site is intended for members of the TPASC climbing wall community. We do not knowingly collect personal
              information from children without the involvement of a parent or guardian. If you believe a child has
              provided personal information without appropriate consent, please contact us and we will delete it.
            </p>
          </Section>

          <Section id="changes">
            <p>
              We may update this Policy from time to time to reflect changes to the Site or to applicable law. When we
              do, we will revise the effective date at the top of this page. Material changes will be announced on the
              Site&apos;s updates page.
            </p>
          </Section>

          <Section id="contact">
            <p>
              If you have questions about this Policy or wish to make a request regarding your personal information,
              please speak with the staff at the TPASC climbing wall.
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
}
