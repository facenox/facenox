import Store from "electron-store"
import path from "path"
import { fileURLToPath } from "node:url"
import isDev from "./util.js"
import {
  type PersistentSettingsSchema,
  defaultSettings,
} from "../services/persistentSettingsDefaults.js"

interface TypedStore<T> {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
  clear(): void
  store: T
}

const storeOptions: {
  name: string
  defaults: PersistentSettingsSchema
  cwd?: string
  projectName?: string
} = {
  name: "config",
  defaults: defaultSettings,
  projectName: "Atracana",
}

// If in development, isolate the config file from production AppData
if (isDev()) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  // Points to the 'data' folder in the repo root
  storeOptions.cwd = path.join(currentDir, "..", "..", "..", "data")
}

export const persistentStore: TypedStore<PersistentSettingsSchema> =
  new Store<PersistentSettingsSchema>(
    storeOptions,
  ) as unknown as TypedStore<PersistentSettingsSchema>
