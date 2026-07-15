import { defineConfig } from "drizzle-kit";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  throw new Error("DIRECT_URL is not set");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl,
  },
});
