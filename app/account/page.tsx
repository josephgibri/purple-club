import type { Metadata } from "next";

import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "My Account · Purple Club",
  description:
    "Your key, your quests, your titles. Cosmetic only.",
};

export default function AccountPage() {
  return <AccountClient />;
}
