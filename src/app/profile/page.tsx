import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The "פרופיל" tab's real job: EDIT the search you live in — a single-user
 * app almost always has exactly one profile, so land on its edit page.
 * The blank creation form appears only when no profile exists yet. */
export default async function ProfileEntry() {
  const profile =
    (await prisma.profile.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.profile.findFirst({ orderBy: { createdAt: "desc" } }));
  redirect(profile ? `/profiles/${profile.id}` : "/profiles/new");
}
