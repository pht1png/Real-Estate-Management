"use client"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@real-estate-management/ui/components/sidebar"
import { Building2Icon } from "lucide-react"
import type { User } from "@/lib/auth-client"
import { getNavForRole } from "@/lib/navigation"

// This is sample data.
const data = {
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: <Building2Icon />,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: <Building2Icon />,
    },
    {
      name: "Travel",
      url: "#",
      icon: <Building2Icon />,
    },
  ],
}

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: User
  memberRole: string | null
}

export function AppSidebar({ user, memberRole, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <OrganizationSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={getNavForRole(memberRole)} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
