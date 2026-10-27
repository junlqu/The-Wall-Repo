import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule",
};

export default function Layout({ children }: LayoutProps<"/schedule">) {
  return children;
}
