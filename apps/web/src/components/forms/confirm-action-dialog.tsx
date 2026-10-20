"use client"

import { Button } from "@real-estate-management/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@real-estate-management/ui/components/dialog"
import { Field, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import { Textarea } from "@real-estate-management/ui/components/textarea"
import { useState } from "react"

export type ConfirmInput = { kind: "reason" | "date"; label: string; defaultValue?: string; optional?: boolean }

/**
 * Confirmation for cancel / void / delete / transfer. With `input`, asks for a required reason or date
 * and passes it to `onConfirm`.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  input,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  input?: ConfirmInput
  pending?: boolean
  onConfirm: (value: string) => void
}) {
  const [value, setValue] = useState(input?.defaultValue ?? "")
  const missing = Boolean(input) && !input?.optional && !value.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(input?.defaultValue ?? "")
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {input && (
          <Field>
            <FieldLabel htmlFor="confirm-input">{input.label}</FieldLabel>
            {input.kind === "reason" ? (
              <Textarea id="confirm-input" value={value} onChange={(e) => setValue(e.target.value)} rows={3} />
            ) : (
              <Input id="confirm-input" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={missing || pending}
            onClick={() => onConfirm(value.trim())}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
