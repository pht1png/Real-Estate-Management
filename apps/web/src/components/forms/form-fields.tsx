"use client"

import { Checkbox } from "@real-estate-management/ui/components/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@real-estate-management/ui/components/select"
import { Textarea } from "@real-estate-management/ui/components/textarea"
import type { AnyFieldApi } from "@tanstack/react-form"

// Thin wrappers around TanStack Form fields, following components/create-organisation.tsx.
// Usage: <form.Field name="phone">{(field) => <TextField field={field} label="Phone" />}</form.Field>

type BaseProps = { field: AnyFieldApi; label: string; description?: string; disabled?: boolean }

function FieldShell({ field, label, description, children }: BaseProps & { children: React.ReactNode }) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}

export function TextField({
  type = "text",
  placeholder,
  ...props
}: BaseProps & { type?: "text" | "email" | "tel" | "date" | "number"; placeholder?: string }) {
  const { field, disabled } = props
  return (
    <FieldShell {...props}>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        step={type === "number" ? "any" : undefined}
      />
    </FieldShell>
  )
}

/** Baht amount, kept as a string in the form and converted with Number() on submit. */
export function MoneyField(props: BaseProps & { placeholder?: string }) {
  return <TextField {...props} type="number" placeholder={props.placeholder ?? "0"} />
}

export function DateField(props: BaseProps) {
  return <TextField {...props} type="date" />
}

export function TextareaField(props: BaseProps & { placeholder?: string }) {
  const { field, disabled, placeholder } = props
  return (
    <FieldShell {...props}>
      <Textarea
        id={field.name}
        name={field.name}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
      />
    </FieldShell>
  )
}

const NONE = "__none"

export type Option = { value: string; label: string }

/** Select bound to a string field. With `emptyLabel`, the user can pick "nothing" (stored as ""). */
export function SelectField({
  options,
  emptyLabel,
  placeholder = "Select…",
  ...props
}: BaseProps & { options: Option[]; emptyLabel?: string; placeholder?: string }) {
  const { field, disabled } = props
  const items = [...(emptyLabel ? [{ value: NONE, label: emptyLabel }] : []), ...options]
  const value: string = field.state.value || (emptyLabel ? NONE : "")
  return (
    <FieldShell {...props}>
      <Select
        items={items}
        value={value || null}
        onValueChange={(next) => {
          field.handleChange(next === NONE || next === null ? "" : String(next))
          field.handleBlur()
        }}
        disabled={disabled}
      >
        <SelectTrigger id={field.name} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

export function CheckboxField({ field, label, description }: BaseProps) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={field.name}
        checked={Boolean(field.state.value)}
        onCheckedChange={(checked) => field.handleChange(checked === true)}
      />
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
    </Field>
  )
}

/** Two fields side by side on wider screens. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
