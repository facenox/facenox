import { ipcMain, dialog } from "electron";
import fs from "node:fs/promises";
import crypto from "node:crypto";

import { backendService } from "../backendService.js";
import { syncManager } from "../managers/BackgroundSyncManager.js";

// Cryptographic Constants
const SURI_MAGIC = Buffer.from("SURI\x00\x01"); // 6 bytes
const SALT_SIZE = 16;
const IV_SIZE = 12;
const TAG_SIZE = 16;
const KEY_SIZE = 32; // AES-256
const PBKDF2_ITERS = 480_000;
const PBKDF2_DIGEST = "sha256";

// Key Derivation
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERS,
    KEY_SIZE,
    PBKDF2_DIGEST,
  );
}

// Encrypt
function encryptVault(plaintext: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_SIZE);
  const iv = crypto.randomBytes(IV_SIZE);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  return Buffer.concat([SURI_MAGIC, salt, iv, tag, ciphertext]);
}

// Decrypt
function decryptVault(blob: Buffer, password: string): Buffer {
  const magicLen = SURI_MAGIC.length;
  const minLen = magicLen + SALT_SIZE + IV_SIZE + TAG_SIZE + 1;

  if (blob.length < minLen) {
    throw new Error("File is too short to be a valid .suri vault.");
  }

  const magic = blob.subarray(0, magicLen);
  if (!crypto.timingSafeEqual(magic, SURI_MAGIC)) {
    throw new Error(
      "Invalid file format. This file is not a Suri vault (.suri).",
    );
  }

  let offset = magicLen;
  const salt = blob.subarray(offset, offset + SALT_SIZE);
  offset += SALT_SIZE;
  const iv = blob.subarray(offset, offset + IV_SIZE);
  offset += IV_SIZE;
  const tag = blob.subarray(offset, offset + TAG_SIZE);
  offset += TAG_SIZE;
  const ciphertext = blob.subarray(offset);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      "Decryption failed. The password is incorrect or the file is corrupted.",
    );
  }
}

// IPC Registration
export function registerSyncHandlers() {
  ipcMain.handle("sync:restart-manager", () => {
    syncManager.start();
    return true;
  });

  ipcMain.handle("sync:trigger-now", async () => {
    await syncManager.performSync();
    return true;
  });

  ipcMain.handle("sync:pick-import-file", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Open Suri Vault",
        filters: [{ name: "Suri Vault", extensions: ["suri"] }],
        properties: ["openFile"],
        buttonLabel: "Open Vault",
      });

      if (canceled || filePaths.length === 0) {
        return { canceled: true };
      }

      return { canceled: false, filePath: filePaths[0] };
    } catch (error) {
      console.error("[Vault] Picking file failed:", error);
      return {
        canceled: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("sync:export-data", async (_event, password?: string) => {
    try {
      if (!password) {
        throw new Error("Password is required to export vault.");
      }

      const exportUrl = `${backendService.getUrl()}/vault/export`;
      const exportRes = await fetch(exportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
      });

      if (!exportRes.ok) {
        const errText = await exportRes.text();
        throw new Error(
          `Vault export failed: HTTP ${exportRes.status} — ${errText}`,
        );
      }

      const vaultPayload = await exportRes.json();

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Suri Vault",
        defaultPath: `suri-vault-${new Date().toISOString().slice(0, 10)}.suri`,
        filters: [{ name: "Suri Vault", extensions: ["suri"] }],
        buttonLabel: "Save Vault",
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      const plaintext = Buffer.from(JSON.stringify(vaultPayload), "utf-8");
      const encrypted = encryptVault(plaintext, password);
      await fs.writeFile(filePath, encrypted);

      return { success: true, filePath };
    } catch (error) {
      console.error("[Vault] Export failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "sync:import-data",
    async (
      _event,
      password?: string,
      filePath?: string,
      overwrite: boolean = false,
    ) => {
      try {
        if (!password) {
          throw new Error("Password is required to restore vault.");
        }

        if (!filePath) {
          throw new Error("File path is required to restore vault.");
        }

        // 3. Read encrypted file and decrypt
        const encryptedBlob = await fs.readFile(filePath);
        let plaintext: Buffer;
        try {
          plaintext = decryptVault(encryptedBlob, password);
        } catch (decryptErr) {
          return {
            success: false,
            error:
              decryptErr instanceof Error
                ? decryptErr.message
                : "Decryption failed.",
          };
        }

        // 4. Parse vault structure
        const vaultPayload = JSON.parse(plaintext.toString("utf-8"));

        // 5. Send to Python backend for full restoration (attendance + biometrics)
        const importUrl = `${backendService.getUrl()}/vault/import`;
        const importRes = await fetch(importUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: vaultPayload.version ?? 1,
            exported_at: vaultPayload.exported_at,
            attendance: {
              data: vaultPayload.attendance,
              overwrite_existing: overwrite,
            },
            biometrics: vaultPayload.biometrics ?? [],
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!importRes.ok) {
          const err = await importRes.text();
          throw new Error(`Import failed: ${err}`);
        }

        const result = await importRes.json();
        return { success: true, message: result.message };
      } catch (error) {
        console.error("[Vault] Import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
