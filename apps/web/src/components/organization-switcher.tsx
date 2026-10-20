"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@real-estate-management/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@real-estate-management/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@real-estate-management/ui/components/sidebar"
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { type Organization, authClient } from "@/lib/auth-client"
import Link from "next/link"

function OrganizationAvatar({ organization }: { organization: Organization }) {
  return (
    <Avatar className="size-6 rounded-md">
      <AvatarImage src={organization.logo ?? undefined} alt={organization.name} />
      <AvatarFallback className="rounded-md text-xs">{organization.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar()
  const { data: organizations } = authClient.useListOrganizations()
  const { data: activeOrganization, isPending } = authClient.useActiveOrganization()

  async function handleOrganizationChange(organizationId: string) {
    if (organizationId === activeOrganization?.id) return

    const { error } = await authClient.organization.setActive({ organizationId })
    if (error) {
      toast.error(error.message ?? "Couldn't switch organization")
      return
    }
  }

  if (isPending || !organizations) return <SidebarMenuSkeleton showIcon />

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            {activeOrganization ? (
              <>
                <OrganizationAvatar organization={activeOrganization} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{activeOrganization.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{activeOrganization.slug}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <Building2Icon className="size-4" />
                </div>
                <span className="flex-1 truncate text-left text-sm">Select organization</span>
              </>
            )}
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
              {organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.id}
                  onClick={() => handleOrganizationChange(organization.id)}
                  className="gap-2 p-2"
                >
                  <OrganizationAvatar organization={organization} />
                  <span className="truncate">{organization.name}</span>
                  {organization.id === activeOrganization?.id && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 p-2">
                <Link
                  href="/dashboard"
                  className="flex size-6 items-center justify-center rounded-md border bg-transparent"
                >
                  <PlusIcon className="size-4" />
                </Link>
                <div className="font-medium text-muted-foreground">Create organization</div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
