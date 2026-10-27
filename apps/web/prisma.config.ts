import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same files Next.js reads; real environment variables take precedence.
config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not required for `prisma generate`, so the Docker build works without a database.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
