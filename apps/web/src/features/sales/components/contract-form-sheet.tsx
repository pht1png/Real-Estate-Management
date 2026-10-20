"use client"

import { addMonths, buildInstallmentSchedule } from "@real-estate-management/api/lib/installments"
import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { Table, TableBody, TableCell, TableRow } from "@real-estate-management/ui/components/table"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as z from "zod"

import {
  CheckboxField,
  DateField,
  FieldRow,
  MoneyField,
  TextareaField,
  TextField,
} from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { formatDate, formatMoney, labelize } from "@/lib/format"
import { mutationCallbacks, today } from "@/lib/mutation"
import type {
  ContractRow,
  CreateContractInput,
  InstallmentRow,
  ReservationRow,
  UpdateContractInput,
} from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  contractDate: z.iso.date("Pick a date"),
  discountAmount: z.string(),
  downPaymentAmount: z.string(),
  contractPaymentAmount: z.string(),
  downPaymentMonths: z.string().regex(/^\d+$/, "Whole months only"),
  scheduledTransferDate: z.iso.date("Pick a date"),
  notes: z.string(),
  activate: z.boolean(),
})

type FormValues = z.input<typeof formSchema>

const FORM_ID = "contract-form"

/** Either convert a reservation into a contract, or edit an existing contract. */
export type ContractSheetTarget =
  | { kind: "convert"; reservation: ReservationRow }
  | { kind: "edit"; contract: ContractRow }

function defaultsForConvert(r: ReservationRow): FormValues {
  const listPrice = Number(r.listPrice)
  const down = Math.round((listPrice * 0.1) / 1000) * 1000
  const contractDate = today()
  return {
    contractDate,
    discountAmount: "0",
    downPaymentAmount: String(down),
    contractPaymentAmount: String(Math.min(50_000, down)),
    downPaymentMonths: "12",
    scheduledTransferDate: addMonths(contractDate, 13),
    notes: "",
    activate: true,
  }
}

function defaultsForEdit(c: ContractRow, installments: InstallmentRow[]): FormValues {
  const upfront = installments.find((i) => i.type === "contract_payment")
  return {
    contractDate: c.contractDate,
    discountAmount: String(Number(c.discountAmount)),
    downPaymentAmount: String(Number(c.downPaymentAmount)),
    contractPaymentAmount: String(Number(upfront?.amount ?? 0)),
    downPaymentMonths: String(installments.filter((i) => i.type === "down_payment").length),
    scheduledTransferDate: c.scheduledTransferDate ?? addMonths(c.contractDate, 12),
    notes: c.notes ?? "",
    activate: false,
  }
}

function SchedulePreview({
  values,
  listPrice,
  reservationFee,
}: {
  values: FormValues
  listPrice: number
  reservationFee: number
}) {
  const netPrice = listPrice - Number(values.discountAmount || 0)
  const result = buildInstallmentSchedule({
    netPrice,
    reservationFee,
    downPaymentAmount: Number(values.downPaymentAmount || 0),
    contractPaymentAmount: Number(values.contractPaymentAmount || 0),
    downPaymentMonths: Number(values.downPaymentMonths || 0),
    contractDate: values.contractDate,
    transferDate: values.scheduledTransferDate,
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">List price {formatMoney(listPrice)}</span>
        <span className="font-medium">Net price {formatMoney(netPrice)}</span>
      </div>
      {result.error ? (
        <p className="text-xs text-destructive">{result.error}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto border">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground">–</TableCell>
                <TableCell>Reservation fee (paid)</TableCell>
                <TableCell className="text-muted-foreground">–</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(reservationFee)}</TableCell>
              </TableRow>
              {result.items.map((item) => (
                <TableRow key={item.sequence}>
                  <TableCell className="text-muted-foreground">#{item.sequence}</TableCell>
                  <TableCell>{labelize(item.type)}</TableCell>
                  <TableCell>{formatDate(item.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function ContractFormSheet({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ContractSheetTarget | null
}) {
  const contract = target?.kind === "edit" ? target.contract : null
  // An edit needs the current schedule to fill in the contract payment and number of months
  const { data: installments } = useQuery(
    trpc.sales.contracts.installments.queryOptions({ contractId: contract?.id ?? "" }, { enabled: open && !!contract }),
  )
  const ready = target?.kind === "convert" || (contract && installments)
  const close = () => onOpenChange(false)
  const create = useMutation(
    trpc.sales.contracts.createFromReservation.mutationOptions(mutationCallbacks("Contract created", close)),
  )
  const update = useMutation(trpc.sales.contracts.update.mutationOptions(mutationCallbacks("Contract updated", close)))

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        target?.kind === "convert"
          ? `Contract for ${target.reservation.reservationNumber}`
          : `Edit ${contract?.contractNumber ?? "contract"}`
      }
      description={
        target?.kind === "convert"
          ? `${target.reservation.unitNumber} · ${target.reservation.projectName} · ${target.reservation.contactName}`
          : contract
            ? `${contract.unitNumber} · ${contract.projectName} · ${contract.buyerName}`
            : undefined
      }
      formId={FORM_ID}
      submitLabel={target?.kind === "convert" ? "Create contract" : "Save"}
      pending={create.isPending || update.isPending}
    >
      {target && ready && (
        <ContractForm
          key={target.kind === "convert" ? target.reservation.id : target.contract.id}
          target={target}
          installments={installments ?? []}
          onCreate={create.mutate}
          onUpdate={update.mutate}
        />
      )}
    </FormSheet>
  )
}

function ContractForm({
  target,
  installments,
  onCreate,
  onUpdate,
}: {
  target: ContractSheetTarget
  installments: InstallmentRow[]
  onCreate: (input: CreateContractInput) => void
  onUpdate: (input: UpdateContractInput) => void
}) {
  const isConvert = target.kind === "convert"
  // Once active, only the transfer date and notes can change; the money is fixed
  const locked = target.kind === "edit" && target.contract.status !== "draft"
  const listPrice = Number(isConvert ? target.reservation.listPrice : target.contract.salePrice)
  const reservationFee = Number(isConvert ? target.reservation.reservationFee : (target.contract.reservationFee ?? 0))

  const form = useForm({
    defaultValues: isConvert ? defaultsForConvert(target.reservation) : defaultsForEdit(target.contract, installments),
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = {
        contractDate: value.contractDate,
        discountAmount: Number(value.discountAmount || 0),
        downPaymentAmount: Number(value.downPaymentAmount || 0),
        contractPaymentAmount: Number(value.contractPaymentAmount || 0),
        downPaymentMonths: Number(value.downPaymentMonths || 0),
        scheduledTransferDate: value.scheduledTransferDate,
        notes: value.notes,
      }
      if (isConvert) onCreate({ ...fields, reservationId: target.reservation.id, activate: value.activate })
      else onUpdate({ ...fields, id: target.contract.id })
    },
  })

  return (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        {locked && (
          <p className="text-xs text-muted-foreground">
            This contract is {target.kind === "edit" && target.contract.status}. Prices and the payment schedule are
            fixed; you can change the transfer date and notes.
          </p>
        )}
        <FieldRow>
          <form.Field name="contractDate">
            {(field) => <DateField field={field} label="Contract date" disabled={locked} />}
          </form.Field>
          <form.Field name="scheduledTransferDate">
            {(field) => <DateField field={field} label="Transfer date (planned)" />}
          </form.Field>
        </FieldRow>
        <FieldRow>
          <form.Field name="discountAmount">
            {(field) => <MoneyField field={field} label="Discount (฿)" disabled={locked} />}
          </form.Field>
          <form.Field name="downPaymentAmount">
            {(field) => (
              <MoneyField
                field={field}
                label="Down payment (฿)"
                description="Excludes the reservation fee"
                disabled={locked}
              />
            )}
          </form.Field>
        </FieldRow>
        <FieldRow>
          <form.Field name="contractPaymentAmount">
            {(field) => (
              <MoneyField
                field={field}
                label="Paid at signing (฿)"
                description="Part of the down payment"
                disabled={locked}
              />
            )}
          </form.Field>
          <form.Field name="downPaymentMonths">
            {(field) => (
              <TextField
                field={field}
                label="Monthly installments"
                type="number"
                description="For the rest of the down payment"
                disabled={locked}
              />
            )}
          </form.Field>
        </FieldRow>
        {isConvert && (
          <form.Field name="activate">
            {(field) => (
              <CheckboxField
                field={field}
                label="Contract is signed"
                description="Leave unticked to save as a draft you can still change or delete."
              />
            )}
          </form.Field>
        )}
        <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        <FieldSeparator />
        <form.Subscribe selector={(s) => s.values}>
          {(values) => <SchedulePreview values={values} listPrice={listPrice} reservationFee={reservationFee} />}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}
