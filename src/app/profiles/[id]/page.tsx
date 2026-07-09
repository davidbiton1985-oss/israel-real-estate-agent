import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "עריכת פרופיל" };

export default async function EditProfilePage({ params }: { params: { id: string } }) {
  const profile = await prisma.profile.findUnique({ where: { id: params.id } });
  if (!profile) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-bold">עריכת פרופיל: {profile.name}</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
