import type { Metadata } from "next";

import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "My Account · Purple Club",
  description:
    "Your Purple Club account — your rank in The Purple Court, your membership pass, and every club surface in one place.",
};

export default function AccountPage() {
  return <AccountClient />;
}
