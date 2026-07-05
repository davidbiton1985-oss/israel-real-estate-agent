import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function EditProfilePage({ params }: { params: { id: string } }) {
  const profile = await prisma.profile.findUnique({ where: { id: params.id } });
  if (!profile) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit Profile: {profile.name}</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
