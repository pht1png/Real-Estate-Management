import type { Metadata } from "next"

import { SuppliersList } from "@/features/procurement/components/suppliers-list"

export const metadata: Metadata = { title: "Suppliers" }

export default function Page() {
  return <SuppliersList />
}
