"use client";

import { type SubmitEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { preloadAvatar } from "@/lib/avatar";
import { setSessionUser, useSessionUser } from "@/lib/session";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary";
const LABEL_CLASS = "text-sm font-medium text-neutral-700";

// The input's `required` attribute is what tells assistive tech the field is
// mandatory, so the asterisk itself is purely visual.
function RequiredMark() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const user = useSessionUser();
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fname,
          lname,
          username,
          email: email || undefined,
          phone: phone || undefined,
          password,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Signing up sets the user, which triggers the redirect below.
      await preloadAvatar(body.user);
      setSessionUser(body.user);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Already logged in - nothing to do here.
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  // Hold off on the form until we know the visitor isn't logged in.
  if (user !== null) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-primary">Sign up</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fname" className={LABEL_CLASS}>
                First name
                <RequiredMark />
              </label>
              <input
                id="fname"
                type="text"
                autoComplete="given-name"
                required
                value={fname}
                onChange={(e) => setFname(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="lname" className={LABEL_CLASS}>
                Last name
                <RequiredMark />
              </label>
              <input
                id="lname"
                type="text"
                autoComplete="family-name"
                required
                value={lname}
                onChange={(e) => setLname(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="username" className={LABEL_CLASS}>
              Username
              <RequiredMark />
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className={LABEL_CLASS}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className={LABEL_CLASS}>
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className={LABEL_CLASS}>
              Password
              <RequiredMark />
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className={LABEL_CLASS}>
              Confirm password
              <RequiredMark />
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
