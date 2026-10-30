import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Climbs",
};

export default function Layout({ children }: LayoutProps<"/climbs">) {
  return children;
}
