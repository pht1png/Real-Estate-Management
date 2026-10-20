import type { Metadata } from "next"

import { RequestsList } from "@/features/procurement/components/requests-list"

export const metadata: Metadata = { title: "Purchase requests" }

export default function Page() {
  return <RequestsList />
}
