import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archives",
};

export default function Layout({ children }: LayoutProps<"/climbs/archives">) {
  return children;
}
