import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combos",
};

export default function Layout({ children }: LayoutProps<"/climbs/combos">) {
  return children;
}
