# live-development-app

PoC de un **entorno de desarrollo local** estilo StackBlitz/bolt: editas el código
de una app desde el navegador (editor Monaco) y ves el **hot reload en vivo**.

La app editable es un **proyecto Vite COMPLETO e INDEPENDIENTE del editor**: vive
en un storage **externo al repo**, con sus propios archivos, su propio
`node_modules` y su **propio dev server**. El editor solo la muestra en un
**iframe** y le escribe los archivos vía API. Su build/HMR es totalmente
independiente.

## Arquitectura

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  EDITOR  (apps/web)          │         │  PROYECTO INDEPENDIENTE       │
│  Hono + Vite middleware      │         │  (storage externo al repo)    │
│  http://localhost:3000       │         │  ~/.live-development-app/...   │
│                              │         │  package.json · node_modules  │
│  ┌────────────┬───────────┐  │ iframe  │  vite.config.js · index.html  │
│  │  Monaco    │  <iframe>──┼──┼────────▶│  src/UserApp.tsx              │
│  │  editor    │  preview   │  │         │                               │
│  └────────────┴───────────┘  │         │  dev server PROPIO            │
│         │ POST /api/file      │         │  http://localhost:5174        │
└─────────┼───────────────────┘         └───────────────┬──────────────┘
          │ el server (Hono) escribe el archivo          │ Vite del proyecto
          └─────────────────────────────────────────────▶ detecta el cambio
                                                          └▶ HMR → el iframe
                                                             se actualiza solo
```

1. Editas en Monaco → ⌘/Ctrl+S → `POST /api/file`.
2. El servidor (Hono) escribe el archivo en el **proyecto externo**.
3. El **dev server propio del proyecto** (Vite, :5174) detecta el cambio.
4. HMR actualiza el **iframe** sin recargar el editor.

El servidor, al arrancar, hace **scaffold** del proyecto (si no existe), instala su
**node_modules** propio y levanta su **dev server**.

## Estructura (monorepo pnpm)

```
live-development-app/            # el EDITOR (monorepo)
├── pnpm-workspace.yaml
├── package.json                 # scripts raíz (dev / build / start)
└── apps/
    ├── web/                     # editor: React 19 + Vite + Monaco
    │   └── src/
    │       ├── App.tsx               # layout IDE (editor | iframe)
    │       └── components/           # Editor (Monaco) + Preview (iframe)
    └── server/                  # Hono + @hono/node-server
        └── src/
            ├── index.ts             # arranca el proyecto + sirve el editor
            ├── project.ts           # scaffold + install + dev server del proyecto
            ├── api.ts               # /api/file sobre el proyecto externo
            └── paths.ts             # rutas + puerto del preview

~/.live-development-app/project/  # el PROYECTO INDEPENDIENTE (storage externo)
├── package.json                  # sus propias deps
├── node_modules/                 # su propio node_modules
├── vite.config.js                # su propio dev server (:5174)
├── index.html
└── src/{main.tsx, UserApp.tsx}    # 👈 lo que editas en vivo
```

## Uso

```bash
pnpm install
pnpm dev      # editor en :3000; el proyecto se siembra/instala y corre en :5174
```

La **primera** ejecución hace scaffold del proyecto y un `pnpm install` dentro del
storage externo (crea su `node_modules`); las siguientes arrancan al instante.

Variables: `PORT` (editor, 3000), `PREVIEW_PORT` (proyecto, 5174),
`STORAGE_DIR` (ruta del proyecto externo).

## API (sobre el proyecto externo)

| Método | Ruta                  | Descripción                                  |
| ------ | --------------------- | -------------------------------------------- |
| GET    | `/api/project`        | URL del dev server del proyecto + ruta       |
| GET    | `/api/files`          | Lista `src/` del proyecto                    |
| GET    | `/api/file?path=...`  | Lee un archivo del proyecto                  |
| POST   | `/api/file`           | Escribe `{ path, content }` → dispara HMR    |
| GET    | `/api/health`         | Estado                                       |

Las rutas se resuelven **dentro** del proyecto; se rechaza el path traversal (`../`).

## Notas técnicas

- **Independencia total**: el proyecto tiene su propio `package.json`,
  `node_modules`, `vite.config.js` y dev server. El editor nunca lo importa ni lo
  bundlea; solo lo embebe por iframe y le escribe archivos.
- **Editor**: servido por Hono + Vite en *middleware mode* (`configFile: false` +
  plugin React inline para evitar que el bundling de la config dispare reinicios
  de `tsx watch`).
- El servidor libera el `PREVIEW_PORT` antes de arrancar el proyecto y baja el
  proceso hijo al recibir SIGINT/SIGTERM.
