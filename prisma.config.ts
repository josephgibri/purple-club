import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 disables automatic .env loading when a config file is present,
// so load it ourselves. Mirror Next.js precedence: .env.local overrides
// .env (dotenv does not override already-set vars, so load .local first).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
