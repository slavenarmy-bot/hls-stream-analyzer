# Product Requirements Document (PRD)
# HLS Video Streaming Analysis Web Application

## 1. Overview

This is a web application developed using Claude Code to retrieve video streaming data using the HLS (HTTP Live Streaming) protocol, analyze each channel individually, and collect statistical data. It supports random channel selection from playlists for automated testing.

### Target Users
- Network engineers and QoS analysts monitoring video streaming quality
- Content delivery teams verifying stream health across channels

### Technology Stack
| Component | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + React + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Authentication | NextAuth.js (Credentials + JWT) |
| Database | Neon PostgreSQL via Prisma ORM |
| HLS Analysis Engine | Python FastAPI microservice (ffmpeg, OpenCV, PyAV) |
| Real-time Updates | Server-Sent Events (SSE) |
| Video Playback | hls.js |
| Charts | Recharts |
| Drag & Drop | @dnd-kit |

---

## 2. Application Pages

The application consists of 6 main pages:

| # | Page | Path | Description |
|---|---|---|---|
| 1 | Home | `/home` | Latest analysis results message box |
| 2 | Playlist Management | `/playlists` | Create/manage HLS channel playlists |
| 3 | Video Testing | `/testing` | Test HLS streams with 9 quality metrics |
| 4 | Reports | `/reports` | Historical test results in Thai language |
| 5 | Dashboard | `/dashboard` | Real-time server resource monitoring |
| 6 | User Management | `/users` | CRUD user administration (admin only) |

Additional pages:
- `/login` — User login
- `/register` — User registration

---

## 3. User Authentication System

### Requirements
- Users **must log in** before accessing any page in the application
- Unauthenticated users are redirected to the login page
- Support two roles: **ADMIN** and **USER**
- Password stored using bcrypt hashing

### Login Page
- Email and password input fields
- Error message display for invalid credentials
- Link to registration page
- Redirect to Home page on successful login

### Registration Page
- Fields: Name, Email, Password, Confirm Password
- Server-side validation using Zod
- Auto-login after successful registration

### Default Admin Account (Seed Data)
- Email: `test@test.com`
- Password: `admin123`

---

## 4. User Activity Recording & Reporting

### Activity Logging
All significant user actions are recorded:
- LOGIN / LOGOUT
- TEST_RUN (video analysis)
- PLAYLIST_CREATE / PLAYLIST_UPDATE / PLAYLIST_DELETE
- PLAYLIST_ITEM_ADD / PLAYLIST_ITEM_DELETE / PLAYLIST_ITEM_REORDER
- USER_CREATE / USER_UPDATE / USER_DELETE

### Activity Log Data
- User ID
- Action type
- Details (JSON)
- IP Address
- Timestamp

### Reporting
- Admin can view all users' activity logs
- Regular users can view their own activity logs
- Filterable by action type, date range, and user (admin)

---

## 5. Access Control

| Feature | ADMIN | USER |
|---|---|---|
| Home Page | Yes | Yes |
| Playlist Management (own) | Yes | Yes |
| Video Testing | Yes | Yes |
| Reports (own results) | Yes | Yes |
| Reports (all users) | Yes | No |
| Dashboard | Yes | Yes |
| User Management | Yes | No |
| Activity Logs (all users) | Yes | No |

---

## 6. Home Page

### Message Box — Latest Analysis Results
- Display the **10 most recent** test results for the logged-in user
- Each result card shows:
  - Channel name
  - Stream URL
  - Test status (Completed / Failed / Running)
  - Key metrics summary with pass/fail color-coded badges
  - Test timestamp
- Auto-refresh every 30 seconds
- Welcome message with guidance for new users with no test history

---

## 7. Playlist Management Page

### Playlist Features
- Each user can create **multiple playlists** (exclusive to that user)
- Playlist grid view showing: name, channel count, last updated date
- Create new playlist via dialog modal
- Edit playlist name (inline editing)
- Delete playlist with confirmation dialog

### Playlist Items (Channels)
- Each playlist contains multiple HLS channel entries
- Fields per item: Channel Name, HLS URL (.m3u8)
- **Drag-and-drop reordering** using @dnd-kit library
  - Drag handle icon on each item
  - Visual feedback during drag
  - Order persisted to database on drop
- Add new channel via form at bottom of list
- Delete individual channels

### Playlist API
- All playlists are scoped to the authenticated user
- Admin can view all users' playlists

---

## 8. Video Testing Page

### Input Methods
Two ways to select a stream for testing:

1. **Manual URL Entry**
   - Text input field for HLS URL (.m3u8)
   - "Test" button to start analysis

2. **Playlist Selection**
   - Dropdown to select a playlist
   - Dropdown to select a channel from the playlist
   - **"Random Channel" button** — randomly picks a channel from the selected playlist

### Test Configuration
- Duration selector: 10 seconds, 30 seconds, 60 seconds

### Video Player
- HLS playback using hls.js library
- Display video in the right column
- Real-time metrics overlay during playback

### 9 Quality Metrics Analyzed

| # | Metric | Description | Data Structure |
|---|---|---|---|
| 1 | **Freeze** | Screen freeze detection | `{ detected, count, totalDuration, timestamps[] }` |
| 2 | **Mosaic/Blocking** | Macro-blocking artifact detection | `{ detected, severity, frames[] }` |
| 3 | **Black Frame** | Black screen detection | `{ detected, count, totalDuration }` |
| 4 | **Audio-Video Sync** | A/V synchronization offset | `{ offset_ms, status }` |
| 5 | **Loss Frame** | Dropped/missing frames | `{ count, percentage }` |
| 6 | **Latency** | Stream delivery latency (ms) | `float` |
| 7 | **Jitter** | Delivery time variation (ms) | `float` |
| 8 | **Bitrate** | Stream bitrate | `{ average, min, max, unit }` |
| 9 | **Buffer Health** | Playback buffer status | `{ avgLevel, stallCount, stallDuration }` |

### Analysis Architecture
- **Client-side (hls.js)**: Captures real-time metrics — Latency, Jitter, Bitrate, Buffer Health
- **Server-side (Python FastAPI)**: Compute-heavy analysis — Freeze, Mosaic, Black Frame, A/V Sync, Frame Loss
- Results merged and stored in database upon completion

### Test Result Storage
- All results stored in TestResult table
- Status tracking: PENDING → RUNNING → COMPLETED / FAILED
- Historical results viewable on the Reports page

---

## 9. Reports Page (Thai Language)

### Language
All page headers, labels, table columns, and status messages are displayed in **Thai language** (ภาษาไทย).

### Table Columns
| Thai Header | English | Field |
|---|---|---|
| ชื่อช่อง | Channel Name | channelName |
| URL | URL | url |
| สถานะ | Status | status |
| จอค้าง | Freeze | freeze |
| ภาพแตก | Mosaic | mosaic |
| จอดำ | Black Frame | blackFrame |
| เสียง/ภาพ | A/V Sync | avSync |
| เฟรมหาย | Frame Loss | lossFrame |
| ความหน่วง | Latency | latency |
| Jitter | Jitter | jitter |
| Bitrate | Bitrate | bitrate |
| Buffer | Buffer Health | bufferHealth |
| วันที่ทดสอบ | Test Date | testedAt |

### Features
- **Color-coded metrics**: Green (good), Yellow (warning), Red (bad)
- **Filters**: Date range, channel name search, status, playlist
- **Pagination**: Configurable page size
- **Sortable columns**: Click header to sort
- **Expandable rows**: Click to view full metric details
- **CSV Export**: Download filtered results as CSV file
- **Admin view**: See all users' results; regular users see only their own

---

## 10. Dashboard — Server Monitoring

### Real-time Server Status
Display server operating status and resource usage with configurable update intervals.

### Update Intervals
| Mode | Interval |
|---|---|
| Realtime | Every 2 seconds |
| 1 min | Every 60 seconds |
| 5 min | Every 300 seconds |
| 10 min | Every 600 seconds |

### Metrics Displayed
1. **CPU Usage**
   - Line chart showing usage over time (last 50 data points)
   - Current percentage display

2. **RAM Usage**
   - Area chart: used vs total memory
   - Current usage in GB / total GB

3. **Active Processes**
   - Top 10 processes by CPU usage
   - Process name, PID, CPU%, Memory%

4. **Python Analyzer Status**
   - Online/Offline indicator (green/red dot)
   - Last health check timestamp

### Technical Implementation
- Server-Sent Events (SSE) for real-time data streaming
- Auto-reconnect on connection drop
- Interval selector using shadcn/ui Tabs

---

## 11. User Management Page (CRUD)

### Access
- **Admin only** — Regular users cannot access this page
- Navigation link hidden for non-admin users

### User Table
| Column | Description |
|---|---|
| Name | User's display name |
| Email | Login email |
| Role | ADMIN or USER |
| Created Date | Account creation date |
| Last Activity | Most recent action timestamp |
| Actions | Edit, Delete buttons |

### CRUD Operations
- **Create**: Add new user via dialog form (name, email, password, role)
- **Read**: View user list with pagination
- **Update**: Edit user details via dialog (name, email, role, password reset)
- **Delete**: Remove user with confirmation dialog (prevent self-deletion)

---

## 12. Database Schema

### Entity Relationship

```
User (1) ──── (N) Playlist
User (1) ──── (N) TestResult
User (1) ──── (N) ActivityLog
User (1) ──── (N) Notification
Playlist (1) ── (N) PlaylistItem
PlaylistItem (1) ── (N) TestResult
```

### Tables

#### User
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| email | String | Unique |
| password | String | bcrypt hashed |
| name | String | Display name |
| role | Enum | ADMIN / USER |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

#### Playlist
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| name | String | Playlist name |
| userId | String | Foreign key → User |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

#### PlaylistItem
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| playlistId | String | Foreign key → Playlist |
| channelName | String | Channel display name |
| url | String | HLS stream URL (.m3u8) |
| sortOrder | Int | For drag-and-drop ordering |
| createdAt | DateTime | Auto |

#### TestResult
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| userId | String | Foreign key → User |
| playlistItemId | String? | Optional FK → PlaylistItem |
| url | String | Tested URL |
| channelName | String? | Channel name |
| freeze | Json? | Freeze detection results |
| mosaic | Json? | Mosaic/blocking results |
| blackFrame | Json? | Black frame results |
| avSync | Json? | Audio-video sync results |
| lossFrame | Json? | Frame loss results |
| latency | Float? | Latency in ms |
| jitter | Float? | Jitter in ms |
| bitrate | Json? | Bitrate statistics |
| bufferHealth | Json? | Buffer health data |
| status | Enum | PENDING/RUNNING/COMPLETED/FAILED |
| errorMessage | String? | Error details if failed |
| duration | Float? | Test duration in seconds |
| testedAt | DateTime | Auto |

#### ActivityLog
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| userId | String | Foreign key → User |
| action | String | Action type |
| details | String? | JSON details |
| ipAddress | String? | Client IP |
| createdAt | DateTime | Auto |

#### Notification
| Field | Type | Notes |
|---|---|---|
| id | String (CUID) | Primary key |
| userId | String | Foreign key → User |
| title | String | Notification title |
| message | String | Notification body |
| isRead | Boolean | Default false |
| createdAt | DateTime | Auto |

---

## 13. Non-Functional Requirements

### Security
- All passwords hashed with bcrypt
- JWT-based session management
- Route protection via Next.js middleware
- API routes validate user authorization
- No Row Level Security (RLS) — full server-side API

### Performance
- SSE for real-time dashboard (not WebSocket, for simplicity)
- Prisma connection pooling for Neon cold starts
- Python analyzer uses async FastAPI with thread pool for CPU-intensive tasks

### Responsive Design
- Mobile-friendly layout with collapsible sidebar
- Tables scrollable on small screens
- Touch-friendly drag-and-drop

### Data Seeding
- Admin account: `test@test.com` / `admin123`
- 2 sample regular users
- 3 sample playlists with 5-10 channels each
- 20 sample test results with varied metrics
- 50 sample activity log entries
- 5 sample notifications
