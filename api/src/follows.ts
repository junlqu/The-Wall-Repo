import type { Item } from "@azure/cosmos";
import { getContainer } from "./cosmosClient";
import { Follow, followingIDs, User, USER_CONTAINER } from "./models/User";

// Following climbs and people. A climb keeps who follows it (Route.follows);
// a person keeps who they follow and since when (User.following), and who
// follows them is looked up. Two people who follow each other are friends.

function isPreconditionFailed(error: unknown) {
  return (error as { code?: number }).code === 412;
}

// Changes the list at `field` on the document to what `change` makes of it,
// unless it returns null for nothing to change. Only saves if the document
// hasn't changed since it was read, and tries again if it has, so two at once
// can't undo each other. Undefined when there's no such document.
async function changeList<T extends object, E>(
  item: Item,
  field: string,
  change: (list: E[]) => E[] | null,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { resource } = await item.read<T & Record<string, unknown>>();
    if (!resource) return undefined;
    const value = change((resource[field] as E[] | undefined) ?? []);
    if (value === null) return resource;

    try {
      const { resource: updated } = await item.patch<T>([{ op: "set", path: `/${field}`, value }], {
        accessCondition: { type: "IfMatch", condition: resource._etag as string },
      });
      return updated;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }
  }
  throw new Error(`Couldn't change ${field} on ${item.id}`);
}

// Adds the user to (or takes them off) the climb's followers, unless they're
// already that way. Undefined when there's no such climb.
export function setFollowsRoute<T extends object>(item: Item, userID: string, follow: boolean) {
  return changeList<T, string>(item, "follows", (list) => {
    if (list.includes(userID) === follow) return null;
    return follow ? [...list, userID] : list.filter((id) => id !== userID);
  });
}

// Adds `userID` to (or takes them off) who the account follows, unless
// they're already that way - a new follow is dated now, and following someone
// again starts afresh. Undefined when there's no such account.
export function setFollowsUser<T extends object>(item: Item, userID: string, follow: boolean) {
  return changeList<T, Follow>(item, "following", (list) => {
    if (list.some((entry) => entry.userID === userID) === follow) return null;
    return follow
      ? [...list, { userID, followedAt: new Date().toISOString() }]
      : list.filter((entry) => entry.userID !== userID);
  });
}

// Who they follow whose accounts are still there, and of those, which follow
// them back - their friends.
export async function readFollowing(user: Pick<User, "userID" | "following">) {
  const ids = followingIDs(user);
  if (ids.length === 0) return { following: [] as string[], friends: new Set<string>() };

  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<{ userID: string; followsBack?: boolean }>({
      query: `SELECT c.userID, ARRAY_CONTAINS(c.following, {"userID": @userID}, true) AS followsBack FROM c
              WHERE ARRAY_CONTAINS(@ids, c.userID) AND NOT IS_DEFINED(c.deletedAt)`,
      parameters: [
        { name: "@ids", value: ids },
        { name: "@userID", value: user.userID },
      ],
    })
    .fetchAll();
  return {
    following: resources.map((person) => person.userID),
    // Missing rather than false for anyone who follows nobody.
    friends: new Set(resources.filter((person) => person.followsBack === true).map((person) => person.userID)),
  };
}

// How many people follow them. Deleted accounts lose who they follow, so
// they aren't counted.
export async function countFollowers(userID: string): Promise<number> {
  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<number>({
      query: `SELECT VALUE COUNT(1) FROM c WHERE ARRAY_CONTAINS(c.following, {"userID": @userID}, true)`,
      parameters: [{ name: "@userID", value: userID }],
    })
    .fetchAll();
  return resources[0] ?? 0;
}

// Someone in a followers or following list, as the owner sees them: no more
// than their profile shows anyone.
export type ListedFollow = {
  userID: string;
  username: string;
  fname: string;
  lastInitial: string;
  avatarUpdatedAt?: string;
};

type FollowRow = Pick<User, "userID" | "username" | "fname" | "lname" | "avatarUpdatedAt"> & { followedAt: string };

function toListed(rows: FollowRow[]): ListedFollow[] {
  return rows
    .sort((a, b) => b.followedAt.localeCompare(a.followedAt))
    .map(({ userID, username, fname, lname, avatarUpdatedAt }) => ({
      userID,
      username,
      fname,
      lastInitial: lname.trim().charAt(0).toUpperCase(),
      avatarUpdatedAt,
    }));
}

// Everyone who follows them, most recently followed first.
export async function listFollowers(userID: string): Promise<ListedFollow[]> {
  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<FollowRow>({
      query: `SELECT c.userID, c.username, c.fname, c.lname, c.avatarUpdatedAt, f.followedAt
              FROM c JOIN f IN c.following WHERE f.userID = @userID`,
      parameters: [{ name: "@userID", value: userID }],
    })
    .fetchAll();
  return toListed(resources);
}

// Everyone they follow whose account is still there, most recently followed
// first.
export async function listFollowing(user: Pick<User, "following">): Promise<ListedFollow[]> {
  const ids = followingIDs(user);
  if (ids.length === 0) return [];

  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<Omit<FollowRow, "followedAt">>({
      query: `SELECT c.userID, c.username, c.fname, c.lname, c.avatarUpdatedAt FROM c
              WHERE ARRAY_CONTAINS(@ids, c.userID) AND NOT IS_DEFINED(c.deletedAt)`,
      parameters: [{ name: "@ids", value: ids }],
    })
    .fetchAll();
  const since = new Map((user.following ?? []).map((follow) => [follow.userID, follow.followedAt]));
  return toListed(resources.map((person) => ({ ...person, followedAt: since.get(person.userID) ?? "" })));
}
