import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Boulders",
};

export default function Layout({ children }: LayoutProps<"/climbs/boulders">) {
  return children;
}
