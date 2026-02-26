import { defineConfig, env } from "prisma/config";
import "dotenv/config";

const isVercelDeployment = process.env.VERCEL === "1";

const schemaPath = isVercelDeployment
  ? "prisma/schema.vercel.prisma"
  : "prisma/schema.prisma";

const migrationsPath = isVercelDeployment
  ? "prisma/migrations-postgres"
  : "prisma/migrations";

const databaseUrl = env("DATABASE_URL");
const directUrl = isVercelDeployment ? env("DIRECT_URL") : undefined;

const datasourceConfig = isVercelDeployment
  ? {
      url: databaseUrl,
      directUrl,
    }
  : {
      url: databaseUrl,
    };

export default defineConfig({
  schema: schemaPath,
  migrations: {
    path: migrationsPath,
  },
  engine: "classic",
  datasource: datasourceConfig,
});
