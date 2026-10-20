import { router } from "../../index"
import { contactsRouter } from "./contacts"
import { contractsRouter } from "./contracts"
import { leadsRouter } from "./leads"
import { optionsRouter } from "./options"
import { paymentsRouter } from "./payments"
import { reservationsRouter } from "./reservations"

export const salesRouter = router({
  options: optionsRouter,
  leads: leadsRouter,
  contacts: contactsRouter,
  reservations: reservationsRouter,
  contracts: contractsRouter,
  payments: paymentsRouter,
})
