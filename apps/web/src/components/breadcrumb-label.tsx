"use client"

import { usePathname } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"

type Labels = Record<string, string>

const BreadcrumbLabelContext = createContext<{ labels: Labels; setLabel: (path: string, label: string) => void }>({
  labels: {},
  setLabel: () => {},
})

/** Lets pages give the current URL's breadcrumb a friendlier name (e.g. a project's name instead of its id). */
export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Labels>({})
  const setLabel = (path: string, label: string) =>
    setLabels((prev) => (prev[path] === label ? prev : { ...prev, [path]: label }))
  return <BreadcrumbLabelContext.Provider value={{ labels, setLabel }}>{children}</BreadcrumbLabelContext.Provider>
}

export const useBreadcrumbLabels = () => useContext(BreadcrumbLabelContext).labels

/** Names the current page in the breadcrumbs once `label` is known. */
export function useBreadcrumbLabel(label: string | undefined) {
  const pathname = usePathname()
  const { setLabel } = useContext(BreadcrumbLabelContext)
  useEffect(() => {
    if (label) setLabel(pathname, label)
  }, [label, pathname, setLabel])
}
