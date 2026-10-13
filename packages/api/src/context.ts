import type { Session } from "@real-estate-management/auth";
import type { Database } from "@real-estate-management/db";

export type Context = {
  session: Session | null;
  db: Database;
};
