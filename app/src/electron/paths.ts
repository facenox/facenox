import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import isDev from './util.js'

export function getDataDirectory(): string {
  return isDev() ? path.join(app.getAppPath(), '..', 'data') : path.join(app.getPath('userData'), 'data')
}

export function getLogDirectory(): string {
  return isDev() ? path.join(app.getAppPath(), '..', 'data') : path.join(app.getPath('userData'), 'logs')
}

export function getLegacyDataDirectory(): string {
  const userDataDir = app.getPath('userData')
  if (process.platform !== 'linux') return userDataDir

  // Older Linux installs used the lowercase app profile for their SQLite database.
  const lowercaseProfile = path.join(app.getPath('appData'), 'facenox')
  return lowercaseProfile !== userDataDir && fs.existsSync(path.join(lowercaseProfile, 'attendance.db')) ?
      lowercaseProfile
    : userDataDir
}
