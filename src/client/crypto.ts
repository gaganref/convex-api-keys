import { runtimeUnavailableError } from "./errors.js";

const textEncoder = new TextEncoder();

export function generateToken(prefix: string, keyLengthBytes: number): string {
  const bytes = randomBytes(keyLengthBytes);
  return `${prefix}${base64UrlEncode(bytes)}`;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const hash = await getSubtleOrThrow().digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return base64UrlEncode(new Uint8Array(hash));
}

export function tokenLast4(token: string) {
  return token.slice(-4);
}

function randomBytes(length: number) {
  const crypto = getCryptoOrThrow();
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function getSubtleOrThrow() {
  const subtle = getCryptoOrThrow().subtle;
  if (!subtle) {
    throw runtimeUnavailableError(
      "Web Crypto API subtle crypto is not available",
    );
  }
  return subtle;
}

function getCryptoOrThrow() {
  const crypto = globalThis.crypto;
  if (!crypto) {
    throw runtimeUnavailableError(
      "Web Crypto API is not available in this runtime",
    );
  }
  return crypto;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  if (typeof globalThis.btoa !== "function") {
    throw runtimeUnavailableError(
      "Base64 encoding is not available in this runtime",
    );
  }
  return globalThis
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
