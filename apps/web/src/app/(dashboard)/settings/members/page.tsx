import { headers } from "next/headers"

import { authClient } from "@/lib/auth-client"

const Page = async () => {
  const { data, error } = await authClient.organization.listMembers({
    query: {
      organizationId: undefined, // An optional organization ID to list members for. If not provided, will default to the user's active organization.
    },
    fetchOptions: {
      headers: await headers(),
    },
  })

  if (error) {
    return (
      <div>
        Error: {error.message}, Code: {error.code}
      </div>
    )
  }

  return (
    <div>
      <h1>Members</h1>
      <ul>
        {data.members?.map((member) => (
          <li key={member.id} className="border rounded p-2 mb-2">
            <h2>{member.user.name}</h2>
            <p>ID: {member.user.id}</p>
            <p>Email: {member.user.email}</p>
            <p>Role: {member.role}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Page
