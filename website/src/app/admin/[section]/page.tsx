import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import AdminAttendance from "@/components/AdminAttendance";
import AdminClimbs from "@/components/AdminClimbs";
import AdminSectionView from "@/components/AdminSectionView";
import { ADMIN_SECTIONS, getAdminSection } from "@/lib/adminSections";

// Static export - every section is known up front, anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ADMIN_SECTIONS.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params }: PageProps<"/admin/[section]">): Promise<Metadata> {
  const section = getAdminSection((await params).section);
  return { title: section?.title };
}

export default async function AdminSectionPage({ params }: PageProps<"/admin/[section]">) {
  const section = getAdminSection((await params).section);
  if (!section) notFound();

  // Sections with a page of their own; the rest list their subpages.
  const body =
    section.slug === "announcements" ? (
      <AdminAnnouncements section={section} />
    ) : section.slug === "climbs" ? (
      <AdminClimbs section={section} />
    ) : section.slug === "attendance" ? (
      <AdminAttendance section={section} />
    ) : undefined;
  return <AdminSectionView section={section}>{body}</AdminSectionView>;
}
