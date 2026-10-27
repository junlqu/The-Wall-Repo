import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Twister",
};

export default function Layout({ children }: LayoutProps<"/extras/twister">) {
  return children;
}
