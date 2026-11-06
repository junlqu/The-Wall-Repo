"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import AccessNotice from "@/components/AccessNotice";
import AvatarCropDialog from "@/components/AvatarCropDialog";
import PasswordRules from "@/components/PasswordRules";
import {
  type Account,
  type AccountDetails,
  changePassword,
  deleteAccount,
  EMAIL_PATTERN,
  fetchAccount,
  fetchAccountData,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_DIGITS,
  PASSWORD_RULES,
  saveAccount,
  saveCookies,
  savePrivacy,
  uploadAvatar,
} from "@/lib/account";
import { AVATAR_SIZE, avatarUrl } from "@/lib/avatar";
import { PRIVACY_POLICY_HREF } from "@/lib/navLinks";
import { PROFILE_SECTIONS, type ProfilePrivacy, VISIBILITIES } from "@/lib/privacy";
import { profileHref } from "@/lib/profiles";
import { withReturnTo } from "@/lib/returnTo";
import { type SessionUser, setSessionUser, useSessionUser } from "@/lib/session";
import {
  SETTINGS_CATEGORIES,
  SETTINGS_TABS,
  settingsCategoryOf,
  type SettingsTabID,
  settingsHref,
  toSettingsTab,
} from "@/lib/settings";
import { zip } from "@/lib/zip";

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary disabled:bg-neutral-100 disabled:text-neutral-500";
const LABEL_CLASS = "text-sm font-medium text-neutral-700";
const PRIMARY_BUTTON_CLASS =
  "rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "rounded-full border border-primary bg-white px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

type SaveStatus = { ok: boolean; message: string } | null;

// Tabs with no settings in them yet - each shows a placeholder until it gets
// some.
const EMPTY_TABS: SettingsTabID[] = ["preferences", "accessibility", "dashboard"];

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
    </div>
  );
}

// What a save came to - shown under the form until they change something.
function Status({ status }: { status: SaveStatus }) {
  if (!status) return null;
  return (
    <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
      {status.message}
    </p>
  );
}

// Line icons on a 24x24 grid, drawn in the tab's text colour.
const TAB_ICONS: Record<SettingsTabID, ReactNode> = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  account: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  security: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </>
  ),
  privacy: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  preferences: (
    <>
      <path d="M4 6h3M11 6h9M4 12h9M17 12h3M4 18h1M9 18h11" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M5 8l7 1.5L19 8M12 9.5V14m0 0l-3 6m3-6l3 6" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  cookies: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 9h.01M14 8h.01M15.5 14h.01M9.5 15h.01M12 12h.01" />
    </>
  ),
  "data-privacy": <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />,
  "account-status": <path d="M12 3v9M6.3 6.3a8 8 0 1011.4 0" />,
};

function TabIcon({ tab }: { tab: SettingsTabID }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {TAB_ICONS[tab]}
    </svg>
  );
}

// The tabs, under their categories: a column down the left on wider screens.
// On phones it's a strip of tabs across the top - the category of the open one
// shows above its heading instead.
function SettingsNav({ current }: { current: SettingsTabID }) {
  return (
    <nav
      aria-label="Settings"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 md:sticky md:top-24 md:w-52 md:shrink-0 md:overflow-visible"
    >
      <div className="flex min-w-max border-b border-neutral-200 md:min-w-0 md:flex-col md:gap-6 md:border-b-0">
        {SETTINGS_CATEGORIES.map((category) => (
          <div key={category.label}>
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400 max-md:sr-only">
              {category.label}
            </h2>
            <ul className="flex md:flex-col md:gap-1">
              {category.tabs.map((tab) => {
                const isCurrent = tab.id === current;
                return (
                  <li key={tab.id}>
                    <Link
                      href={settingsHref(tab.id)}
                      scroll={false}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors md:mb-0 md:rounded-md md:border-b-0 md:px-3 md:py-2 ${
                        isCurrent
                          ? "border-primary text-primary md:bg-white md:shadow-sm md:ring-1 md:ring-neutral-200"
                          : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 md:hover:bg-neutral-200/60"
                      }`}
                    >
                      <TabIcon tab={tab.id} />
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

// Their picture, which they can swap for a photo of their own. They frame
// the part they want, and only that is sent - shrunk to 128x128 in the
// browser, so each one is only a few KB in the database.
function PictureCard({ user }: { user: SessionUser }) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still opens the framing.
    event.target.value = "";
    if (file) setPicked(file);
  };

  const save = async (avatar: string) => {
    setSessionUser(await uploadAvatar(user.userID, avatar));
    setPicked(null);
  };

  return (
    <section aria-label="Profile picture" className={`${PANEL_CLASS} flex flex-col items-center gap-4 sm:flex-row sm:gap-6`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(user)}
        alt="Your profile picture"
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        className="h-24 w-24 shrink-0 rounded-full border-2 border-black object-cover"
      />
      <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
        <div className="text-center sm:text-left">
          <p className="text-xl font-bold text-primary">{user.fname}</p>
          <p className="text-sm text-neutral-500">@{user.username}</p>
          <p className="flex flex-wrap justify-center gap-x-3 sm:justify-start">
            <Link href={profileHref(user.username)} className="text-sm font-medium text-primary hover:underline">
              View your profile
            </Link>
            <Link href={profileHref(user.username, true)} className="text-sm font-medium text-primary hover:underline">
              See how others see you
            </Link>
          </p>
        </div>
        <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
        <button type="button" onClick={() => input.current?.click()} className={SECONDARY_BUTTON_CLASS}>
          Change picture
        </button>
      </div>
      {picked && <AvatarCropDialog file={picked} onCancel={() => setPicked(null)} onSave={save} />}
    </section>
  );
}

// One card's share of their details. The API takes all four together, so a
// card sends its own fields as edited and the rest as they were saved.
function useDetailsForm(
  account: Account,
  fields: (keyof AccountDetails)[],
  onSaved: (account: Account) => void,
  savedMessage: string,
) {
  const [details, setDetails] = useState<AccountDetails>(account);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const edit = (field: keyof AccountDetails, value: string) => {
    setDetails((current) => ({ ...current, [field]: value }));
    setStatus(null);
  };
  const changed = fields.some((field) => details[field].trim() !== account[field]);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const body: AccountDetails = { fname: account.fname, lname: account.lname, email: account.email, phone: account.phone };
      for (const field of fields) body[field] = details[field];
      const saved = await saveAccount(body);
      setSessionUser(saved.user);
      setDetails(saved.account);
      onSaved(saved.account);
      setStatus({ ok: true, message: savedMessage });
    } catch (saveError) {
      setStatus({ ok: false, message: saveError instanceof Error ? saveError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return { details, edit, changed, busy, status, save };
}

function SaveButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return (
    <div className="flex justify-end">
      <button type="submit" disabled={busy || disabled} className={PRIMARY_BUTTON_CLASS}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function NameCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const form = useDetailsForm(account, ["fname", "lname"], onSaved, "Your name has been saved.");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    form.save();
  };

  return (
    <section aria-labelledby="name-heading" className={PANEL_CLASS}>
      <h3 id="name-heading" className={PANEL_HEADING_CLASS}>
        Your name
      </h3>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="fname" label="First name">
            <input
              id="fname"
              autoComplete="given-name"
              required
              maxLength={MAX_NAME_LENGTH}
              value={form.details.fname}
              onChange={(event) => form.edit("fname", event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field id="lname" label="Last name">
            <input
              id="lname"
              autoComplete="family-name"
              required
              maxLength={MAX_NAME_LENGTH}
              value={form.details.lname}
              onChange={(event) => form.edit("lname", event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <p className="text-xs text-neutral-500">Your profile shows your first name and the first letter of your last.</p>
        <Status status={form.status} />
        <SaveButton busy={form.busy} disabled={!form.changed} />
      </form>
    </section>
  );
}

function LoginDetailsCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const form = useDetailsForm(account, ["email", "phone"], onSaved, "Your login details have been saved.");
  const email = form.details.email.trim();
  const emailInvalid = email !== "" && !EMAIL_PATTERN.test(email);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!emailInvalid) form.save();
  };

  return (
    <section aria-labelledby="login-heading" className={PANEL_CLASS}>
      <h3 id="login-heading" className={PANEL_HEADING_CLASS}>
        Login details
      </h3>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <Field id="username" label="Username">
          <input id="username" value={`@${account.username}`} disabled aria-describedby="username-note" className={INPUT_CLASS} />
          <p id="username-note" className="text-xs text-neutral-500">
            Your username can&apos;t be changed.
          </p>
        </Field>
        <Field id="email" label="Email">
          {/* type="text" so our message is the only one shown, not the browser's popup too. */}
          <input
            id="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            maxLength={MAX_EMAIL_LENGTH}
            value={form.details.email}
            onChange={(event) => form.edit("email", event.target.value)}
            aria-invalid={emailInvalid}
            aria-describedby={emailInvalid ? "email-error" : undefined}
            className={INPUT_CLASS}
          />
          {emailInvalid && (
            <p id="email-error" className="text-xs text-red-600">
              Enter a full email address, like name@example.com.
            </p>
          )}
        </Field>
        <Field id="phone" label="Phone">
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={MAX_PHONE_DIGITS}
            value={form.details.phone}
            // Drop anything that isn't a digit, typed or pasted.
            onChange={(event) => form.edit("phone", event.target.value.replace(/\D/g, ""))}
            className={INPUT_CLASS}
          />
        </Field>
        <p className="text-xs text-neutral-500">Email and phone are optional. Either can be used to log in.</p>
        <Status status={form.status} />
        <SaveButton busy={form.busy} disabled={!form.changed || emailInvalid} />
      </form>
    </section>
  );
}

// Shut until they ask to change it, then their current password and the new
// one twice.
function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const nextValid = PASSWORD_RULES.every((rule) => rule.test(next));
  const mismatch = confirm !== "" && confirm !== next;

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!nextValid) {
      setStatus({ ok: false, message: "Your new password doesn't meet all the requirements yet." });
      return;
    }
    if (next !== confirm) {
      setStatus({ ok: false, message: "Your new passwords don't match." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await changePassword(current, next);
      close();
      setStatus({ ok: true, message: "Your password has been changed." });
    } catch (changeError) {
      setStatus({ ok: false, message: changeError instanceof Error ? changeError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="password-heading" className={PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="password-heading" className={PANEL_HEADING_CLASS}>
          Password
        </h3>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setStatus(null);
            }}
            className={SECONDARY_BUTTON_CLASS}
          >
            Change password
          </button>
        )}
      </div>
      {!open && status && (
        <div className="mt-3">
          <Status status={status} />
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <Field id="current-password" label="Current password">
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field id="new-password" label="New password">
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-describedby="new-password-rules"
              className={INPUT_CLASS}
            />
            {next !== "" && <PasswordRules id="new-password-rules" password={next} />}
          </Field>
          <Field id="confirm-password" label="Confirm new password">
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={mismatch}
              aria-describedby={mismatch ? "confirm-error" : undefined}
              className={INPUT_CLASS}
            />
            {mismatch && (
              <p id="confirm-error" className="text-xs text-red-600">
                Doesn&apos;t match your new password.
              </p>
            )}
          </Field>
          <Status status={status} />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                close();
                setStatus(null);
              }}
              disabled={busy}
              className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
              {busy ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Who can see each part of their profile, one row each - a choice of
// Everyone, Friends or No one. Saved together.
function PrivacyCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(account.privacy);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  const changed = PROFILE_SECTIONS.some(({ id }) => privacy[id] !== account.privacy[id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const saved = await savePrivacy(privacy);
      setPrivacy(saved);
      onSaved({ ...account, privacy: saved });
      setStatus({ ok: true, message: "Your privacy settings have been saved." });
    } catch (saveError) {
      setStatus({ ok: false, message: saveError instanceof Error ? saveError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="privacy-heading" className={PANEL_CLASS}>
      <h3 id="privacy-heading" className={PANEL_HEADING_CLASS}>
        Public profile
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        Choose who can see each part of your profile. Your picture, name and username are always shown.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col divide-y divide-neutral-100">
          {PROFILE_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <p id={`privacy-${section.id}`} className={LABEL_CLASS}>
                {section.label}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`privacy-${section.id}`}
                className="inline-flex shrink-0 self-start rounded-full border border-neutral-300 bg-neutral-50 p-0.5 sm:self-auto"
              >
                {VISIBILITIES.map((visibility) => (
                  <label
                    key={visibility.id}
                    className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-900 has-[:checked]:bg-primary has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary"
                  >
                    <input
                      type="radio"
                      name={`privacy-${section.id}`}
                      value={visibility.id}
                      checked={privacy[section.id] === visibility.id}
                      onChange={() => {
                        setPrivacy((current) => ({ ...current, [section.id]: visibility.id }));
                        setStatus(null);
                      }}
                      className="sr-only"
                    />
                    {visibility.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          You can&apos;t add friends yet, so for now Friends means only you can see it.{" "}
          <Link href={profileHref(account.username, true)} className="font-medium text-primary hover:underline">
            See how others see you
          </Link>
        </p>
        <Status status={status} />
        <SaveButton busy={busy} disabled={!changed} />
      </form>
    </section>
  );
}

function Switch({ on, labelledBy, disabled, onChange }: { on: boolean; labelledBy: string; disabled?: boolean; onChange?: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        on ? "bg-primary" : "bg-neutral-300"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

// Whether the site may use cookies it could do without, with a note under it
// that the one keeping them logged in is always on. There aren't any of those yet, so
// the choice is saved but changes nothing - what they hold will be chosen
// under it once there are.
function CookiesCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  const optional = account.cookies.optional;

  // Saved as soon as it's flicked.
  const toggle = async (on: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      onSaved({ ...account, cookies: await saveCookies(on) });
    } catch (saveError) {
      setStatus({ ok: false, message: saveError instanceof Error ? saveError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="cookies-heading" className={PANEL_CLASS}>
      <h3 id="cookies-heading" className={PANEL_HEADING_CLASS}>
        Cookies
      </h3>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="cookies-optional" className={LABEL_CLASS}>
                Optional cookies
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Let the site keep more in your browser. It doesn&apos;t use any yet, so this changes nothing for now.
              </p>
            </div>
            <Switch on={optional} labelledBy="cookies-optional" disabled={busy} onChange={toggle} />
          </div>
          {optional && (
            <div className="rounded-md border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-500">
              You&apos;ll choose what optional cookies can hold here. There&apos;s nothing to choose yet.
            </div>
          )}
          <Status status={status} />
        </div>
        <p className="flex items-start gap-2 rounded-md bg-neutral-50 px-4 py-3 text-xs text-neutral-600 ring-1 ring-neutral-200">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px h-3.5 w-3.5 shrink-0 text-neutral-400"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 018 0v4" />
          </svg>
          <span>
            <span className="font-semibold text-neutral-700">Strictly necessary cookies are always on.</span> They keep you logged
            in, and the site can&apos;t work without them.
          </span>
        </p>
        <p className="text-xs text-neutral-500">
          See every cookie the site uses in the{" "}
          <Link href={`${PRIVACY_POLICY_HREF}#cookies`} className="font-medium text-primary hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

const DOWNLOADS = [
  { id: "user", label: "Download user data", description: "Your account and settings, as a JSON file." },
  {
    id: "comments",
    label: "Download comment data",
    description: "Every comment, grade, rating and send you've logged, as a JSON file.",
  },
  { id: "all", label: "Download all", description: "Both files together in a ZIP." },
] as const;
type DownloadID = (typeof DOWNLOADS)[number]["id"];

const toJSON = (data: unknown) => JSON.stringify(data, null, 2);

// Hands the browser a file to save.
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url));
}

// A copy of what's saved about them, to keep.
function PersonalDataCard({ username }: { username: string }) {
  const [busy, setBusy] = useState<DownloadID | null>(null);
  const [status, setStatus] = useState<SaveStatus>(null);

  const download = async (id: DownloadID) => {
    setBusy(id);
    setStatus(null);
    const prefix = `the-wall-${username}`;
    try {
      if (id === "all") {
        const [user, comments] = await Promise.all([fetchAccountData("user"), fetchAccountData("comments")]);
        const files = [
          { name: "user.json", content: toJSON(user) },
          { name: "comments.json", content: toJSON(comments) },
        ];
        saveFile(zip(files), `${prefix}-data.zip`);
      } else {
        const data = await fetchAccountData(id);
        saveFile(new Blob([toJSON(data)], { type: "application/json" }), `${prefix}-${id}.json`);
      }
    } catch (downloadError) {
      setStatus({ ok: false, message: downloadError instanceof Error ? downloadError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="personal-data-heading" className={PANEL_CLASS}>
      <h3 id="personal-data-heading" className={PANEL_HEADING_CLASS}>
        Personal data
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        Everything is exactly as it&apos;s saved, except your password, which is never included. The{" "}
        <Link href={`${PRIVACY_POLICY_HREF}#data`} className="font-medium text-primary hover:underline">
          privacy policy
        </Link>{" "}
        explains what each part is and why it&apos;s kept.
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-neutral-100">
        {DOWNLOADS.map((option) => (
          <li
            key={option.id}
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <p className={LABEL_CLASS}>{option.label}</p>
              <p className="mt-1 text-xs text-neutral-500">{option.description}</p>
            </div>
            <button
              type="button"
              onClick={() => download(option.id)}
              disabled={busy !== null}
              className={`${SECONDARY_BUTTON_CLASS} shrink-0 self-start sm:self-auto`}
            >
              {busy === option.id ? "Preparing…" : "Download"}
            </button>
          </li>
        ))}
      </ul>
      {status && (
        <div className="mt-3">
          <Status status={status} />
        </div>
      )}
    </section>
  );
}

// A tab whose settings haven't been added yet.
function EmptyTab() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm font-semibold text-neutral-700">Nothing here yet</p>
      <p className="mt-1 text-sm text-neutral-500">These settings are still being built.</p>
    </div>
  );
}

// Shut until they ask, then what deleting does and their password to go
// ahead. Once it's done they're logged out and sent home.
function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const close = () => {
    setOpen(false);
    setPassword("");
    setStatus(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await deleteAccount(password);
      setSessionUser(null);
      router.replace("/");
    } catch (deleteError) {
      setStatus({ ok: false, message: deleteError instanceof Error ? deleteError.message : "Something went wrong. Try again." });
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="delete-heading" className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
      <h3 id="delete-heading" className="text-sm font-semibold uppercase tracking-wide text-red-700">
        Delete account
      </h3>
      {!open ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">Permanently delete your account. This can&apos;t be undone.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 self-end rounded-full border border-red-600 bg-white px-5 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white sm:self-auto"
          >
            Delete account
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-sm text-neutral-600">
            <p>Deleting your account:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Removes your name, username, email, phone and picture.</li>
              <li>Takes down your profile, so nobody can view it.</li>
              <li>Logs you out - you won&apos;t be able to log back in.</li>
              <li>Leaves your comments and sends on the climbs, without your name on them.</li>
            </ul>
            <p className="font-semibold text-red-700">This can&apos;t be undone.</p>
          </div>
          <Field id="delete-password" label="Enter your password to confirm">
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setStatus(null);
              }}
              className={INPUT_CLASS}
            />
          </Field>
          <Status status={status} />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || password === ""}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Their own settings: tabs down the side, and the open tab's cards beside
// them in a narrower column.
export default function AccountSettings() {
  const user = useSessionUser();
  const userID = user?.userID;
  const tab = toSettingsTab(useSearchParams().get("tab"));
  const current = SETTINGS_TABS.find((item) => item.id === tab)!;
  const [account, setAccount] = useState<Account | "error" | null>(null);

  // Loaded once for every tab, so switching between them doesn't fetch again.
  useEffect(() => {
    if (!userID) return;
    fetchAccount()
      .then(setAccount)
      .catch(() => setAccount("error"));
  }, [userID]);

  if (user === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  if (user === null) {
    return (
      <AccessNotice
        title="Settings"
        message="Log in to change your details, picture, and password."
        actionLabel="Log in"
        actionHref={withReturnTo("/login", settingsHref(tab))}
      />
    );
  }

  // The cards that edit their saved details wait for them to load.
  const withAccount = (render: (account: Account) => ReactNode) =>
    account === "error" ? (
      <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
        Your details couldn&apos;t be loaded. Try refreshing the page.
      </p>
    ) : account ? (
      render(account)
    ) : (
      <div className={`${PANEL_CLASS} h-72 animate-pulse`} />
    );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-primary sm:text-4xl">Settings</h1>
        <p className="mt-2 text-neutral-600">Change how you appear on the wall and how you log in.</p>

        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
          <SettingsNav current={tab} />

          <section aria-labelledby="settings-tab-heading" className="flex min-w-0 flex-1 flex-col gap-6 md:max-w-xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {settingsCategoryOf(tab).label}
              </p>
              <h2 id="settings-tab-heading" className="text-xl font-bold text-primary">
                {current.label}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">{current.description}</p>
            </div>

            {tab === "profile" && (
              <>
                <PictureCard user={user} />
                {withAccount((loaded) => (
                  <NameCard account={loaded} onSaved={setAccount} />
                ))}
              </>
            )}
            {tab === "account" &&
              withAccount((loaded) => <LoginDetailsCard account={loaded} onSaved={setAccount} />)}
            {tab === "security" && <PasswordCard />}
            {tab === "privacy" && withAccount((loaded) => <PrivacyCard account={loaded} onSaved={setAccount} />)}
            {tab === "cookies" && withAccount((loaded) => <CookiesCard account={loaded} onSaved={setAccount} />)}
            {tab === "data-privacy" && <PersonalDataCard username={user.username} />}
            {tab === "account-status" && <DeleteAccountCard />}
            {EMPTY_TABS.includes(tab) && <EmptyTab />}
          </section>
        </div>
      </div>
    </div>
  );
}
