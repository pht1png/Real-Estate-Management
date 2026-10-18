"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import * as z from "zod"

import { Button } from "@real-estate-management/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@real-estate-management/ui/components/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import { RadioGroup, RadioGroupItem } from "@real-estate-management/ui/components/radio-group"
import { Label } from "@real-estate-management/ui/components/label"
import { authClient } from "@/lib/auth-client"

const formSchema = z.object({
  name: z.string(),
  slug: z.string(),
  logo: z.url("Logo must be a valid URL.").or(z.literal("")),
  metadata: z.string(),
  keepCurrentActiveOrganisation: z.boolean(),
})

export function CreateOrganisationCard() {
  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
      logo: "",
      metadata: "",
      keepCurrentActiveOrganisation: false,
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      // toast("You submitted the following values:", {
      //   description: (
      //     <pre className="mt-2 w-[320px] overflow-x-auto rounded-md bg-code p-4 text-code-foreground">
      //       <code>{JSON.stringify(value, null, 2)}</code>
      //     </pre>
      //   ),
      //   position: "bottom-right",
      //   classNames: {
      //     content: "flex flex-col gap-2",
      //   },
      //   style: {
      //     "--border-radius": "calc(var(--radius)  + 4px)",
      //   } as React.CSSProperties,
      // })
      const { data, error } = await authClient.organization.create({
        name: value.name, // required, The organization name.
        slug: value.slug, // required, The organization slug.
        logo: value.logo || undefined,
        metadata: value.metadata ? JSON.parse(value.metadata) : undefined,
        keepCurrentActiveOrganization: value.keepCurrentActiveOrganisation, // Whether to keep the current active organization active after creating a new one.
      })

      if (error) {
        toast.error(error.message ?? "Could not create the organisation.")
        return
      }

      toast.success(`Organisation "${data.name}" created.`)
      form.reset()
    },
  })

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <CardTitle>Create Organisation</CardTitle>
        <CardDescription>Create a new organisation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="create-organisation-form"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Organisation Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Enter organisation name"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            />
            <form.Field
              name="slug"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Organisation Slug</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Enter organisation slug"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            />
            <form.Field
              name="logo"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Organisation Logo</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Enter organisation logo"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            />
            <form.Field
              name="metadata"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Organisation Metadata</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Enter organisation metadata"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            />
            <form.Field
              name="keepCurrentActiveOrganisation"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Keep Current Active Organisation?</FieldLabel>
                    <RadioGroup
                      name={field.name}
                      value={field.state.value ? "true" : "false"}
                      onValueChange={(value) => field.handleChange(value === "true")}
                      aria-invalid={isInvalid}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="true" id={`${field.name}-true`} />
                        <Label htmlFor={`${field.name}-true`}>Yes</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="false" id={`${field.name}-false`} />
                        <Label htmlFor={`${field.name}-false`}>No</Label>
                      </div>
                    </RadioGroup>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field orientation="horizontal">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" form="create-organisation-form">
            Submit
          </Button>
        </Field>
      </CardFooter>
    </Card>
  )
}
