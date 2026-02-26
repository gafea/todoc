import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const SQLITE_PREFIX = "file:";

const getWorkspaceRoot = () => process.env.PROJECT_ROOT ?? process.cwd();

const getPrismaSchemaDir = (workspaceRoot: string) => {
  const explicitSchemaPath = process.env.PRISMA_SCHEMA_PATH;
  if (explicitSchemaPath) {
    const resolved = path.isAbsolute(explicitSchemaPath)
      ? explicitSchemaPath
      : path.resolve(workspaceRoot, explicitSchemaPath);
    return path.dirname(resolved);
  }

  const defaultSchemaPath = path.resolve(
    workspaceRoot,
    "prisma",
    "schema.prisma",
  );
  if (fs.existsSync(defaultSchemaPath)) {
    return path.dirname(defaultSchemaPath);
  }

  return workspaceRoot;
};

const resolveSqlitePath = () => {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl || !rawUrl.startsWith(SQLITE_PREFIX)) {
    return null;
  }

  let sqlitePath = rawUrl.slice(SQLITE_PREFIX.length);
  if (!sqlitePath || sqlitePath.startsWith(":")) {
    return null;
  }

  let query = "";
  const queryIndex = sqlitePath.indexOf("?");
  if (queryIndex !== -1) {
    query = sqlitePath.slice(queryIndex);
    sqlitePath = sqlitePath.slice(0, queryIndex);
  }

  const workspaceRoot = getWorkspaceRoot();
  const prismaSchemaDir = getPrismaSchemaDir(workspaceRoot);
  const absolutePath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.resolve(prismaSchemaDir, sqlitePath);

  const normalized = absolutePath.split(path.sep).join("/");
  return { normalized, absolutePath, query };
};

const ensureSqliteFile = (absolutePath: string) => {
  const directory = path.dirname(absolutePath);
  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(absolutePath)) {
    fs.closeSync(fs.openSync(absolutePath, "w"));
  }
};

const bootstrapLocalSqliteEnv = () => {
  const resolved = resolveSqlitePath();
  if (!resolved) {
    return;
  }

  ensureSqliteFile(resolved.absolutePath);
  process.env.DATABASE_URL = `${SQLITE_PREFIX}${resolved.normalized}${resolved.query}`;
};

const getDatabaseMode = () => {
  const rawUrl = process.env.DATABASE_URL ?? "";
  if (rawUrl.startsWith(SQLITE_PREFIX)) {
    return "local-sqlite";
  }

  if (process.env.VERCEL === "1") {
    return "vercel-postgres";
  }

  return "external-postgres";
};

const getDatabaseTarget = () => {
  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) {
    return "unset";
  }

  if (rawUrl.startsWith(SQLITE_PREFIX)) {
    return rawUrl.slice(SQLITE_PREFIX.length);
  }

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "configured";
  }
};

bootstrapLocalSqliteEnv();

console.info(
  `[db] startup mode=${getDatabaseMode()} target=${getDatabaseTarget()}`,
);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
