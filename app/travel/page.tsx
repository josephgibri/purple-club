import { redirect } from "next/navigation";

// The hotels experience now lives at /stay (Purple Club). Keep this stale
// Purple Club path working for any old links / bookmarks.
export default function TravelRedirect() {
  redirect("/stay");
}
