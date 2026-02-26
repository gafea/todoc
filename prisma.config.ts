import { defineConfig, env } from "prisma/config";
import "dotenv/config";

const isVercelDeployment = process.env.VERCEL === "1";

const schemaPath = isVercelDeployment
  ? "prisma/schema.vercel.prisma"
  : "prisma/schema.prisma";

const migrationsPath = isVercelDeployment
  ? "prisma/migrations-postgres"
  : "prisma/migrations";

export default defineConfig({
  schema: schemaPath,
  migrations: {
    path: migrationsPath,
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
