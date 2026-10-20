import type { Metadata } from "next"

import { PageHeader } from "@/components/list/list-layout"
import { UnitTypesSection } from "@/features/projects/components/unit-types-section"

export const metadata: Metadata = { title: "Unit types" }

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Unit types" description="House models and floor plans, with their base price." />
      <UnitTypesSection />
    </div>
  )
}
