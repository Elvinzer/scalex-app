import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MIN_PAYLOAD_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH;

function decodeKey(value: string, name: string): Buffer {
  const buffer = Buffer.from(value.trim(), "base64");
  if (buffer.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes (AES-256)`);
  }
  return buffer;
}

function getKeys(): Buffer[] {
  const currentKey = process.env.ENCRYPTION_KEY;
  if (!currentKey) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  const keys = [decodeKey(currentKey, "ENCRYPTION_KEY")];
  const previousKey = process.env.ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previousKey && previousKey !== currentKey.trim()) {
    keys.push(decodeKey(previousKey, "ENCRYPTION_KEY_PREVIOUS"));
  }
  return keys;
}

// Never used to encrypt anything shown to the frontend after initial entry —
// callers only ever store the result and decrypt it server-side.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKeys()[0], iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < MIN_PAYLOAD_LENGTH) {
    throw new Error("Encrypted payload is invalid");
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  let lastError: unknown;
  for (const key of getKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Unable to decrypt payload");
}

// Variante non-bloquante : renvoie null au lieu de lever si le payload ne peut
// pas être déchiffré (ENCRYPTION_KEY qui a tourné, ciphertext corrompu…). À
// utiliser quand l'échec de déchiffrement d'UNE valeur ne doit pas casser toute
// la page (ex. aperçu masqué de la clé BYOK sur /settings). Ne logge JAMAIS le
// payload, l'erreur brute ni le plaintext — juste un marqueur sans secret.
export function tryDecrypt(payload: string): string | null {
  try {
    return decrypt(payload);
  } catch {
    console.warn("[crypto] déchiffrement impossible (clé de chiffrement changée ou donnée corrompue)");
    return null;
  }
}
