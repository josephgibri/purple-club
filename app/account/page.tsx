import type { Metadata } from "next";

import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "My Account · Purple Club",
  description: "Your key and your pass.",
};

export default function AccountPage() {
  return <AccountClient />;
}
