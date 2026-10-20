import type { Metadata } from "next"

import { ReservationsList } from "@/features/sales/components/reservations-list"

export const metadata: Metadata = { title: "Reservations" }

export default function Page() {
  return <ReservationsList />
}
