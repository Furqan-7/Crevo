import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate, studio) connects with DIRECT_URL: Neon's
// unpooled connection, which migrations need. The app itself connects
// through the pooled DATABASE_URL (see src/index.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
