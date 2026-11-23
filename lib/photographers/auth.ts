import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readValues } from "@/lib/integrations/google-sheets/client";

const scrypt = promisify(scryptCallback);
export const PHOTOGRAPHER_COOKIE = "ll_photographer_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const HEADERS = ["photographer_id","auth_user_id","registration_id","public_name","email","phone","bio","primary_location","categories","profile_image_url","hero_image_url","status","publish_state","membership_tier","created_at","updated_at"] as const;

export type PhotographerSession = { accountId: string; photographerId: string; email: string; exp: number; sessionVersion?: number };
export type PhotographerRecord = {
  id: string; accountId: string; email: string; name: string; bio: string; location: string;
  categories: string[]; profileImageUrl: string; heroImageUrl: string; status: string; publishState: string;
  rowNumber: number; row: string[]; headers: string[];
};

function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Photographer session signing is not configured.");
  return value;
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function encode(session: PhotographerSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + sign(payload);
}
function decode(value: string): PhotographerSession | null {
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PhotographerSession;
    if (!session.accountId || !session.photographerId || !session.email || !Number.isFinite(session.exp) || session.exp <= Date.now()) return null;
    return session;
  } catch { return null; }
}
export function photographerSessionCookie(session: PhotographerSession) { return encode(session); }
export function photographerCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}
export async function hashPhotographerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function verifyPhotographerPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const key = await scrypt(password, salt, 64) as Buffer, expected = Buffer.from(hex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export async function readPhotographerRecord(photographerId: string): Promise<PhotographerRecord | null> {
  const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
  const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
  if (headers.length !== HEADERS.length || HEADERS.some(header => !headers.includes(header))) {
    throw new Error("The photographer worksheet does not match the verified 16-column schema.");
  }
  const idIndex = headers.indexOf("photographer_id");
  const matches = rows.slice(1).map((row,index) => ({ row, rowNumber:index+2 }))
    .filter(item => String(item.row[idIndex] ?? "").trim() === photographerId);
  if (matches.length !== 1) return null;
  const { row, rowNumber } = matches[0];
  const value = (key: string) => String(row[headers.indexOf(key)] ?? "").trim();
  if (value("status").toUpperCase() !== "APPROVED") return null;
  return {
    id: value("photographer_id"), accountId: value("auth_user_id"), email: value("email").toLowerCase(),
    name: value("public_name"), bio: value("bio"), location: value("primary_location"),
    categories: value("categories").split(/[;,]/).map(v=>v.trim()).filter(Boolean),
    profileImageUrl: value("profile_image_url"), heroImageUrl: value("hero_image_url"),
    status: value("status"), publishState: value("publish_state"), rowNumber, row, headers
  };
}
export async function getPhotographerSession(request: NextRequest) {
  const raw = request.cookies.get(PHOTOGRAPHER_COOKIE)?.value;
  if (!raw) return null;
  const session = decode(raw);
  if (!session) return null;
  const sql = getDatabase();
  const accounts = await sql`SELECT account_id, photographer_id, email, account_state, session_version
    FROM photographer_accounts WHERE account_id = ${session.accountId} LIMIT 1`;
  if (!accounts.length || String(accounts[0].account_state) !== "active" ||
      String(accounts[0].photographer_id) !== session.photographerId ||
      String(accounts[0].email).toLowerCase() !== session.email.toLowerCase() ||
      Number(accounts[0].session_version ?? 1) !== Number(session.sessionVersion ?? 1)) return null;
  const record = await readPhotographerRecord(session.photographerId);
  if (!record || record.accountId !== session.accountId || record.email !== session.email.toLowerCase()) return null;
  return { ...session, record };
}
export function newPhotographerAccountId() { return "pacc_" + randomUUID(); }
export function hashInvitationToken(token: string) { return digest(token); }
export function createInvitationToken() { return randomBytes(32).toString("base64url"); }
