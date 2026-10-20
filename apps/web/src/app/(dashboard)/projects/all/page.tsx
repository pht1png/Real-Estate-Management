import type { Metadata } from "next"

import { ProjectsList } from "@/features/projects/components/projects-list"

export const metadata: Metadata = { title: "Projects" }

export default function Page() {
  return <ProjectsList />
}
