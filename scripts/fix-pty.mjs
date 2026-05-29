// pnpm (store de hardlinks) puede dejar el binario `spawn-helper` de node-pty sin
// bit de ejecución, lo que provoca "posix_spawnp failed" al abrir una PTY.
// Este postinstall restaura el permiso de ejecución en macOS/Linux.
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

try {
  const pnpmDir = 'node_modules/.pnpm'
  if (!existsSync(pnpmDir)) process.exit(0)
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith('node-pty@')) continue
    const prebuilds = join(pnpmDir, entry, 'node_modules/node-pty/prebuilds')
    if (!existsSync(prebuilds)) continue
    for (const plat of readdirSync(prebuilds)) {
      const helper = join(prebuilds, plat, 'spawn-helper')
      if (existsSync(helper)) {
        try {
          chmodSync(helper, 0o755)
        } catch {
          /* noop */
        }
      }
    }
  }
} catch {
  /* no bloquea la instalación */
}
