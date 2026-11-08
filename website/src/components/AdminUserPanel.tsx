"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { DANGER_BUTTON_CLASS, Dialog, SidePanel } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import ProfileLink from "@/components/ProfileLink";
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH, MAX_PHONE_DIGITS } from "@/lib/account";
import { avatarUrl } from "@/lib/avatar";
import { useSessionUser } from "@/lib/session";
import {
  editLockedReason,
  fetchUser,
  levelLabel,
  MAX_USERNAME_LENGTH,
  updateUser,
  type UserDetails,
  type UserEdit,
} from "@/lib/users";

// Mirrors the limit the moderation API will hold reasons to.
const MAX_REASON_LENGTH = 500;

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

// The dropdown under Ban or Timeout: how long, and why. A ban can also be
// permanent; a timeout always ends.
// TODO: the moderation API lands separately - until then, submitting does
// nothing.
function ModerationForm({ action, username, onCancel }: { action: Moderation; username: string; onCancel: () => void }) {
  const [hours, setHours] = useState("");
  const [permanent, setPermanent] = useState(false);
  const [reason, setReason] = useState("");
  const id = useId();
  const label = action === "ban" ? "Ban" : "Timeout";

  const submit = (event: FormEvent) => {
    event.preventDefault();
  };

  return (
    <form
      onSubmit={submit}
      aria-label={`${label} @${username}`}
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4"
    >
      <div className={LABEL_CLASS}>
        <label htmlFor={`${id}-hours`}>Duration</label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id={`${id}-hours`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required={!permanent}
              disabled={permanent}
              value={permanent ? "" : hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder={permanent ? "Forever" : ""}
              className={`${FIELD_CLASS} pr-14`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-normal normal-case tracking-normal text-neutral-500">
              hours
            </span>
          </div>
          {action === "ban" && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-neutral-700 has-[:checked]:border-red-600 has-[:checked]:text-red-700">
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
      </div>

      <label className={LABEL_CLASS}>
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={MAX_REASON_LENGTH}
          rows={3}
          className={`${FIELD_CLASS} resize-y`}
        />
        <span className="self-end text-[11px] font-normal normal-case tracking-normal text-neutral-500">
          {reason.length}/{MAX_REASON_LENGTH}
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SMALL_CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="submit" className={DANGER_BUTTON_CLASS.replace("px-5", "px-4")}>
          {label}
        </button>
      </div>
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
                disabled={!!locked}
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
              username={user.username}
              onCancel={() => setModeration(null)}
            />
          )}
        </div>
      )}

      {deleting && user && <DeleteUserDialog username={user.username} onClose={() => setDeleting(false)} />}
    </SidePanel>
  );
}
