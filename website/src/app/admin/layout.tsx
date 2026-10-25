import type { Metadata } from "next";
import AdminGuard from "@/components/AdminGuard";

// A plain-string title here would stop the root layout's template from
// reaching the section/subpage pages below, so it's repeated.
export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | The Wall Archives",
  },
};

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <AdminGuard>{children}</AdminGuard>;
}
