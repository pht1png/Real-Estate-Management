import { router } from "../../index"
import { approvalsRouter } from "./approvals"
import { optionsRouter } from "./options"
import { ordersRouter } from "./orders"
import { receiptsRouter } from "./receipts"
import { requestsRouter } from "./requests"
import { suppliersRouter } from "./suppliers"

export const procurementRouter = router({
  options: optionsRouter,
  approvals: approvalsRouter,
  suppliers: suppliersRouter,
  requests: requestsRouter,
  orders: ordersRouter,
  receipts: receiptsRouter,
})
