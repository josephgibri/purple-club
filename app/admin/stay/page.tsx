import { redirect } from "next/navigation";

/** Legacy PurpleStay admin path — concierge desk lives at /admin/travel. */
export default function LegacyAdminStayRedirect() {
  redirect("/admin/travel");
}
