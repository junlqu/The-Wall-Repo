"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ClimbActions";
import { Placeholder } from "@/components/ClimbCards";
import { FIELD_CLASS } from "@/components/ClimbForm";
import { avatarUrl } from "@/lib/avatar";
import { fetchFollowList, type FollowList, type ListedFollow } from "@/lib/follows";
import { displayName, profileHref } from "@/lib/profiles";

const TITLES: Record<FollowList, string> = { followers: "Followers", following: "Following" };

// `text` with the first part matching `search` (ignoring case) marked.
function Highlighted({ text, search }: { text: string; search: string }) {
  const start = search ? text.toLowerCase().indexOf(search.toLowerCase()) : -1;
  if (start === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-secondary/40 px-0.5 text-neutral-900">{text.slice(start, start + search.length)}</mark>
      {text.slice(start + search.length)}
    </>
  );
}

// Their picture, name and username, linking to their profile.
function FollowCard({ person, search }: { person: ListedFollow; search: string }) {
  return (
    <li>
      <Link
        href={profileHref(person.username)}
        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl(person)}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-neutral-800">
            <Highlighted text={displayName(person)} search={search} />
          </span>
          <span className="block truncate text-sm text-neutral-500">
            @<Highlighted text={person.username} search={search} />
          </span>
        </span>
      </Link>
    </li>
  );
}

// A popup listing everyone who follows the visitor, or who they follow, with
// a search by name or username.
export default function FollowListDialog({
  username,
  list,
  onClose,
}: {
  username: string;
  list: FollowList;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<ListedFollow[] | "error" | null>(null);
  const [input, setInput] = useState("");
  const search = input.trim();

  useEffect(() => {
    fetchFollowList(username, list)
      .then(setPeople)
      .catch(() => setPeople("error"));
  }, [username, list]);

  // The whole list is loaded at once, so searching it doesn't wait on the
  // server.
  const lowered = search.toLowerCase();
  const shown = Array.isArray(people)
    ? people.filter(
        (person) =>
          !lowered ||
          person.username.toLowerCase().includes(lowered) ||
          displayName(person).toLowerCase().includes(lowered),
      )
    : [];

  return (
    <Dialog title={TITLES[list]} onClose={onClose}>
      <label>
        <span className="sr-only">Search {TITLES[list].toLowerCase()}</span>
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search by name or username"
          className={FIELD_CLASS}
        />
      </label>

      {people === null ? (
        <div className="flex flex-col gap-2">
          <Placeholder className="h-16" />
          <Placeholder className="h-16" />
        </div>
      ) : people === "error" ? (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          Couldn&apos;t load your {list === "followers" ? "followers" : "follows"}. Try again.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500" aria-live="polite">
            {people.length === 0
              ? list === "followers"
                ? "Nobody follows you yet."
                : "You aren't following anyone yet."
              : shown.length === 0
                ? `Nobody matching “${search}”`
                : search
                  ? `${shown.length} of ${people.length} matching “${search}”`
                  : `${people.length} ${people.length === 1 ? "person" : "people"}`}
          </p>
          {shown.length > 0 && (
            <ul className="-mx-1 flex max-h-[55vh] flex-col gap-2 overflow-y-auto px-1 py-1">
              {shown.map((person) => (
                <FollowCard key={person.userID} person={person} search={search} />
              ))}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="self-end rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
      >
        Close
      </button>
    </Dialog>
  );
}
