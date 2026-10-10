// lib/encryptedStorage.test.ts — the session-at-rest rules (lib/encryptedStorage.ts)
// with Node's real AES-256-GCM standing in for expo-crypto and two Maps for
// the keychain and AsyncStorage. "A new launch" = a new createEncryptedStorage
// over the same Maps, so nothing is answered from the in-memory copy.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createEncryptedStorage, type EncryptedStorageDeps } from "@/lib/encryptedStorage";

const NAME = "sb-project-auth-token";
const SESSION = JSON.stringify({ access_token: "eyJ.secret.jwt", refresh_token: "r3fr3sh", user: { name: "דנה" } });

const cipher: EncryptedStorageDeps["cipher"] = {
  generateKey: async () => randomBytes(32).toString("base64"),
  encrypt: async (plaintext, key, additionalData) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
    c.setAAD(Buffer.from(additionalData, "utf8"));
    const body = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
    return Buffer.concat([iv, body, c.getAuthTag()]).toString("base64");
  },
  decrypt: async (sealed, key, additionalData) => {
    const bytes = Buffer.from(sealed, "base64");
    const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), bytes.subarray(0, 12));
    d.setAAD(Buffer.from(additionalData, "utf8"));
    d.setAuthTag(bytes.subarray(bytes.length - 16));
    return Buffer.concat([d.update(bytes.subarray(12, bytes.length - 16)), d.final()]).toString("utf8");
  },
};

function device() {
  const keychain = new Map<string, string>();
  const disk = new Map<string, string>();
  const deps: EncryptedStorageDeps = {
    keychain: {
      getItem: vi.fn(async (name: string) => keychain.get(name) ?? null),
      setItem: vi.fn(async (name: string, value: string) => void keychain.set(name, value)),
    },
    disk: {
      getItem: async (name) => disk.get(name) ?? null,
      setItem: async (name, value) => void disk.set(name, value),
      removeItem: async (name) => void disk.delete(name),
    },
    cipher,
  };
  return { keychain, disk, deps, launch: () => createEncryptedStorage(deps) };
}

describe("encrypted session storage", () => {
  it("round-trips a session across launches, UTF-8 included", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    expect(await d.launch().getItem(NAME)).toBe(SESSION);
  });

  it("never writes the session to disk in the clear", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    const onDisk = [...d.disk.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
    expect(onDisk).not.toContain("r3fr3sh");
    expect(onDisk).not.toContain("eyJ.secret.jwt");
    expect(d.disk.has(NAME)).toBe(false);
    expect(d.disk.has(`${NAME}.enc`)).toBe(true);
    // The keychain holds the key only, never the session.
    expect([...d.keychain.values()].join()).not.toContain("r3fr3sh");
  });

  it("answers repeat reads from memory, not the keychain", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    const app = d.launch();
    await app.getItem(NAME);
    await app.getItem(NAME);
    await app.getItem(NAME);
    // 1 for the setItem launch's key + 1 for this launch's first read.
    expect(d.deps.keychain.getItem).toHaveBeenCalledTimes(2);
  });

  it("migrates an older build's plaintext session without signing anyone out", async () => {
    const d = device();
    d.disk.set(NAME, SESSION);
    expect(await d.launch().getItem(NAME)).toBe(SESSION);
    expect(d.disk.has(NAME)).toBe(false);
    expect(d.disk.has(`${NAME}.enc`)).toBe(true);
    expect(await d.launch().getItem(NAME)).toBe(SESSION);
  });

  it("removes the session for good on sign-out", async () => {
    const d = device();
    const app = d.launch();
    await app.setItem(NAME, SESSION);
    await app.removeItem(NAME);
    expect(await app.getItem(NAME)).toBeNull();
    expect(await d.launch().getItem(NAME)).toBeNull();
    expect(d.disk.size).toBe(0);
  });

  it("reads as signed out, and cleans up, when the device key is gone", async () => {
    // Android restored AsyncStorage from a backup; the keychain isn't backed up.
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    d.keychain.clear();
    expect(await d.launch().getItem(NAME)).toBeNull();
    expect(d.disk.has(`${NAME}.enc`)).toBe(false);
    // And the next sign-in works under the new key.
    await d.launch().setItem(NAME, SESSION);
    expect(await d.launch().getItem(NAME)).toBe(SESSION);
  });

  it("rejects a tampered blob", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    const sealed = Buffer.from(d.disk.get(`${NAME}.enc`)!, "base64");
    sealed[20] ^= 1;
    d.disk.set(`${NAME}.enc`, sealed.toString("base64"));
    expect(await d.launch().getItem(NAME)).toBeNull();
  });

  it("won't open a blob copied into another slot", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    d.disk.set("other-slot.enc", d.disk.get(`${NAME}.enc`)!);
    expect(await d.launch().getItem("other-slot")).toBeNull();
  });

  it("mints exactly one device key when first writes race", async () => {
    const d = device();
    const app = d.launch();
    await Promise.all([app.setItem("a", "1"), app.setItem("b", "2")]);
    expect(d.deps.keychain.setItem).toHaveBeenCalledTimes(1);
    const next = d.launch();
    expect([await next.getItem("a"), await next.getItem("b")]).toEqual(["1", "2"]);
  });

  it("keeps the newest value when writes overlap", async () => {
    const d = device();
    const app = d.launch();
    const first = app.setItem(NAME, "old");
    const second = app.setItem(NAME, "new");
    await Promise.all([first, second]);
    expect(await d.launch().getItem(NAME)).toBe("new");
  });

  it("doesn't let a slow read overwrite a newer write", async () => {
    const d = device();
    await d.launch().setItem(NAME, "old");
    const app = d.launch();
    const reading = app.getItem(NAME);
    await app.setItem(NAME, "new");
    await reading;
    expect(await app.getItem(NAME)).toBe("new");
    expect(await d.launch().getItem(NAME)).toBe("new");
  });

  it("throws on a keychain read error instead of discarding the session", async () => {
    const d = device();
    await d.launch().setItem(NAME, SESSION);
    vi.mocked(d.deps.keychain.getItem).mockRejectedValueOnce(new Error("keychain locked"));
    const app = d.launch();
    await expect(app.getItem(NAME)).rejects.toThrow("keychain locked");
    expect(d.disk.has(`${NAME}.enc`)).toBe(true);
    // The next read retries and succeeds.
    expect(await app.getItem(NAME)).toBe(SESSION);
  });
});
