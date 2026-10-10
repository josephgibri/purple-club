import { redirect } from "next/navigation";

/** Old directory URL. Printed QR codes and bookmarks still land on Places. */
export default function DirectoryRedirect() {
  redirect("/places");
}
