import type { Metadata } from "next"

import { OrdersList } from "@/features/procurement/components/orders-list"

export const metadata: Metadata = { title: "Purchase orders" }

export default function Page() {
  return <OrdersList />
}
