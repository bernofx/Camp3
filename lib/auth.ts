import { env } from "cloudflare:workers";
import { database, ensureDatabase } from "./database";

const encoder = new TextEncoder();
const SESSION_COOKIE = "vs_session";
// Cloudflare Workers limits PBKDF2 to 100,000 iterations.
const ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array) {
  let text = "";
  bytes.forEach((byte) => (text += String.fromCharCode(byte)));
  return btoa(text);
}

function base64ToBytes(value: string) {
  const text = atob(value);
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return bytesToBase64(bytes);
}

export async function hashPassword(password: string, salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(salt), iterations: ITERATIONS }, material, 256);
  return { salt, hash: bytesToBase64(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const calculated = await hashPassword(password, salt);
  const a = base64ToBytes(calculated.hash);
  const b = base64ToBytes(expected);
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) different |= a[i] ^ b[i];
  return different === 0;
}

export function db() {
  return database();
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export async function currentUser(request: Request) {
  await ensureDatabase();
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await digest(token);
  const row = await db().prepare(`SELECT users.id, users.username, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1`).bind(tokenHash, new Date().toISOString()).first<{id:number;username:string;role:string}>();
  return row || null;
}

export async function requireUser(request: Request, roles = ["editor", "admin"]) {
  const user = await currentUser(request);
  if (!user || !roles.includes(user.role)) return null;
  return user;
}

export async function createSession(userId: number) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("/", "_").replaceAll("+", "-").replaceAll("=", "");
  const tokenHash = await digest(token);
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  await db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, userId, expires.toISOString(), now.toISOString()).run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}

export async function deleteSession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await db().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function cleanUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
