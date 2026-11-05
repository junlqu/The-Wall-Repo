"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import AccessNotice from "@/components/AccessNotice";
import AvatarCropDialog from "@/components/AvatarCropDialog";
import PasswordRules from "@/components/PasswordRules";
import {
  type Account,
  type AccountDetails,
  changePassword,
  EMAIL_PATTERN,
  fetchAccount,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_DIGITS,
  PASSWORD_RULES,
  saveAccount,
  uploadAvatar,
} from "@/lib/account";
import { AVATAR_SIZE, avatarUrl } from "@/lib/avatar";
import { profileHref } from "@/lib/profiles";
import { withReturnTo } from "@/lib/returnTo";
import { type SessionUser, setSessionUser, useSessionUser } from "@/lib/session";

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary disabled:bg-neutral-100 disabled:text-neutral-500";
const LABEL_CLASS = "text-sm font-medium text-neutral-700";
const PRIMARY_BUTTON_CLASS =
  "rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "rounded-full border border-primary bg-white px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

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
function Status({ status }: { status: { ok: boolean; message: string } | null }) {
  if (!status) return null;
  return (
    <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
      {status.message}
    </p>
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
          <Link href={profileHref(user.username, true)} className="text-sm font-medium text-primary hover:underline">
            See how others see you
          </Link>
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

function DetailsCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [details, setDetails] = useState<AccountDetails>(account);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const edit = (field: keyof AccountDetails, value: string) => {
    setDetails((current) => ({ ...current, [field]: value }));
    setStatus(null);
  };
  const changed = (Object.keys(details) as (keyof AccountDetails)[]).some(
    (field) => details[field].trim() !== account[field],
  );
  const emailInvalid = details.email.trim() !== "" && !EMAIL_PATTERN.test(details.email.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (emailInvalid) return;
    setBusy(true);
    setStatus(null);
    try {
      const saved = await saveAccount(details);
      setSessionUser(saved.user);
      setDetails(saved.account);
      onSaved(saved.account);
      setStatus({ ok: true, message: "Your details have been saved." });
    } catch (saveError) {
      setStatus({ ok: false, message: saveError instanceof Error ? saveError.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="details-heading" className={PANEL_CLASS}>
      <h2 id="details-heading" className={PANEL_HEADING_CLASS}>
        Your details
      </h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="fname" label="First name">
            <input
              id="fname"
              autoComplete="given-name"
              required
              maxLength={MAX_NAME_LENGTH}
              value={details.fname}
              onChange={(event) => edit("fname", event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field id="lname" label="Last name">
            <input
              id="lname"
              autoComplete="family-name"
              required
              maxLength={MAX_NAME_LENGTH}
              value={details.lname}
              onChange={(event) => edit("lname", event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
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
            value={details.email}
            onChange={(event) => edit("email", event.target.value)}
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
            value={details.phone}
            // Drop anything that isn't a digit, typed or pasted.
            onChange={(event) => edit("phone", event.target.value.replace(/\D/g, ""))}
            className={INPUT_CLASS}
          />
        </Field>
        <p className="text-xs text-neutral-500">Email and phone are optional. Either can be used to log in.</p>
        <Status status={status} />
        <div className="flex justify-end">
          <button type="submit" disabled={busy || !changed || emailInvalid} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
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
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

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
        <h2 id="password-heading" className={PANEL_HEADING_CLASS}>
          Password
        </h2>
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

// Their own profile, where they change their details, picture and password.
export default function AccountSettings() {
  const user = useSessionUser();
  const userID = user?.userID;
  const [account, setAccount] = useState<Account | "error" | null>(null);

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
        title="Your profile"
        message="Log in to change your details, picture, and password."
        actionLabel="Log in"
        actionHref={withReturnTo("/login", "/profile")}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Your profile</h1>
          <p className="mt-2 text-neutral-600">Change how you appear on the wall and how you log in.</p>
        </div>

        <PictureCard user={user} />

        {account === "error" ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
            Your details couldn&apos;t be loaded. Try refreshing the page.
          </p>
        ) : account ? (
          <DetailsCard account={account} onSaved={setAccount} />
        ) : (
          <div className={`${PANEL_CLASS} h-96 animate-pulse`} />
        )}

        <PasswordCard />
      </div>
    </div>
  );
}
