import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function Layout({ children }: LayoutProps<"/signup">) {
  return children;
}
