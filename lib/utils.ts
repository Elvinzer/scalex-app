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

/**
 * URL de base publique de l'app, utilisée côté serveur pour construire des liens
 * absolus (emails d'invitation, brief hebdo, etc.).
 *
 * Ordre de résolution : APP_URL > NEXT_PUBLIC_APP_URL > URL Vercel. En dev, on
 * retombe sur http://localhost:3000 pour ne pas bloquer le développement local.
 * En prod, si rien n'est configuré, on lève une erreur bruyante plutôt que
 * d'envoyer des liens cassés.
 */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (explicit) {
    return explicit.replace(/\/$/, "")
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000"
  }
  throw new Error("APP_URL is not set")
}
