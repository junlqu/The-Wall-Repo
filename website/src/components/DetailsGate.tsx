"use client";

import type { ReactNode } from "react";
import { useDetails } from "@/lib/details";

// Holds the admin pages back until prices, hours and closures have loaded, so
// attendance is never counted at the wrong prices or suggested with the wrong
// hours. If they can't load, the pages go ahead on the built-in defaults.
export default function DetailsGate({ children }: { children: ReactNode }) {
  const details = useDetails();
  if (details === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }
  return (
    <>
      {details === null && (
        <p role="alert" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Couldn&apos;t load the saved prices, hours and closures - the built-in ones are in use until you refresh.
        </p>
      )}
      {children}
    </>
  );
}
