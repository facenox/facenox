import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const appRoot = path.resolve(__dirname, '..')

try {
  const hasElectronBuilder = fs.existsSync(path.join(appRoot, 'node_modules', 'electron-builder'))
  if (hasElectronBuilder) {
    console.log('Running electron-builder install-app-deps...')
    // Rebuild native dependencies against current Electron headers.
    execSync('npx electron-builder install-app-deps', { cwd: appRoot, stdio: 'inherit' })
  } else {
    console.log('electron-builder not found, skipping native dependency installation.')
  }
} catch (error) {
  console.error('Failed to run electron-builder install-app-deps:', error.message)
}

try {
  const electronInstallPath = path.join(appRoot, 'node_modules', 'electron', 'install.js')
  if (fs.existsSync(electronInstallPath)) {
    console.log('Verifying/Downloading Electron binary...')
    // Force download of Electron binary since pnpm can skip lifecycle scripts.
    execSync(`node "${electronInstallPath}"`, { cwd: appRoot, stdio: 'inherit' })
  } else {
    console.log('electron package not found in node_modules, skipping binary download.')
  }
} catch (error) {
  console.error('Failed to install Electron binary:', error.message)
  process.exit(1)
}
