"use client"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@real-estate-management/ui/components/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@real-estate-management/ui/components/sidebar"
import { useQuery } from "@tanstack/react-query"
import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { useProcurementPermissions } from "@/hooks/use-access"
import type { NavItem } from "@/lib/navigation"
import { trpc } from "@/utils/trpc"

export function NavMain({ items }: { items: NavItem[] }) {
  const { canApprove } = useProcurementPermissions()
  const { data: inbox } = useQuery(
    trpc.procurement.approvals.inbox.queryOptions(undefined, { enabled: canApprove, refetchInterval: 60_000 }),
  )

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.title}
            defaultOpen={item.isActive}
            className="group/collapsible"
            render={<SidebarMenuItem />}
          >
            <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
              <item.icon />
              <span>{item.title}</span>
              <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.items
                  .filter((subItem) => !subItem.approvals || canApprove)
                  .map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton render={<Link href={subItem.url} />}>
                        <span>{subItem.title}</span>
                        {subItem.approvals && Boolean(inbox?.count) && (
                          <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground tabular-nums">
                            {inbox?.count}
                          </span>
                        )}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
