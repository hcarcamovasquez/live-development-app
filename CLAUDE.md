# CLAUDE.md

Guía breve para trabajar en este repo. Para el detalle completo, ver `README.md`.

## Qué es

PoC de un **IDE web local** estilo StackBlitz/bolt: una consola que lista/crea
proyectos y un editor (Monaco, look WebStorm) con preview en vivo, terminal y git.
Cada proyecto es una **app Vite independiente** persistida fuera del repo, con su
propio `node_modules` y dev server.

## Stack y layout (monorepo pnpm)

```
apps/web/      Editor: React 19 + Vite + Monaco + xterm  (UI)
apps/server/   Hono + @hono/node-server                  (API, orquestación)
scripts/fix-pty.mjs   postinstall: arregla el exec bit de node-pty
```

- `apps/server/src/`: `index.ts` (boot dev/prod), `api.ts` (REST), `projects.ts`
  (scaffold + install + dev servers por proyecto), `db.ts` (SQLite `node:sqlite`),
  `terminal.ts` (PTY por WebSocket), `git.ts` (simple-git), `paths.ts`.
- `apps/web/src/`: `App.tsx` (router listado↔editor por `?p=<slug>`),
  `components/` (`ProjectList`, `EditorView`, `FileExplorer`, `GitPanel`, `DiffView`,
  `TerminalPanel`, `Editor`, `Preview`, `ConfirmModal`, `fileMeta`),
  `ide.css` (tema Darcula del editor), `App.css` (consola/listado).

## Comandos

```bash
pnpm install     # postinstall arregla node-pty
pnpm dev         # editor en :3000 (Vite middleware con HMR)
pnpm build       # build web + server
pnpm start       # prod (sirve apps/web/dist)
```

## Arquitectura (lo esencial)

- **Editor (:3000)**: Hono sirve `apps/web` con Vite en *middleware mode*
  (`configFile: false` + plugin React inline para evitar reinicios de `tsx watch`).
- **Proyectos**: viven en `PROJECTS_DIR` (def. `~/.live-development-app/projects`),
  registrados en **SQLite** (`registry.db`). Al crear: scaffold → `pnpm install` →
  `git init` + commit + `simple-git` como devDep del proyecto.
- **Preview**: cada proyecto corre su **propio** dev server (Vite) bajo demanda en
  un puerto libre desde `PREVIEW_PORT_BASE` (5174), fijado a IPv4 `127.0.0.1`;
  el editor lo muestra en un iframe.
- **Terminal**: WebSocket en `TERMINAL_PORT` (3001) con PTY real (`node-pty`)
  **persistente** (sobrevive recargas; reconexión por `proyecto::id` con replay).
- **Git**: `git.ts` usa **simple-git** (wrapper del binario `git` → la imagen Docker
  debe incluir `git`). Panel Source Control en el IDE (status, diff, stage/unstage,
  descartar, commit).

## Convenciones y gotchas

- El server usa Node ESM **NodeNext**: imports con extensión `.js` (tsx los resuelve
  a `.ts` en dev; `tsc` emite a `dist/`).
- `pnpm-workspace.yaml` → `allowBuilds` habilita los scripts nativos
  (`esbuild`, `node-pty`).
- Dev server con `NODE_OPTIONS=--disable-warning=ExperimentalWarning` (por
  `node:sqlite`) y `tsx watch --ignore "**/node_modules/**"`.
- Tamaños de paneles, visibilidad del preview y sesión (pestañas/terminal) se
  persisten en `localStorage` por proyecto.

## Verificar

Abrir http://localhost:3000, crear/abrir un proyecto, editar `src/UserApp.tsx` y
guardar (⌘/Ctrl+S) → el preview hace hot reload.

## Variables de entorno

`PORT` (3000) · `PROJECTS_DIR` (`~/.live-development-app/projects`) ·
`PREVIEW_PORT_BASE` (5174) · `TERMINAL_PORT` (3001) · `DB_PATH`.
