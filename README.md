# live-development-app

PoC de un **entorno de desarrollo local** estilo StackBlitz/bolt: una consola que
**lista y crea proyectos**, y un editor (Monaco) donde editas el código y ves el
**hot reload en vivo**.

Cada proyecto es una app Vite **completa e independiente** (sus archivos, su propio
`node_modules` y su **propio dev server**), persistida en un directorio configurable
fuera del repo. El editor solo la muestra en un **iframe** y le escribe archivos vía
API. El registro de proyectos se guarda en **SQLite** del lado del servidor.

## Arquitectura

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  EDITOR  (apps/web)           │        │  PROYECTOS (storage externo)  │
│  Hono + Vite middleware :3000 │        │  $PROJECTS_DIR/<slug>/        │
│                               │        │   package.json · node_modules │
│  · Consola: listar / crear ───┼──┐     │   vite.config.js · index.html │
│  · Editor: Monaco | <iframe>──┼──┼────▶│   src/UserApp.tsx             │
└──────────┬────────────────────┘  │     │   dev server propio :517x     │
           │ POST /api/file         │open └───────────────┬──────────────┘
           ▼                        │                     │ Vite del proyecto
   Hono escribe el archivo ─────────┘                     ▼ detecta → HMR → iframe
   SQLite registra el proyecto (db.ts)
```

- **Listar/crear**: la consola lee/escribe el registro en **SQLite** (`node:sqlite`,
  integrado, sin dependencias nativas). Crear un proyecto hace scaffold en disco +
  `pnpm install` (su propio `node_modules`) + alta en SQLite.
- **Abrir**: arranca (bajo demanda) el dev server propio del proyecto en un puerto
  libre y devuelve su URL; el editor lo embebe en un iframe.
- **Editar**: el editor tiene un **explorador de archivos** (árbol del proyecto) para
  abrir/crear/borrar archivos; cada uno se edita en Monaco con su lenguaje según la
  extensión. Guardar → `POST /api/file` → el servidor escribe el archivo → el Vite
  **del proyecto** hace HMR → el iframe se actualiza sin recargar el editor.
- **Gestionar**: cada tarjeta del listado permite **abrir** o **borrar** el proyecto
  (con confirmación; el borrado elimina dev server + carpeta + registro).

> SQLite va en el **servidor** (no en el navegador) porque es quien posee el
> filesystem y los dev servers; el navegador no podría ver esas carpetas ni puertos.

## Estructura (monorepo pnpm)

```
apps/
├── web/                      # EDITOR: React 19 + Vite + Monaco
│   ├── index.html            # fuentes: Bricolage Grotesque + JetBrains Mono
│   └── src/
│       ├── App.tsx               # router: listado ↔ editor (?p=<slug>)
│       └── components/
│           ├── ProjectList.tsx   # consola: grid de proyectos (abrir/borrar) + modal "crear"
│           ├── EditorView.tsx     # editor de un proyecto (explorer | Monaco | iframe)
│           ├── FileExplorer.tsx   # árbol de archivos (abrir/crear/borrar)
│           ├── Editor.tsx         # wrapper de Monaco (modelo + lenguaje por archivo)
│           ├── Preview.tsx        # iframe al dev server del proyecto
│           └── ConfirmModal.tsx   # confirmación reutilizable (borrados)
└── server/                   # Hono + @hono/node-server
    └── src/
        ├── index.ts          # sirve el editor (dev/prod)
        ├── projects.ts       # scaffold + install + dev servers por proyecto
        ├── db.ts             # SQLite: registro de proyectos
        ├── api.ts            # /api/projects, /api/file, …
        └── paths.ts          # rutas + puertos
```

## Uso

```bash
pnpm install
pnpm dev      # editor en :3000
```

Abre http://localhost:3000, crea un proyecto (nombre → se siembra e instala), ábrelo
y edita `src/UserApp.tsx`: el preview se actualiza en caliente.

## Variables de entorno

| Variable            | Por defecto                                  | Descripción                        |
| ------------------- | -------------------------------------------- | ---------------------------------- |
| `PORT`              | `3000`                                       | Puerto del editor                  |
| `PROJECTS_DIR`      | `~/.live-development-app/projects`           | Dónde se persisten los proyectos   |
| `PREVIEW_PORT_BASE` | `5174`                                       | Puerto base de los dev servers     |
| `DB_PATH`           | `$PROJECTS_DIR/registry.db`                  | Ruta de la base SQLite             |

## API

| Método | Ruta                          | Descripción                              |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/api/projects`               | Lista proyectos (desde SQLite) + estado  |
| POST   | `/api/projects`               | Crea `{ name }` → scaffold + install     |
| POST   | `/api/projects/:slug/open`    | Arranca el dev server → devuelve `url`   |
| DELETE | `/api/projects/:slug`         | Borra el proyecto (dev server + disco + SQLite) |
| GET    | `/api/tree?project=`          | Árbol de archivos (sin node_modules/dist) |
| GET    | `/api/file?project=&path=`    | Lee un archivo                           |
| POST   | `/api/file`                   | Escribe `{ project, path, content }` (crea si no existe) |
| DELETE | `/api/file?project=&path=`    | Borra un archivo                         |

Las rutas de archivo se resuelven **dentro** del proyecto; se rechaza el path
traversal (`../`).

## Diseño

Estética *engineering console*: near-black con rejilla blueprint, acento chartreuse
que señala "vivo/corriendo", tipografías **Bricolage Grotesque** (display) +
**JetBrains Mono** (UI), revelado escalonado de tarjetas y estados con punto
pulsante. Construido con la skill de diseño de frontend.

## Notas técnicas

- Cada proyecto es independiente (su `package.json`, `node_modules`, `vite.config.js`
  y dev server). El editor nunca lo importa ni lo bundlea.
- El editor usa Vite en *middleware mode* con `configFile: false` + plugin React
  inline (evita que el bundling de la config dispare reinicios de `tsx watch`).
- Los dev servers se fijan a IPv4 (`--host 127.0.0.1`) para que el chequeo de puerto
  libre sea consistente; los opens concurrentes se deduplican; al cerrar el editor se
  bajan todos los hijos.
