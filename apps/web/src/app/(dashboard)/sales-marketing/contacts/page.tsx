import type { Metadata } from "next"

import { ContactsList } from "@/features/sales/components/contacts-list"

export const metadata: Metadata = { title: "Contacts" }

export default function Page() {
  return <ContactsList />
}
