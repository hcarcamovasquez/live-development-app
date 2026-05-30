#!/bin/sh
set -e

# El contenedor arranca como root solo para preparar el volumen montado por
# Dokploy (que llega como root:root) y luego baja privilegios al usuario `dev`.
# Así el server y las terminales corren NO-root y comparten dueño de archivos.

DATA_DIR="/data"
mkdir -p "${PROJECTS_DIR:-/data/projects}"

# chown una sola vez (en el primer arranque / si el volumen se reinició). Evita
# recorrer node_modules enormes en cada boot.
if [ "$(stat -c %U "$DATA_DIR" 2>/dev/null || echo root)" != "dev" ]; then
  chown -R dev:dev "$DATA_DIR" 2>/dev/null || true
fi

exec gosu dev "$@"
