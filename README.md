# ViajaYa

Sistema de reservas turísticas. Monorepo con `backend/` (API Node.js + Express + TypeScript) y `docs/` (Visión, SRS, SAD). El `frontend/` (React) se agregará después.

## Requisitos

- Node.js 22 o superior, npm
- Docker Desktop
- VS Code con la extensión REST Client (recomendada)

## Primer uso

```bash
# 1. Crear el archivo de variables a partir de la plantilla y cambiar la clave
cp .env.example .env

# 2. Instalar dependencias del backend
cd backend
npm ci
```

## Ejecutar

**Opción A: todo en Docker**

```bash
docker compose up -d --build   # levanta db + api
docker compose ps              # ambos deben quedar "healthy"
docker compose down            # detener (los datos se conservan)
```

**Opción B: base en Docker y API local con recarga automática**

```bash
docker compose up -d db
cd backend
npm run dev
```

Probar: abrir `backend/http/health.http` y pulsar "Send Request".

## Scripts del backend

| Script | Qué hace |
|---|---|
| `npm run dev` | Ejecuta la API con recarga automática al guardar |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la versión compilada |
| `npm run typecheck` | Revisa los tipos sin generar archivos |