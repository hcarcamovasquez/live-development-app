#!/bin/sh
set -e

# El contenedor arranca como root solo para preparar el volumen montado por
# Dokploy (que llega como root:root) y luego baja privilegios al usuario `node`
# (uid 1000, ya existe en la imagen base node). Así el server y las terminales
# corren NO-root y comparten dueño de archivos.

DATA_DIR="/data"
mkdir -p "${PROJECTS_DIR:-/data/projects}"

# chown una sola vez (en el primer arranque / si el volumen se reinició). Evita
# recorrer node_modules enormes en cada boot.
if [ "$(stat -c %U "$DATA_DIR" 2>/dev/null || echo root)" != "node" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

exec gosu node "$@"
