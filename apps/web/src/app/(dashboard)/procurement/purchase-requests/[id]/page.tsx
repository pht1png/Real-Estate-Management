import type { Metadata } from "next"

import { RequestDetail } from "@/features/procurement/components/request-detail"

export const metadata: Metadata = { title: "Purchase request" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestDetail id={id} />
}
