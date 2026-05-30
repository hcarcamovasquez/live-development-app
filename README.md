# live-development-app

PoC de un **entorno de desarrollo local** estilo StackBlitz/bolt: una consola que
**lista y crea proyectos**, y un editor (Monaco) donde editas el código y ves el
**hot reload en vivo**.

Cada proyecto es una app Vite **completa e independiente** (sus archivos, su propio
`node_modules` y su **propio dev server**), persistida en un directorio configurable
fuera del repo. El editor solo la muestra en un **iframe** y le escribe archivos vía
API. El registro de proyectos se guarda en **SQLite** del lado del servidor.

## Despliegue (manager + Dokploy)

Además del editor, hay un **manager** (`apps/manager`, sin auth) que lista/crea
**workspaces**: cada workspace se despliega **bajo demanda como un contenedor propio
del editor** vía la **API de Dokploy** (construido desde este repo con `Dockerfile`).

- **Editor** (`Dockerfile`, raíz): imagen de un workspace; un solo puerto
  (`PORT`, 3000) — terminal por `/ws/terminal` y preview por `/preview/<slug>/`
  (proxy mismo origen). Volumen `/data` (proyectos + SQLite). Requiere Node 24.
- **Manager** (`apps/manager/Dockerfile` + `docker-compose.yml`): se sube a Dokploy
  como Compose. Crea cada workspace con `application.create` → `saveGitProvider`
  (este repo) → `saveBuildType` (dockerfile) → `saveEnvironment` → `domain.create`
  (dominio aleatorio) → `application.deploy`, y muestra la URL resultante.
- Config por env (ver `.env.example`): `DOKPLOY_URL`, `DOKPLOY_API_KEY`,
  `DOKPLOY_ENVIRONMENT_ID`, `EDITOR_REPO_URL`, `WORKSPACE_DOMAIN_SUFFIX`, …
- Prerrequisito: subir este repo a un **git remoto** accesible por Dokploy.

```bash
docker build -t livedev-editor .                 # imagen del editor (un workspace)
docker compose up   # manager local (con .env) → http://localhost:4000
```

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
  `git init` + commit inicial + alta en SQLite. **No instala ni arranca nada**
  automáticamente.
- **Ejecutar (Run/Stop)**: en el panel de terminal hay una pestaña especial **App**
  (no cerrable) con controles **Run/Stop** arriba. Run instala dependencias (si
  faltan) y levanta el dev server, transmitiendo la salida a esa terminal; el editor
  embebe la app en un iframe. La app **solo vive mientras el IDE está abierto** (se
  detiene al salir/cerrar). Gestionado por `apprunner.ts`.
- **Paneles**: explorador, editor, preview y terminal son **redimensionables**
  (arrastrando los divisores) y el **preview se puede ocultar/mostrar** (el editor
  se expande); los tamaños y visibilidad se recuerdan en localStorage.
- **Editar**: el editor tiene un **explorador de archivos** (árbol del proyecto,
  **carga perezosa** por nivel — muestra `node_modules` y todos los directorios) para
  abrir/crear/borrar archivos; cada uno se edita en Monaco con su lenguaje según la
  extensión. Guardar → `POST /api/file` → el servidor escribe el archivo → el Vite
  **del proyecto** (si está corriendo) hace HMR → el iframe se actualiza sin recargar.
- **Gestionar**: cada tarjeta del listado permite **abrir** o **borrar** el proyecto
  (con confirmación; el borrado elimina dev server + carpeta + registro).
- **Git integrado**: cada proyecto se crea como repo (`git init` + commit inicial) y
  con `simple-git` en devDependencies. El IDE incluye un panel **Source Control**
  (conmutable con la barra de actividad): rama, **stage por archivo**, **unstage**,
  **descartar cambios**, diff HEAD↔working con Monaco, y **commit** (del stage o de
  todo). El servidor usa **simple-git** (wrapper del binario `git`), así que la
  imagen Docker debe incluir `git` (`apt-get install git`).
- **Terminal integrada** (abajo, estilo WebStorm/VS Code): **PTYs reales**
  (`node-pty`) ancladas al directorio del proyecto, vía WebSocket + **xterm.js**.
  Permite recorrer el filesystem y ejecutar comandos (`ls`, `git`, `npm`, …), con
  **varias terminales en pestañas** (`+` para abrir, cada una con su sesión).
  Las sesiones son **persistentes en el servidor**: el PTY sobrevive a recargas del
  navegador (un `tail -f` sigue corriendo) y al reconectar se reenvía el scrollback;
  solo muere al cerrar la pestaña, por inactividad (30 min) o al apagar el editor.

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
| `TERMINAL_PORT`     | `3001`                                       | Puerto del WebSocket de terminales |
| `DB_PATH`           | `$PROJECTS_DIR/registry.db`                  | Ruta de la base SQLite             |

## API

| Método | Ruta                          | Descripción                              |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/api/projects`               | Lista proyectos (desde SQLite) + estado  |
| POST   | `/api/projects`               | Crea `{ name }` → scaffold + git (sin install) |
| DELETE | `/api/projects/:slug`         | Borra el proyecto (app + disco + SQLite) |
| GET    | `/api/app/:slug`              | Estado del dev server `{ status, url }`  |
| POST   | `/api/app/:slug/run`          | Run: instala (si falta) + arranca        |
| POST   | `/api/app/:slug/stop`         | Stop: detiene el dev server              |
| GET    | `/api/tree?project=&dir=`     | Un nivel del árbol (carga perezosa)      |
| GET    | `/api/file?project=&path=`    | Lee un archivo                           |
| POST   | `/api/file`                   | Escribe `{ project, path, content }` (crea si no existe) |
| DELETE | `/api/file?project=&path=`    | Borra un archivo                         |
| GET    | `/api/git/status?project=`    | Rama + cambios staged / unstaged          |
| GET    | `/api/git/diff?project=&path=`| Contenido HEAD vs working (para el diff)  |
| POST   | `/api/git/stage`              | Stage `{ project, path }` (`.` = todo)    |
| POST   | `/api/git/unstage`            | Quita del stage `{ project, path }`       |
| POST   | `/api/git/discard`            | Descarta `{ project, path, untracked }`   |
| POST   | `/api/git/commit`             | Commit `{ project, message, all? }`       |

Las rutas de archivo se resuelven **dentro** del proyecto; se rechaza el path
traversal (`../`).

## Diseño

Dos vistas con identidad propia, ambas construidas con la skill de diseño:

- **Listado (console)**: estética *engineering console* — near-black con rejilla
  blueprint, acento chartreuse que señala "vivo/corriendo", **Bricolage Grotesque**
  (display) + **JetBrains Mono**, tarjetas con revelado escalonado y punto pulsante.
- **Editor (IDE)**: emulación de **WebStorm/Darcula** — tool window *Project* con
  árbol e íconos por tipo, **pestañas** de archivos, **breadcrumbs**, **status bar**
  (posición del cursor, encoding, lenguaje), tema **Darcula** en Monaco con JetBrains
  Mono, y panel de **preview con chrome de navegador** (URL + recargar).

## Notas técnicas

- Cada proyecto es independiente (su `package.json`, `node_modules`, `vite.config.js`
  y dev server). El editor nunca lo importa ni lo bundlea.
- El editor usa Vite en *middleware mode* con `configFile: false` + plugin React
  inline (evita que el bundling de la config dispare reinicios de `tsx watch`).
- Los dev servers se fijan a IPv4 (`--host 127.0.0.1`) para que el chequeo de puerto
  libre sea consistente; los opens concurrentes se deduplican; al cerrar el editor se
  bajan todos los hijos.
