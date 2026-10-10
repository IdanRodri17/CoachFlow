// lib/encryptedStorage.ts — V19 (C6): the Supabase session, encrypted at rest.
//
// WHY: the login session (access + refresh token) used to sit in plain
// AsyncStorage: an unencrypted file that Android Auto Backup copies to the
// cloud and that anyone with the phone's file system can read. The refresh
// token is a long-lived login to an app holding health data.
//
// HOW (Supabase's Expo guide, upgraded to authenticated encryption):
//   * one random AES-256 device key, kept in the OS keychain (expo-secure-store).
//     The keychain can't hold the whole session (iOS used to reject values
//     over ~2 KB), so the key goes there and the session doesn't.
//   * the session itself is AES-GCM sealed and stored on disk (AsyncStorage)
//     under `<name>.enc`. GCM detects any tampering. The storage name is bound
//     in as additional data, so a blob copied into another slot won't open.
//   * a decrypted copy lives in memory: supabase-js reads the session from
//     storage on EVERY request, and this keeps that a Map lookup instead of a
//     keychain read plus a decrypt.
//
// Recovery rules:
//   * a sealed blob that won't open (the key is gone: Android restored the
//     backup without the keychain, or iOS kept an old key) is deleted and reads
//     as "no session". The user signs in again; nothing else breaks.
//   * a keychain READ error is thrown, never treated as "no key": treating it
//     as missing would mint a new key and orphan a good session.
//   * a plaintext session left by an older build (stored under `<name>`) is
//     read once, re-saved encrypted and the plaintext deleted, so updating
//     the app never costs anyone an SMS.
//
// Pure logic: the keychain, disk and cipher are passed in (lib/supabase.ts
// wires the Expo modules), so lib/encryptedStorage.test.ts runs it in Node.

const SEALED_SUFFIX = ".enc";
const DEVICE_KEY_NAME = "coachflow.session-key";

export type EncryptedStorageDeps = {
  /** OS keychain. getItem resolves null only when the item doesn't exist. */
  keychain: {
    getItem(name: string): Promise<string | null>;
    setItem(name: string, value: string): Promise<void>;
  };
  /** Plain on-disk storage (AsyncStorage). */
  disk: {
    getItem(name: string): Promise<string | null>;
    setItem(name: string, value: string): Promise<void>;
    removeItem(name: string): Promise<void>;
  };
  /** AES-256-GCM. Keys and sealed data are base64; decrypt throws if it won't open. */
  cipher: {
    generateKey(): Promise<string>;
    encrypt(plaintext: string, key: string, additionalData: string): Promise<string>;
    decrypt(sealed: string, key: string, additionalData: string): Promise<string>;
  };
};

export function createEncryptedStorage({ keychain, disk, cipher }: EncryptedStorageDeps) {
  // name → value; null = known to be empty. Every write lands here first.
  const memory = new Map<string, string | null>();
  let deviceKey: Promise<string> | null = null;
  let writes: Promise<void> = Promise.resolve();

  // Memoized: two first-use writes racing must not mint two keys.
  function getDeviceKey(): Promise<string> {
    deviceKey ??= (async () => {
      const existing = await keychain.getItem(DEVICE_KEY_NAME);
      if (existing) return existing;
      const fresh = await cipher.generateKey();
      await keychain.setItem(DEVICE_KEY_NAME, fresh);
      return fresh;
    })().catch((error: unknown) => {
      deviceKey = null; // let the next call retry
      throw error;
    });
    return deviceKey;
  }

  // Writes run one at a time, and each persists the LATEST in-memory value,
  // so an older write finishing late can never overwrite a newer one.
  function persist(name: string): Promise<void> {
    const job = writes.then(async () => {
      const value = memory.get(name) ?? null;
      if (value === null) {
        await disk.removeItem(name + SEALED_SUFFIX);
      } else {
        const sealed = await cipher.encrypt(value, await getDeviceKey(), name);
        await disk.setItem(name + SEALED_SUFFIX, sealed);
      }
      await disk.removeItem(name); // an older build's plaintext copy, if any
    });
    writes = job.catch(() => undefined);
    return job;
  }

  // A read only fills memory if no write got there first.
  function settle(name: string, value: string | null): string | null {
    if (!memory.has(name)) memory.set(name, value);
    return memory.get(name) ?? null;
  }

  return {
    async getItem(name: string): Promise<string | null> {
      if (memory.has(name)) return memory.get(name) ?? null;

      const sealed = await disk.getItem(name + SEALED_SUFFIX);
      if (sealed !== null) {
        const key = await getDeviceKey(); // throws on a keychain error: keep the blob
        let opened: string | null = null;
        try {
          opened = await cipher.decrypt(sealed, key, name);
        } catch {
          // Wrong key or tampered: unrecoverable. Read as signed out, and the
          // persist below deletes the blob.
        }
        const value = settle(name, opened);
        if (opened === null) await persist(name).catch(() => undefined);
        return value;
      }

      const plaintext = await disk.getItem(name);
      const value = settle(name, plaintext);
      // Best effort: if encrypting fails now, the plaintext stays and the
      // next launch tries again.
      if (plaintext !== null) await persist(name).catch(() => undefined);
      return value;
    },

    setItem(name: string, value: string): Promise<void> {
      memory.set(name, value);
      return persist(name);
    },

    removeItem(name: string): Promise<void> {
      memory.set(name, null);
      return persist(name);
    },
  };
}
