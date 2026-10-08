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
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(6));
  return `REF-${[...random].map(value => alphabet[value % alphabet.length]).join("")}`;
}
