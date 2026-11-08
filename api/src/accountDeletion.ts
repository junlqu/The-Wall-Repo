import { randomBytes } from "node:crypto";
import type { Resource } from "@azure/cosmos";
import { hashPassword } from "./authUtils";
import { getStarterAvatar } from "./avatarUtils";
import { getContainer } from "./cosmosClient";
import { Avatar, AVATAR_CONTAINER } from "./models/Avatar";
import { User, USER_CONTAINER } from "./models/User";

// Empties an account, for DELETE /account and an admin's DELETE
// /users/{userID}. It isn't removed: everything that says who they were is
// wiped, so their comments and sends stay put without naming them. Their
// username and name become pieces of their userID, email and phone go, their
// password is swapped for one nobody knows and their picture goes back to
// their starter. Their settings, bans and timeouts stay, for recovering the
// account by hand. deletedAt then stops anyone logging in as them or opening
// their profile, and ends any session they have. `deletedBy` is the userID of
// the admin who deleted it, when it wasn't them.
//
// `user` is the account as just read; it's only saved if nothing changed it
// since - otherwise this throws the database's 412. Returns it as saved.
export async function eraseAccount(user: User & Resource, deletedBy?: string): Promise<User> {
  // Their picture goes first: if the rest then fails it can be tried again,
  // whereas a deleted account can't log back in to finish the job.
  const now = new Date().toISOString();
  const avatar: Avatar = { id: user.userID, userID: user.userID, avatar: getStarterAvatar(user.userID), updatedAt: now };
  await getContainer(AVATAR_CONTAINER).items.upsert(avatar);

  // 32 hex digits once the dashes are out.
  const digits = user.userID.replace(/-/g, "");
  const deleted: User = {
    ...user,
    username: digits.slice(0, 16),
    fname: digits.slice(16, 20),
    lname: digits.slice(20, 24),
    // Left off the document, as a blank email or phone always is.
    email: undefined,
    phone: undefined,
    // So they stop counting as anyone's follower.
    following: undefined,
    passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    avatarUpdatedAt: now,
    deletedAt: now,
    ...(deletedBy ? { deletedBy } : {}),
  };
  const { resource } = await getContainer(USER_CONTAINER)
    .item(user.userID, user.userID)
    .replace<User>(deleted, { accessCondition: { type: "IfMatch", condition: user._etag } });
  return resource ?? deleted;
}
