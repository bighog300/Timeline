import crypto from "crypto";
import { z } from "zod";

const KeyEntrySchema = z.object({ version: z.string(), key: z.string() });

type KeyEntry = z.infer<typeof KeyEntrySchema>;

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
};

const parseKeyring = (): KeyEntry[] => {
  if (process.env.ENCRYPTION_KEYRING_JSON) {
    const parsed = z.array(KeyEntrySchema).parse(JSON.parse(process.env.ENCRYPTION_KEYRING_JSON));
    return parsed;
  }

  if (process.env.ENCRYPTION_KEY_BASE64 && process.env.KEY_VERSION) {
    return [{ version: process.env.KEY_VERSION, key: process.env.ENCRYPTION_KEY_BASE64 }];
  }

  return [];
};

const validateKeyEntry = (entry: KeyEntry) => {
  const key = Buffer.from(entry.key, "base64");
  if (key.length !== 32) {
    throw new Error("invalid_key_length");
  }
  return key;
};

const keyring = parseKeyring();

export const getActiveKeyVersion = () => keyring[0]?.version ?? null;

const getKeyEntry = (version: string) => {
  const entry = keyring.find((item) => item.version === version);
  if (!entry) {
    throw new Error("missing_key_version");
  }
  return { entry, key: validateKeyEntry(entry) };
};

export const encryptPayload = (plaintext: string, keyVersion: string): EncryptedPayload => {
  const { key } = getKeyEntry(keyVersion);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion
  };
};

export const decryptPayload = (payload: EncryptedPayload) => {
  const { key } = getKeyEntry(payload.keyVersion);
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
