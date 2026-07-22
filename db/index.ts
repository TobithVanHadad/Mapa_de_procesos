export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is unavailable. Add the Railway PostgreSQL reference variable before enabling persistence."
    );
  }

  return databaseUrl;
}
