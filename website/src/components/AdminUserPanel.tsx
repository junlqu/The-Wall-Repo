"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { DANGER_BUTTON_CLASS, Dialog, SidePanel } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import DurationWheel, { type Duration, durationMinutes } from "@/components/DurationWheel";
import ProfileLink from "@/components/ProfileLink";
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH, MAX_PHONE_DIGITS } from "@/lib/account";
import { avatarUrl } from "@/lib/avatar";
import { useSessionUser } from "@/lib/session";
import {
  activeBan,
  banUser,
  editLockedReason,
  fetchUser,
  levelLabel,
  MAX_BAN_DAYS,
  MAX_BAN_REASON_LENGTH,
  MAX_USERNAME_LENGTH,
  updateUser,
  type UserBan,
  type UserDetails,
  type UserEdit,
} from "@/lib/users";

const OUTLINE_DANGER_BUTTON_CLASS =
  "inline-flex flex-1 items-center justify-center rounded-full border border-red-600 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:bg-red-50";
const SMALL_PRIMARY_BUTTON_CLASS = PRIMARY_BUTTON_CLASS.replace("px-5", "px-4");
const SMALL_CANCEL_BUTTON_CLASS = CANCEL_BUTTON_CLASS.replace("px-5", "px-4");

type Moderation = "ban" | "timeout";

function toEdit(user: UserDetails): UserEdit {
  const { username, fname, lname, email, phone } = user;
  return { username, fname, lname, email, phone, resetAvatar: false };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="break-words text-sm text-neutral-800">{children}</dd>
    </div>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// A number of minutes as e.g. "2 days 3 hours".
function describeMinutes(total: number) {
  const parts = [
    [Math.floor(total / 1440), "day"],
    [Math.floor((total % 1440) / 60), "hour"],
    [total % 60, "minute"],
  ] as const;
  return parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? "" : "s"}`)
    .join(" ");
}

// How long a ban is or was meant to last.
function describeLength(ban: UserBan) {
  if (ban.endAt === null) return "Permanent";
  return describeMinutes(Math.round((Date.parse(ban.endAt) - Date.parse(ban.startAt)) / 60_000));
}

function BannedBy({ ban }: { ban: UserBan }) {
  return ban.bannedBy ? (
    <ProfileLink username={ban.bannedBy.username} className="font-semibold" />
  ) : (
    <span className="italic">a deleted account</span>
  );
}

// The ban running now, if they're banned.
function CurrentBan({ ban }: { ban: UserBan }) {
  return (
    <section aria-label="Current ban" className="flex flex-col gap-1 rounded-lg border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-semibold">{ban.endAt ? `Banned until ${formatWhen(ban.endAt)}` : "Banned permanently"}</p>
      <p className="whitespace-pre-wrap break-words">{ban.reason}</p>
      <p className="text-xs text-red-800/80">
        By <BannedBy ban={ban} /> on {formatWhen(ban.startAt)}
      </p>
    </section>
  );
}

// Every ban they've had, newest first.
function BanHistory({ bans }: { bans: UserBan[] }) {
  if (bans.length === 0) return null;
  return (
    <details className="group rounded-lg bg-neutral-50 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-semibold text-neutral-700">
        Ban history ({bans.length})
      </summary>
      <ol className="mt-3 flex flex-col divide-y divide-neutral-200">
        {[...bans].reverse().map((ban) => (
          <li key={ban.startAt} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <p className="flex flex-wrap justify-between gap-x-2 text-xs text-neutral-500">
              <span>{formatWhen(ban.startAt)}</span>
              <span className="font-semibold text-neutral-600">{describeLength(ban)}</span>
            </p>
            <p className="whitespace-pre-wrap break-words text-neutral-800">{ban.reason}</p>
            <p className="text-xs text-neutral-500">
              By <BannedBy ban={ban} />
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

const NO_DURATION: Duration = { days: 0, hours: 0, minutes: 0 };

// The dropdown under Ban or Timeout: how long, on days/hours/minutes wheels,
// and why. A ban can also be permanent; a timeout always ends. `onDone`
// gets them as they are after the ban.
// TODO: the timeout API lands separately - until then, submitting a
// timeout does nothing.
function ModerationForm({
  action,
  user,
  onCancel,
  onDone,
}: {
  action: Moderation;
  user: UserDetails;
  onCancel: () => void;
  onDone: (user: UserDetails) => void;
}) {
  const [duration, setDuration] = useState<Duration>(NO_DURATION);
  const [permanent, setPermanent] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const label = action === "ban" ? "Ban" : "Timeout";
  const minutes = durationMinutes(duration);
  const forever = action === "ban" && permanent;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!forever && minutes === 0) {
      setError(`Choose how long the ${action} lasts${action === "ban" ? ", or make it permanent" : ""}.`);
      return;
    }
    if (action !== "ban") return;
    setBusy(true);
    setError(undefined);
    try {
      onDone(await banUser(user.userID, forever ? null : minutes, reason));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      aria-label={`${label} @${user.username}`}
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4"
    >
      <fieldset disabled={busy} className="contents">
        <div className={LABEL_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <span>Duration</span>
            {action === "ban" && (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-neutral-700 has-[:checked]:border-red-600 has-[:checked]:text-red-700">
                <input
                  type="checkbox"
                  checked={permanent}
                  onChange={(event) => setPermanent(event.target.checked)}
                  className="h-4 w-4 accent-red-600"
                />
                Permanent
              </label>
            )}
          </div>
          <DurationWheel value={duration} maxDays={MAX_BAN_DAYS} disabled={forever || busy} onChange={setDuration} />
          <span className="text-xs font-normal normal-case tracking-normal text-neutral-600" aria-live="polite">
            {forever
              ? "Never ends"
              : minutes === 0
                ? "Spin the wheels to choose how long"
                : `Lasts ${describeMinutes(minutes)}`}
          </span>
        </div>

        <label className={LABEL_CLASS}>
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_BAN_REASON_LENGTH}
            required
            rows={3}
            className={`${FIELD_CLASS} resize-y`}
          />
          <span className="self-end text-[11px] font-normal normal-case tracking-normal text-neutral-500">
            {reason.length}/{MAX_BAN_REASON_LENGTH}
          </span>
        </label>

        <ErrorMessage message={error} />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={SMALL_CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button type="submit" className={DANGER_BUTTON_CLASS.replace("px-5", "px-4")}>
            {busy ? `${label === "Ban" ? "Banning" : "Timing out"}…` : label}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

// TODO: deleting lands with the moderation API - until then, confirming
// does nothing.
function DeleteUserDialog({ username, onClose }: { username: string; onClose: () => void }) {
  return (
    <Dialog title={`Delete @${username}?`} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        Their account will be deleted and they won&apos;t be able to log in. This can&apos;t be undone.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="button" onClick={() => {}} className={DANGER_BUTTON_CLASS}>
          Delete
        </button>
      </div>
    </Dialog>
  );
}

function EditFields({ edit, onChange }: { edit: UserEdit; onChange: (edit: UserEdit) => void }) {
  const set = (field: keyof Omit<UserEdit, "resetAvatar">) => (value: string) => onChange({ ...edit, [field]: value });
  const field = (
    label: string,
    key: keyof Omit<UserEdit, "resetAvatar">,
    props: { type?: string; maxLength: number; required?: boolean; inputMode?: "numeric" | "email"; autoComplete?: string },
    clean: (value: string) => string = (value) => value,
  ) => (
    <label className={LABEL_CLASS}>
      {label}
      <input
        {...props}
        value={edit[key]}
        onChange={(event) => set(key)(clean(event.target.value))}
        className={FIELD_CLASS}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {field("Username", "username", { maxLength: MAX_USERNAME_LENGTH, required: true, autoComplete: "off" })}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("First name", "fname", { maxLength: MAX_NAME_LENGTH, required: true, autoComplete: "off" })}
        {field("Last name", "lname", { maxLength: MAX_NAME_LENGTH, required: true, autoComplete: "off" })}
      </div>
      {field("Email", "email", { type: "email", maxLength: MAX_EMAIL_LENGTH, inputMode: "email", autoComplete: "off" })}
      {field(
        "Phone",
        "phone",
        { type: "tel", maxLength: MAX_PHONE_DIGITS, inputMode: "numeric", autoComplete: "off" },
        (value) => value.replace(/\D/g, ""),
      )}
      <p className="text-xs text-neutral-500">Email and phone are optional.</p>
    </div>
  );
}

// One person's account for the admin user center, in a side panel (the whole
// screen on phones). Staff and admins can edit people below their own level.
// `onSaved` gets them as saved, so the list can catch up.
export default function AdminUserPanel({
  userID,
  onClose,
  onSaved,
}: {
  userID: string;
  onClose: () => void;
  onSaved: (user: UserDetails) => void;
}) {
  const me = useSessionUser();
  // undefined while loading.
  const [user, setUser] = useState<UserDetails>();
  const [loadError, setLoadError] = useState<string>();
  // Their details as being edited, or null when just looking.
  const [edit, setEdit] = useState<UserEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [moderation, setModeration] = useState<Moderation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const formId = useId();

  useEffect(() => {
    let current = true;
    fetchUser(userID)
      .then((loaded) => current && setUser(loaded))
      .catch((error: Error) => current && setLoadError(error.message));
    return () => {
      current = false;
    };
  }, [userID]);

  const locked = user && me ? editLockedReason(me, user) : "Loading…";
  const ban = user && activeBan(user);

  const banned = (saved: UserDetails) => {
    setUser(saved);
    setModeration(null);
    onSaved(saved);
  };

  const startEdit = () => {
    if (!user) return;
    setModeration(null);
    setSaveError(undefined);
    setEdit(toEdit(user));
  };

  const cancelEdit = () => {
    setEdit(null);
    setSaveError(undefined);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!edit || !user) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const saved = await updateUser(user.userID, edit);
      setUser(saved);
      setEdit(null);
      onSaved(saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const headerActions = user && !locked && (
    edit ? (
      <>
        <button type="button" disabled={saving} onClick={cancelEdit} className={SMALL_CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="submit" form={formId} disabled={saving} className={SMALL_PRIMARY_BUTTON_CLASS}>
          {saving ? "Saving…" : "Save"}
        </button>
      </>
    ) : (
      <button type="button" onClick={startEdit} className={SMALL_PRIMARY_BUTTON_CLASS}>
        Edit
      </button>
    )
  );

  return (
    <SidePanel title={edit ? "Edit user" : "User"} busy={saving} onClose={onClose} actions={headerActions}>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-6">
        {!user ? (
          loadError ? (
            <ErrorMessage message={`Couldn't load their account: ${loadError}`} />
          ) : (
            <p className="text-sm text-neutral-500">Loading…</p>
          )
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(user)}
                  alt=""
                  width={80}
                  height={80}
                  className={`h-20 w-20 rounded-full object-cover ring-1 ring-neutral-200 transition-opacity ${
                    edit?.resetAvatar ? "opacity-30" : ""
                  }`}
                />
                {edit?.resetAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center text-center text-[11px] font-semibold leading-tight text-neutral-700">
                    Default
                    <br />
                    on save
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                {user.deletedAt ? (
                  <p className="truncate font-semibold text-neutral-800">@{user.username}</p>
                ) : (
                  <ProfileLink username={user.username} className="truncate font-semibold text-neutral-800" />
                )}
                <p className="text-xs text-neutral-500">
                  {levelLabel(user.level)}
                  {user.deletedAt && " · Deleted account"}
                  {ban && <span className="font-semibold text-red-700"> · Banned</span>}
                </p>
                {edit && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEdit({ ...edit, resetAvatar: !edit.resetAvatar })}
                    className="self-start text-xs font-semibold text-primary hover:text-secondary disabled:opacity-50"
                  >
                    {edit.resetAvatar ? "Keep current picture" : "Reset picture to default"}
                  </button>
                )}
              </div>
            </div>

            {edit ? (
              <form id={formId} onSubmit={save} className="flex flex-col gap-4">
                <fieldset disabled={saving} className="contents">
                  <EditFields edit={edit} onChange={setEdit} />
                </fieldset>
                <ErrorMessage message={saveError} />
              </form>
            ) : (
              <dl className="flex flex-col gap-4">
                <Detail label="Username">{user.username}</Detail>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Detail label="First name">{user.fname}</Detail>
                  <Detail label="Last name">{user.lname}</Detail>
                </div>
                <Detail label="Email">{user.email || <span className="text-neutral-400">None</span>}</Detail>
                <Detail label="Phone">{user.phone || <span className="text-neutral-400">None</span>}</Detail>
              </dl>
            )}

            {locked && <p className="text-xs text-neutral-500">{locked}</p>}

            {!edit && ban && <CurrentBan ban={ban} />}
            {!edit && <BanHistory bans={user.ban} />}
          </>
        )}
      </div>

      {user && !edit && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 px-6 py-4">
          <div className="flex gap-2">
            {(["ban", "timeout"] as const).map((action) => (
              <button
                key={action}
                type="button"
                // Nobody can be banned again while a ban is running.
                disabled={!!locked || !!ban}
                title={ban ? "They're already banned" : undefined}
                aria-expanded={moderation === action}
                onClick={() => setModeration(moderation === action ? null : action)}
                className={OUTLINE_DANGER_BUTTON_CLASS}
              >
                {action === "ban" ? "Ban" : "Timeout"}
              </button>
            ))}
            <button
              type="button"
              disabled={!!locked}
              onClick={() => {
                setModeration(null);
                setDeleting(true);
              }}
              className={`${DANGER_BUTTON_CLASS.replace("px-5", "px-4")} flex-1`}
            >
              Delete
            </button>
          </div>
          {moderation && (
            <ModerationForm
              key={moderation}
              action={moderation}
              user={user}
              onCancel={() => setModeration(null)}
              onDone={banned}
            />
          )}
        </div>
      )}

      {deleting && user && <DeleteUserDialog username={user.username} onClose={() => setDeleting(false)} />}
    </SidePanel>
  );
}
