import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { getEnv } from "../../env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getKey = () => {
  const env = getEnv();
  return createHash("sha256").update(env.SESSION_SECRET).digest();
};

export const encryptString = (plaintext: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: base64(iv).base64(tag).base64(ciphertext)
  return [iv, tag, encrypted].map((buffer) => buffer.toString("base64")).join(".");
};

export const decryptString = (ciphertext: string): string => {
  const [ivB64, tagB64, encryptedB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted payload format.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};
