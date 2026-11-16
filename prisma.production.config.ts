import { defineConfig } from "prisma/config";
import { productionTarget, validateProductionUrl } from "./scripts/production-target";

// Only the guarded operator command supplies this environment. No dotenv/fallback.
const target = productionTarget(process.env, "migrate");
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: validateProductionUrl(process.env.DATABASE_URL ?? "", target) },
});
