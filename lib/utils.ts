import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

const PRODUCTION_APP_URL = "https://www.minaly.io"

/**
 * URL de base publique de l'app, utilisée côté serveur pour construire des liens
 * absolus (emails d'invitation, brief hebdo, etc.).
 *
 * Ordre de résolution : APP_URL > NEXT_PUBLIC_APP_URL > domaine canonique Minaly
 * en production > URL Vercel de preview. En dev, on retombe sur
 * http://localhost:3000 pour ne pas bloquer le développement local.
 */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview")
  if (isProduction && explicit?.includes(".vercel.app")) {
    return PRODUCTION_APP_URL
  }
  if (explicit) {
    return explicit.replace(/\/$/, "")
  }
  if (isProduction) {
    return PRODUCTION_APP_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000"
  }
  throw new Error("APP_URL is not set")
}
