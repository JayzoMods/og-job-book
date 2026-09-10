import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SALT_LEN = 16;
const PREFIX = "scrypt";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function parsePassword(
  raw: string | number | null | undefined,
): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (raw.length < PASSWORD_MIN || raw.length > PASSWORD_MAX) {
    return null;
  }
  return raw;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${PREFIX}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return false;
  }
  const saltHex = parts[1] ?? "";
  const keyHex = parts[2] ?? "";
  if (saltHex.length !== SALT_LEN * 2 || keyHex.length !== KEY_LEN * 2) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) {
    return false;
  }
  const actual = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
