import Link from "next/link";

// Shown in place of a page the visitor isn't allowed to see yet.
export default function AccessNotice({
  title,
  message,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <Link
          href={actionHref}
          className="mt-6 inline-block rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
