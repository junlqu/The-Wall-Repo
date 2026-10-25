import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminSectionView from "@/components/AdminSectionView";
import { ADMIN_SECTIONS, getAdminSection } from "@/lib/adminSections";

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

  return <AdminSectionView section={section} subpage={subpage} />;
}
