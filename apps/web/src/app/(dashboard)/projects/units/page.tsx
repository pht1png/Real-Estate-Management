import type { Metadata } from "next"

import { PageHeader } from "@/components/list/list-layout"
import { UnitsSection } from "@/features/projects/components/units-section"

export const metadata: Metadata = { title: "Units" }

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Units" description="Every unit across all projects. Sales sets reserved and sold units." />
      <UnitsSection />
    </div>
  )
}
