import crypto from "node:crypto";
import fs from "node:fs";
import { dataPath } from "./storage.js";

// Clé AES-256 propre à l'installation, créée au premier lancement dans data/secret.key.
function loadKey() {
  const file = dataPath("secret.key");
  try {
    const key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    if (key.length === 32) return key;
  } catch {}
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
}

const KEY = loadKey();

export function encrypt(plain) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob) {
  if (!blob) return "";
  try {
    const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
