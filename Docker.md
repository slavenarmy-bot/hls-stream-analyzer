# Docker Deployment Guide

> HLS Stream Analyzer — Docker-based Deployment

---

## Architecture

```
┌──────────────────────────────────────────┐
│            Docker Compose                │
│                                          │
│  ┌───────────────┐  ┌────────────────┐  │
│  │  Next.js App  │  │ Python Analyzer│  │
│  │  (port 3000)  │─>│  (port 8000)   │  │
│  │               │  │                │  │
│  │  Web UI +     │  │  HLS Analysis  │  │
│  │  Auth + API   │  │  9 Metrics     │  │
│  └───────┬───────┘  └────────────────┘  │
│          │                               │
└──────────┼───────────────────────────────┘
           │
           ▼
  ┌─────────────────┐
  │ Neon PostgreSQL  │  (Cloud DB — external)
  └─────────────────┘
```

**2 Services:**
- **nextjs** — Web application (Next.js 16, port 3000)
- **analyzer** — Video analysis microservice (FastAPI, port 8000, internal)

**Database:** Neon PostgreSQL (cloud) — ไม่อยู่ใน Docker

---

## ไฟล์ Docker ทั้งหมด

| ไฟล์ | หน้าที่ |
|------|---------|
| `Dockerfile` | Multi-stage build สำหรับ Next.js (3 stages: deps → builder → runner) |
| `python-analyzer/Dockerfile` | Multi-stage build สำหรับ Python Analyzer (2 stages: builder → runner) |
| `docker-compose.yml` | Orchestration สำหรับ **Coolify / Production** (ไม่มี ports, networks) |
| `docker-compose.local.yml` | Orchestration สำหรับ **Local Docker Desktop** (มี ports, networks, container_name) |
| `docker-entrypoint.sh` | Startup script — รัน Prisma migrations แล้วเริ่ม Next.js |
| `docker-prisma.config.ts` | Prisma config สำหรับ Docker (ไม่ใช้ dotenv) |
| `.dockerignore` | ไม่ส่ง node_modules, .next, .env เข้า build context |
| `python-analyzer/.dockerignore` | ไม่ส่ง __pycache__, venv เข้า build context |

---

## Environment Variables ที่ต้องตั้ง

| ตัวแปร | คำอธิบาย | ตัวอย่าง |
|--------|----------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@host.neon.tech/db?sslmode=require` |
| `NEXTAUTH_SECRET` | Secret key สำหรับ JWT session | `your-random-secret-key` |
| `NEXTAUTH_URL` | URL ของเว็บแอป | `https://your-domain.com` หรือ `http://SERVER_IP:3000` |

**Auto-configured (ไม่ต้องตั้งเอง):**
| ตัวแปร | ค่า | หมายเหตุ |
|--------|-----|----------|
| `AUTH_TRUST_HOST` | `true` | จำเป็นสำหรับ Auth.js ใน Docker/reverse proxy |
| `PYTHON_ANALYZER_URL` | `http://analyzer:8000` | Internal Docker network |

---

## วิธีที่ 1: Deploy บน Coolify (Production)

ใช้ `docker-compose.yml` (ไฟล์หลัก)

### ขั้นตอน

1. **เข้า Coolify Dashboard** → Project → Create New Resource

2. **เลือก Public Repository**
   - URL: `https://github.com/slavenarmy-bot/hls-stream-analyzer.git`
   - Branch: `main`

3. **เปลี่ยน Build Pack** เป็น **Docker Compose**
   - Docker Compose Location: `/docker-compose.yml`

4. **ตั้ง Environment Variables** ใน Coolify UI
   - `DATABASE_URL` = ค่า connection string ของ Neon
   - `NEXTAUTH_SECRET` = secret key
   - `NEXTAUTH_URL` = domain หรือ IP ของ server

5. **กำหนด Domain** ให้ nextjs service
   - ถ้ามี domain: `https://your-domain.com`
   - ถ้ายังไม่มี: `http://SERVER_IP:3000`
   - analyzer ไม่ต้องกำหนด (internal service)

6. **กด Deploy** → รอ build + health check ผ่าน

7. **ตรวจสอบ** — เปิดเว็บ ควรเห็นหน้า login

### docker-compose.yml (Coolify version)

```yaml
services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - AUTH_TRUST_HOST=true
      - PYTHON_ANALYZER_URL=http://analyzer:8000
    depends_on:
      analyzer:
        condition: service_healthy
    restart: unless-stopped

  analyzer:
    build:
      context: ./python-analyzer
      dockerfile: Dockerfile
    restart: unless-stopped
```

**ทำไมไม่มี ports, networks, container_name?**
- Coolify จัดการ networking ให้อัตโนมัติ
- Coolify + Traefik proxy จัดการ routing ให้
- Coolify ตั้งชื่อ container เอง (กำหนดเองจะ conflict)

---

## วิธีที่ 2: รันบน Docker Desktop (Local)

ใช้ `docker-compose.local.yml`

### ขั้นตอน

```bash
# 1. Clone project
git clone https://github.com/slavenarmy-bot/hls-stream-analyzer.git
cd hls-stream-analyzer

# 2. สร้าง .env
cp .env.example .env
# แก้ไขค่า DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Build และ Start (ใช้ไฟล์ local)
docker compose -f docker-compose.local.yml up --build -d

# 4. ดู logs
docker compose -f docker-compose.local.yml logs -f

# 5. ทดสอบ
curl http://localhost:3000        # → 307 redirect to /login
curl http://localhost:8000/health  # → {"status":"ok"}

# 6. หยุด
docker compose -f docker-compose.local.yml down
```

### docker-compose.local.yml (Local version)

```yaml
services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: stream-hls-nextjs
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - AUTH_TRUST_HOST=true
      - PYTHON_ANALYZER_URL=http://analyzer:8000
    depends_on:
      analyzer:
        condition: service_healthy
    networks:
      - app-network
    restart: unless-stopped

  analyzer:
    build:
      context: ./python-analyzer
      dockerfile: Dockerfile
    container_name: stream-hls-analyzer
    ports:
      - "8000:8000"
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
```

**ต่างจาก Coolify version ตรงไหน?**
- มี `container_name` — ตั้งชื่อให้ดูง่าย
- มี `ports` — เปิด port 3000 และ 8000 ให้เข้าถึงจาก host
- มี `networks` — กำหนด bridge network เอง

---

## รองรับ OS

| OS | สถานะ | หมายเหตุ |
|----|--------|----------|
| macOS | ทดสอบแล้ว | ใช้ Docker Desktop for Mac |
| Windows | รองรับ | ใช้ Docker Desktop + WSL2 |
| Linux | รองรับ | ใช้ Docker Engine โดยตรง |
| Coolify (VPS) | รองรับ | Deploy ผ่าน Coolify UI |

---

## Dockerfile Details

### Next.js (root Dockerfile)

| Stage | Base Image | หน้าที่ |
|-------|-----------|---------|
| deps | node:20-alpine | `npm ci --force` ติดตั้ง dependencies |
| builder | node:20-alpine | Generate Prisma client + Build Next.js |
| runner | node:20-alpine | Production image ขนาดเล็ก |

**สิ่งสำคัญใน runner stage:**
- `npm install --no-save --force prisma` — ติดตั้ง Prisma CLI สำหรับ runtime migrations
- `COPY docker-prisma.config.ts ./prisma.config.ts` — ใช้ config แยกไม่ต้อง dotenv
- Non-root user (`nextjs:nodejs`)
- Health check: `wget -qO /dev/null http://localhost:3000/`
- Entrypoint: `docker-entrypoint.sh` (migrations → start server)

### Python Analyzer (python-analyzer/Dockerfile)

| Stage | Base Image | หน้าที่ |
|-------|-----------|---------|
| builder | python:3.12-slim | Compile PyAV + FFmpeg dev libraries |
| runner | python:3.12-slim | Production image + runtime FFmpeg |

**สิ่งสำคัญ:**
- Virtual environment copied จาก builder
- Non-root user (`analyzer`)
- Health check: `wget -qO /dev/null http://localhost:8000/health`
- CMD: `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2`

---

## Startup Flow

```
1. docker-entrypoint.sh
   ├── npx prisma migrate deploy    ← อัพเดท database schema อัตโนมัติ
   └── exec node server.js          ← เริ่ม Next.js server

2. uvicorn main:app                 ← Python Analyzer เริ่มพร้อมกัน
```

---

## ปัญหาที่เคยเจอและแก้ไขแล้ว

| ปัญหา | สาเหตุ | วิธีแก้ |
|--------|--------|---------|
| `@next/swc-darwin-arm64` error | package-lock.json มี macOS package | `npm ci --force` |
| Health check 405 | `wget --spider` ส่ง HEAD request | ใช้ `wget -qO /dev/null` |
| `prisma: not found` | Prisma CLI ไม่อยู่ใน standalone | `npm install --no-save --force prisma` |
| `Cannot find module 'valibot'` | Prisma transitive dependencies | ใช้ npm install แทน manual copy |
| `Cannot find module 'dotenv/config'` | prisma.config.ts import dotenv | สร้าง docker-prisma.config.ts แยก |
| `UntrustedHost` error | Auth.js ใน production mode | เพิ่ม `AUTH_TRUST_HOST=true` |

---

## Quick Reference

```bash
# === Local Docker Desktop ===
docker compose -f docker-compose.local.yml up --build -d    # Build + Start
docker compose -f docker-compose.local.yml logs -f           # View logs
docker compose -f docker-compose.local.yml ps                # Check status
docker compose -f docker-compose.local.yml down              # Stop

# === Coolify ===
# ทุกอย่างจัดการผ่าน Coolify UI
# docker-compose.yml จะถูกใช้อัตโนมัติ
```
