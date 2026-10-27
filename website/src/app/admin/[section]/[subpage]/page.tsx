import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import AdminAddAnnouncement from "@/components/AdminAddAnnouncement";
import AdminAddClimb from "@/components/AdminAddClimb";
import { AdminActiveAnnouncements, AdminArchivedAnnouncements } from "@/components/AdminAnnouncements";
import { AdminAttendanceWeeks } from "@/components/AdminAttendance";
import AdminAttendanceForm from "@/components/AdminAttendanceForm";
import AdminClimbExport from "@/components/AdminClimbExport";
import AdminClimbImport from "@/components/AdminClimbImport";
import { AdminActiveClimbs, AdminPastClimbs } from "@/components/AdminClimbs";
import AdminSectionView from "@/components/AdminSectionView";
import { ADMIN_SECTIONS, getAdminSection } from "@/lib/adminSections";

// Subpages whose tool is built, by "section/subpage". The rest show
// AdminSectionView's empty panel.
const TOOLS: Record<string, ComponentType> = {
  "announcements/new": AdminAddAnnouncement,
  "announcements/active": AdminActiveAnnouncements,
  "announcements/archived": AdminArchivedAnnouncements,
  "climbs/new": AdminAddClimb,
  "climbs/active": AdminActiveClimbs,
  "climbs/archived": AdminPastClimbs,
  "climbs/import": AdminClimbImport,
  "climbs/export": AdminClimbExport,
  "attendance/all": AdminAttendanceWeeks,
  "attendance/new": AdminAttendanceForm,
};

// Static export - every subpage is known up front, anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ADMIN_SECTIONS.flatMap((section) =>
    section.subpages.map((subpage) => ({ section: section.slug, subpage: subpage.slug })),
  );
}

async function resolve(params: PageProps<"/admin/[section]/[subpage]">["params"]) {
  const { section: sectionSlug, subpage: subpageSlug } = await params;
  const section = getAdminSection(sectionSlug);
  const subpage = section?.subpages.find((item) => item.slug === subpageSlug);
  return { section, subpage };
}

export async function generateMetadata({ params }: PageProps<"/admin/[section]/[subpage]">): Promise<Metadata> {
  const { subpage } = await resolve(params);
  return { title: subpage?.label };
}

export default async function AdminSubpagePage({ params }: PageProps<"/admin/[section]/[subpage]">) {
  const { section, subpage } = await resolve(params);
  if (!section || !subpage) notFound();

  const Tool = TOOLS[`${section.slug}/${subpage.slug}`];
  return (
    <AdminSectionView section={section} subpage={subpage}>
      {Tool ? <Tool /> : undefined}
    </AdminSectionView>
  );
}
