import type { Metadata } from "next"

import { ContractsList } from "@/features/sales/components/contracts-list"

export const metadata: Metadata = { title: "Contracts" }

export default function Page() {
  return <ContractsList />
}
