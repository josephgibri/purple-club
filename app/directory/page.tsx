import { redirect } from "next/navigation";

/**
 * `/directory` was renamed to `/perks` ("Perks & Benefits") during the
 * ecosystem consolidation. Keep this permanent redirect so old links,
 * bookmarks, and printed QR codes still land in the right place.
 */
export default function DirectoryRedirect() {
  redirect("/perks");
}
