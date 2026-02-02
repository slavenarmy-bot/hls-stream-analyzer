# HLS Stream Analyzer — Project Summary & Progress

> อัพเดทล่าสุด: 31 มกราคม 2026
> GitHub: https://github.com/slavenarmy-bot/hls-stream-analyzer.git

---

## 1. สรุปโปรเจค

**ชื่อ**: HLS Stream Analyzer
**วัตถุประสงค์**: เว็บแอปสำหรับวิเคราะห์คุณภาพ HLS video stream ตรวจสอบ 9 quality metrics และสร้างรายงาน
**กลุ่มเป้าหมาย**: วิศวกรเครือข่าย, ทีม QoS, ทีมดูแล content delivery

---

## 2. สถาปัตยกรรม (Architecture)

```
┌──────────────────────────────────────────────┐
│              Docker Compose                   │
│                                               │
│  ┌─────────────────┐   ┌──────────────────┐  │
│  │   Next.js App   │   │ Python Analyzer  │  │
│  │   (port 3000)   │──>│   (port 8000)    │  │
│  │                 │   │                  │  │
│  │  - Dashboard    │   │  - Freeze detect │  │
│  │  - Auth/Users   │   │  - Black frame   │  │
│  │  - Playlists    │   │  - Mosaic detect │  │
│  │  - Testing      │   │  - A/V sync      │  │
│  │  - Reports      │   │  - Frame loss    │  │
│  │  - Schedule     │   │  - Latency/Jitter│  │
│  └────────┬────────┘   └──────────────────┘  │
│           │           app-network (bridge)    │
└───────────┼──────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐
   │ Neon PostgreSQL  │  (Cloud - ไม่อยู่ใน Docker)
   │   Database       │
   └─────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 16.1.6 |
| UI | shadcn/ui + Radix UI | Latest |
| Styling | Tailwind CSS | 4.0 |
| React | React | 19.2.3 |
| Auth | NextAuth.js | 5.0.0-beta.30 |
| ORM | Prisma | 7.3.0 |
| Database | Neon PostgreSQL | Cloud |
| Video Player | hls.js | 1.6.15 |
| Charts | Recharts | 3.7.0 |
| Drag & Drop | @dnd-kit | 6.3.1 |
| Python Backend | FastAPI + Uvicorn | 0.115.0 |
| Video Processing | PyAV + OpenCV | 12.3.0 / 4.10.0 |
| Deployment | Docker Compose | Latest |

---

## 4. โครงสร้างไฟล์หลัก

```
stream_hls_project/
├── src/
│   ├── app/
│   │   ├── (auth)/                   # Login, Register
│   │   ├── (dashboard)/              # Protected pages
│   │   │   ├── home/                 # หน้าแรก (ผลทดสอบล่าสุด 10 รายการ)
│   │   │   ├── playlists/            # จัดการ playlist
│   │   │   ├── testing/              # ทดสอบ stream
│   │   │   ├── reports/              # รายงาน (ภาษาไทย)
│   │   │   ├── dashboard/            # Real-time server monitoring
│   │   │   ├── schedule/             # ตั้งเวลาทดสอบอัตโนมัติ
│   │   │   └── users/                # จัดการ user (admin only)
│   │   └── api/                      # 17 API endpoints
│   ├── components/                   # UI components
│   ├── lib/
│   │   ├── auth.ts                   # NextAuth config
│   │   ├── prisma.ts                 # Prisma client
│   │   └── activity.ts               # Activity logging
│   └── middleware.ts                 # Route protection
├── prisma/
│   ├── schema.prisma                 # Database schema (6 tables)
│   └── seed.ts                       # Seed data
├── python-analyzer/
│   ├── main.py                       # FastAPI entry (POST /analyze, GET /health)
│   └── analyzer/                     # 6 analysis modules
│       ├── hls.py                    # HLS stream + latency/jitter/bitrate
│       ├── freeze.py                 # Freeze detection
│       ├── blackframe.py             # Black frame detection
│       ├── mosaic.py                 # Mosaic/blocking detection
│       ├── avsync.py                 # Audio-video sync
│       └── metrics.py                # Frame loss analysis
├── Dockerfile                        # Next.js (multi-stage, 3 stages)
├── docker-compose.yml                # Orchestration (2 services)
├── docker-entrypoint.sh              # Migration + start server
├── docker-prisma.config.ts           # Prisma config สำหรับ Docker
├── prisma.config.ts                  # Prisma config สำหรับ local dev
└── .env.example                      # Template environment variables
```

---

## 5. Database Schema (6 Tables)

| Table | สำคัญ | ความสัมพันธ์ |
|-------|--------|-------------|
| **User** | id, email, password, name, role (ADMIN/USER) | → Playlist, TestResult, ActivityLog, Notification, ScheduledTest |
| **Playlist** | id, name, userId | → PlaylistItem, ScheduledTest |
| **PlaylistItem** | id, channelName, url, sortOrder | → TestResult |
| **TestResult** | 9 quality metrics (JSON), status, duration | เก็บผลทดสอบทุกครั้ง |
| **ScheduledTest** | scheduledAt, recurrence (ONCE/DAILY/WEEKLY) | ตั้งเวลาทดสอบอัตโนมัติ |
| **ActivityLog** | action, details, ipAddress | บันทึกทุก action |
| **Notification** | title, message, isRead | แจ้งเตือน |

---

## 6. Quality Metrics (9 ตัว)

| # | Metric | วิเคราะห์โดย | ข้อมูลที่เก็บ |
|---|--------|-------------|--------------|
| 1 | Freeze Detection | Python (PyAV) | detected, count, timestamps[] |
| 2 | Mosaic/Blocking | Python (OpenCV) | detected, count, timestamps[] |
| 3 | Black Frames | Python (PyAV) | detected, count, timestamps[] |
| 4 | Audio-Video Sync | Python (PyAV) | detected, drift_ms |
| 5 | Frame Loss | Python (PyAV) | detected, dropped, total, dropRate% |
| 6 | Latency | Python (httpx) | float (ms) |
| 7 | Jitter | Python (httpx) | float (ms) |
| 8 | Bitrate | Python (httpx) | average, values[] |
| 9 | Buffer Health | Python (httpx) | totalDuration, segmentCount |

---

## 7. Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"

# Auth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Python Analyzer
PYTHON_ANALYZER_URL="http://localhost:8000"  # local dev
# PYTHON_ANALYZER_URL="http://analyzer:8000"  # Docker (auto-set)
```

**Default Admin Account**: `test@test.com` / `admin123`

---

## 8. Docker Deployment

### วิธี Deploy
```bash
# 1. Clone
git clone https://github.com/slavenarmy-bot/hls-stream-analyzer.git
cd hls-stream-analyzer

# 2. สร้าง .env
cp .env.example .env
# แก้ไขค่า DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Build และ Start
docker compose up --build -d

# 4. ดู logs
docker compose logs -f

# 5. ทดสอบ
curl http://localhost:3000     # → 307 redirect to /login
curl http://localhost:8000/health  # → {"status":"ok"}

# 6. หยุด
docker compose down
```

### Docker Configuration สำคัญ
- `AUTH_TRUST_HOST=true` — จำเป็นสำหรับ Auth.js ใน Docker/reverse proxy
- `docker-prisma.config.ts` — Prisma config แยกสำหรับ Docker (ไม่ใช้ dotenv)
- `npm ci --force` — แก้ปัญหา platform mismatch (macOS → Linux)
- `npm install --no-save --force prisma` — ติดตั้ง Prisma CLI ใน runner stage
- Health check ใช้ `wget -qO /dev/null` (ไม่ใช้ --spider เพราะ FastAPI ไม่รับ HEAD)

### รองรับ OS
- macOS (ทดสอบแล้ว)
- Windows (ผ่าน Docker Desktop + WSL2)
- Linux

---

## 9. ฟีเจอร์หลัก

1. **Authentication** — Login/Register, JWT session, 2 roles (ADMIN/USER)
2. **Playlist Management** — สร้าง/แก้ไข playlist, drag-drop จัดลำดับ
3. **Video Testing** — ทดสอบ URL หรือจาก playlist, เลือกระยะเวลา (10/30/60 วินาที)
4. **9 Quality Metrics** — วิเคราะห์คุณภาพ stream แบบครบถ้วน
5. **Reports** (ภาษาไทย) — ดูผลทดสอบ, filter, sort, export CSV
6. **Real-time Dashboard** — CPU/RAM monitoring ผ่าน SSE
7. **Scheduled Testing** — ตั้งเวลาทดสอบ (ONCE/DAILY/WEEKLY)
8. **User Management** — Admin จัดการ user ได้
9. **Activity Logging** — บันทึกทุก action
10. **Notifications** — ระบบแจ้งเตือน

---

## 10. สถานะการทำงานล่าสุด

### เสร็จสมบูรณ์แล้ว
- [x] พัฒนาเว็บแอป Next.js ครบทุกหน้า (8 หน้า + 2 auth pages)
- [x] พัฒนา Python Analyzer ครบทุก module (6 modules)
- [x] สร้าง API endpoints ครบ (17 routes)
- [x] Database schema + migrations (5 migrations)
- [x] Seed data (admin account + sample data)
- [x] Docker setup (Dockerfile, docker-compose.yml, entrypoint)
- [x] ทดสอบ Docker build + run สำเร็จ (2 รอบ)
- [x] แก้ไข bugs ที่พบระหว่างทดสอบ Docker
- [x] Push ทุกอย่างขึ้น GitHub

### Commits บน GitHub
1. `a47e3ff` — Initial commit: HLS Stream Analyzer with Docker support
2. `7be6850` — Fix Docker build issues found during testing
3. `103a1ad` — Add AUTH_TRUST_HOST for Docker production environment

### ปัญหาที่แก้ไขแล้ว (Docker)
1. `npm ci` platform mismatch → ใช้ `--force`
2. Health check 405 (HEAD request) → ใช้ `wget -qO /dev/null`
3. `prisma: not found` → ติดตั้ง Prisma CLI ใน runner
4. `Cannot find module 'valibot'` → ใช้ `npm install` แทน manual copy
5. `Cannot find module 'dotenv/config'` → สร้าง `docker-prisma.config.ts`
6. `UntrustedHost` error → เพิ่ม `AUTH_TRUST_HOST=true`

---

## 11. NPM Scripts

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed database with sample data
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:generate  # Generate Prisma client
```

---

## 12. หมายเหตุสำคัญ

- **ห้ามใช้ RLS** — ใช้ server-side API authorization แทน
- **Prisma 7.x** — ต้องใช้ `prisma.config.ts` + `defineConfig` (schema.prisma ไม่มี url ใน datasource)
- **Docker Desktop บน macOS** — binary อยู่ที่ `/Applications/Docker.app/Contents/Resources/bin/` (อาจไม่อยู่ใน PATH)
- **Database** — ใช้ Neon PostgreSQL (cloud) ไม่มี container แยก
- **File Storage** — ใช้ Vercel Blob (ยังไม่ได้ implement ในโปรเจคนี้)
