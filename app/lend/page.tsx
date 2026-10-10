import { redirect } from "next/navigation";

/** Lending is not offered. Old links return to the wall. */
export default function LendPage() {
  redirect("/");
}
