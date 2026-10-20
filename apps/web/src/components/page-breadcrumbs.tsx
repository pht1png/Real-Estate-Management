"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@real-estate-management/ui/components/breadcrumb"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment } from "react"

import { useBreadcrumbLabels } from "@/components/breadcrumb-label"
import { getBreadcrumbs } from "@/lib/navigation"

/** Breadcrumbs for the current URL. Every crumb but the last links back to that level. */
export function PageBreadcrumbs() {
  const labels = useBreadcrumbLabels()
  // Pages can rename their crumb (a project id becomes the project name)
  const crumbs = getBreadcrumbs(usePathname()).map((crumb) => ({ ...crumb, label: labels[crumb.href] ?? crumb.label }))
  if (!crumbs.length) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <Fragment key={`${crumb.href}-${crumb.label}`}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              {/* On small screens only the current page is shown */}
              <BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={{ pathname: crumb.href }} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
