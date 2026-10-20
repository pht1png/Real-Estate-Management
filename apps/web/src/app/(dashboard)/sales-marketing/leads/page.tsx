import type { Metadata } from "next"

import { LeadsList } from "@/features/sales/components/leads-list"

export const metadata: Metadata = { title: "Leads" }

export default function Page() {
  return <LeadsList />
}
