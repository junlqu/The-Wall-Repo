import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo Roulette",
};

export default function Layout({ children }: LayoutProps<"/extras/comboroulette">) {
  return children;
}
