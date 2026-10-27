"use client";

import { type SubmitEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { preloadAvatar } from "@/lib/avatar";
import { useReturnTo, withReturnTo } from "@/lib/returnTo";
import { setSessionUser, useSessionUser } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const user = useSessionUser();
  const returnTo = useReturnTo();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Logging in sets the user, which triggers the redirect below.
      await preloadAvatar(body.user);
      setSessionUser(body.user);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Already logged in - head back to the page that sent them here, if any.
  useEffect(() => {
    if (user) router.replace(returnTo ?? "/");
  }, [user, returnTo, router]);

  // Hold off on the form until we know the visitor isn't logged in.
  if (user !== null) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-primary">Log in</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="identifier" className="text-sm font-medium text-neutral-700">
              Email, username, or phone
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-600">
          Don&apos;t have an account?{" "}
          <Link href={withReturnTo("/signup", returnTo)} className="font-semibold text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
