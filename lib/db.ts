import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma 7 driver-adapter setup (pg Pool). The schema datasource still
// carries `url = env("DATABASE_URL")` so the Prisma CLI (generate / db
// push) keeps working from `.env`; at runtime the adapter owns the
// connection pool.
const globalForPrisma = globalThis as unknown as {
  __purplePool?: Pool;
  __purplePrisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const pool =
  globalForPrisma.__purplePool ?? new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

export const db =
  globalForPrisma.__purplePrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__purplePool = pool;
  globalForPrisma.__purplePrisma = db;
}
