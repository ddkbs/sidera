import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings, type SettingsPatch } from '@shared/settings'

/** JSON settings file next to the database. Small, synchronous, read once at startup. */
export class SettingsStore {
  private file: string
  private value: AppSettings

  constructor(dataDir: string) {
    this.file = join(dataDir, 'settings.json')
    let stored: SettingsPatch | null = null
    try {
      if (existsSync(this.file)) stored = JSON.parse(readFileSync(this.file, 'utf8')) as SettingsPatch
    } catch {
      stored = null
    }
    this.value = mergeSettings(DEFAULT_SETTINGS, stored)
  }

  get(): AppSettings {
    return this.value
  }

  set(patch: SettingsPatch): AppSettings {
    this.value = mergeSettings(this.value, patch)
    writeFileSync(this.file, JSON.stringify(this.value, null, 2))
    return this.value
  }
}
