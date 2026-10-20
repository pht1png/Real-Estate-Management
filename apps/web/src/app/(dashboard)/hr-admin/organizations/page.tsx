"use client"

import { authClient } from "@/lib/auth-client"
import React from "react"

const Page = () => {
  const { data: organizations, isPending } = authClient.useListOrganizations()

  if (isPending) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Organizations</h1>
      <ul>
        {organizations?.map((org) => (
          <li key={org.id}>
            <h2>{org.name}</h2>
            <p>ID: {org.id}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Page
