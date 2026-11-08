import { User } from "./models/User";

// The rules for what someone can put on their account, shared by sign-up and
// the profile page. Keep in sync with website/src/lib/account.ts.
const MAX_NAME_LENGTH = 128;
// Mirrors the cap GET /profiles/{username} looks up to.
export const MAX_USERNAME_LENGTH = 128;
const MAX_EMAIL_LENGTH = 512;
// Digits only, up to 15 - the longest number E.164 allows.
const PHONE_PATTERN = /^\d{1,15}$/;
// Something before the @, and a "." with text either side somewhere after it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULES = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/];

export const PASSWORD_RULES_MESSAGE =
  "Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.";

export type AccountDetails = Pick<User, "fname" | "lname" | "email" | "phone">;

export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && PASSWORD_RULES.every((rule) => rule.test(password));
}

// Checks and tidies someone's name, email and phone. Email and phone are
// optional - blank leaves them off. Returns the message to show when any of
// them won't do.
export function readAccountDetails(value: unknown): AccountDetails | { error: string } {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === "string" ? field.trim() : "");
  const fname = text(body.fname);
  const lname = text(body.lname);
  const email = text(body.email).toLowerCase() || undefined;
  const phone = text(body.phone) || undefined;

  if (!fname || !lname) return { error: "First and last name are required." };
  if (fname.length > MAX_NAME_LENGTH || lname.length > MAX_NAME_LENGTH) {
    return { error: `Names must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return { error: "Enter a valid email address." };
  }
  if (phone && !PHONE_PATTERN.test(phone)) return { error: "Phone number can only contain digits." };
  return { fname, lname, email, phone };
}
