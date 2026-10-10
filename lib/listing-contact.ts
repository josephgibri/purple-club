import { db } from "@/lib/db";

/** Contact address for a listing: the email account, or the wallet member. */
export async function listingContactEmail(listingId: string): Promise<string | null> {
  const listing = await db.merchantListing.findUnique({
    where: { id: listingId },
    select: {
      profile: { select: { user: { select: { email: true } } } },
      owner: { select: { email: true } },
    },
  });
  const email = listing?.profile?.user.email ?? listing?.owner?.email ?? null;
  return email && email.trim() ? email : null;
}
