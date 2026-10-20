import type { Metadata } from "next"

import { ReceiptsList } from "@/features/procurement/components/receipts-list"

export const metadata: Metadata = { title: "Goods receipts" }

export default function Page() {
  return <ReceiptsList />
}
