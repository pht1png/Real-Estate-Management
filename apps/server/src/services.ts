import { createAuth } from "@real-estate-management/auth";
import { createDb } from "@real-estate-management/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
