import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only auto-loads .env, not .env.local (Next.js's convention
// for untracked secrets), so load it explicitly here.
config({ path: ".env.local" });

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
