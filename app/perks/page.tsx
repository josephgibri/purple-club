import { redirect } from "next/navigation";

/** Perks & Benefits is Places. Keep the old path for printed links. */
export default function PerksRedirect() {
  redirect("/places");
}
