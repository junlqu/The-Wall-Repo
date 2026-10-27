import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Updates",
};

export default function Layout({ children }: LayoutProps<"/updates">) {
  return children;
}
