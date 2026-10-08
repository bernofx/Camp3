const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  bytes.forEach(byte => { value += String.fromCharCode(byte); });
  return btoa(value);
}

export async function hashQrToken(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return bytesToBase64(digest);
}

export function createQrToken() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("/", "_").replaceAll("+", "-").replaceAll("=", "");
}

export function createPublicCode() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(random % 1_000_000).padStart(6, "0");
}
