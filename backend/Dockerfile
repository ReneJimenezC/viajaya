# syntax=docker/dockerfile:1
# Dockerfile multi-stage: varias etapas, y la imagen final solo lleva lo necesario.

# ---------- Etapa base: común a todas ----------
# Node 24 (versión LTS) sobre Alpine Linux, una imagen pequeña
FROM node:24-alpine AS base
# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# ---------- Etapa deps: todas las dependencias (incluye las de desarrollo) ----------
FROM base AS deps
# Copia primero solo los manifiestos: si no cambian, Docker reutiliza esta capa en caché
COPY package.json package-lock.json ./
# Instala exactamente lo que dice el lockfile (falla si no coincide con package.json)
RUN npm ci

# ---------- Etapa build: compila TypeScript a JavaScript ----------
FROM deps AS build
# Configuración del compilador
COPY tsconfig.json tsconfig.build.json ./
# Código fuente
COPY src ./src
# Genera la carpeta dist/ con el JavaScript
RUN npm run build

# ---------- Etapa prod-deps: solo dependencias de producción ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
# --omit=dev deja fuera TypeScript, tipos y herramientas; luego se limpia la caché
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Etapa production: la imagen que se despliega ----------
FROM base AS production
# Express y otras librerías activan su modo producción con esta variable
ENV NODE_ENV=production
# Se copian las dependencias de producción y el código compilado.
# Quedan como propiedad de root: el usuario "node" puede leerlos pero no modificarlos.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Usuario sin privilegios que ya trae la imagen oficial (nunca correr como root)
USER node
# Documenta el puerto que usa la API (el real lo define la variable PORT)
EXPOSE 3000
# Docker pregunta cada 30 s a /health si la API responde (wget viene en Alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
# Se arranca con node directamente (no con npm) para que reciba las señales de apagado;
# --enable-source-maps hace que los errores apunten a la línea del .ts
CMD ["node", "--enable-source-maps", "dist/server.js"]