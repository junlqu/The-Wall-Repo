import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

// Rendered for any unmatched URL and wherever a page calls notFound().
export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl font-bold text-secondary">404</p>
        <h1 className="mt-3 text-2xl font-bold text-primary">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
