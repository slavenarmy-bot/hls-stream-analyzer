import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role, TestStatus } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.playlistItem.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.user.deleteMany();

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.create({
    data: {
      email: "test@test.com",
      password: adminPassword,
      name: "Admin User",
      role: Role.ADMIN,
    },
  });

  // Create regular users
  const userPassword = await bcrypt.hash("user123", 10);
  const user1 = await prisma.user.create({
    data: {
      email: "user1@test.com",
      password: userPassword,
      name: "User One",
      role: Role.USER,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: "user2@test.com",
      password: userPassword,
      name: "User Two",
      role: Role.USER,
    },
  });

  // Create playlists for admin
  const playlist1 = await prisma.playlist.create({
    data: {
      name: "Public Test Streams",
      userId: admin.id,
      items: {
        create: [
          { channelName: "Big Buck Bunny", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", sortOrder: 0 },
          { channelName: "Apple Bipbop", url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8", sortOrder: 1 },
          { channelName: "Sintel", url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8", sortOrder: 2 },
          { channelName: "Tears of Steel", url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8", sortOrder: 3 },
          { channelName: "Apple Advanced", url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8", sortOrder: 4 },
        ],
      },
    },
  });

  const playlist2 = await prisma.playlist.create({
    data: {
      name: "Live Test Channels",
      userId: admin.id,
      items: {
        create: [
          { channelName: "Test Pattern", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8", sortOrder: 0 },
          { channelName: "Akamai Test", url: "https://multiplatform-f.akamaihd.net/i/multi/will/bunny/big_buck_bunny_,640x360_400,640x360_700,640x360_1000,950x540_1500,.f4v.csmil/master.m3u8", sortOrder: 1 },
        ],
      },
    },
  });

  // Create playlist for user1
  await prisma.playlist.create({
    data: {
      name: "My Test Streams",
      userId: user1.id,
      items: {
        create: [
          { channelName: "Sample Stream 1", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", sortOrder: 0 },
          { channelName: "Sample Stream 2", url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8", sortOrder: 1 },
        ],
      },
    },
  });

  // Get playlist items for test results
  const playlistItems = await prisma.playlistItem.findMany({
    where: { playlistId: playlist1.id },
  });

  // Create sample test results
  const testData = [
    {
      userId: admin.id,
      playlistItemId: playlistItems[0]?.id,
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      channelName: "Big Buck Bunny",
      freeze: { detected: false, count: 0, totalDuration: 0, timestamps: [] },
      mosaic: { detected: false, severity: "none", frames: [] },
      blackFrame: { detected: false, count: 0, totalDuration: 0 },
      avSync: { offset_ms: 12, status: "good" },
      lossFrame: { count: 0, percentage: 0 },
      latency: 245.5,
      jitter: 18.3,
      bitrate: { average: 2500, min: 1800, max: 3200, unit: "kbps" },
      bufferHealth: { avgLevel: 15.2, stallCount: 0, stallDuration: 0 },
      status: TestStatus.COMPLETED,
      duration: 30,
    },
    {
      userId: admin.id,
      playlistItemId: playlistItems[1]?.id,
      url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
      channelName: "Apple Bipbop",
      freeze: { detected: true, count: 2, totalDuration: 3.5, timestamps: [5.2, 12.8] },
      mosaic: { detected: false, severity: "none", frames: [] },
      blackFrame: { detected: false, count: 0, totalDuration: 0 },
      avSync: { offset_ms: -5, status: "good" },
      lossFrame: { count: 3, percentage: 0.4 },
      latency: 380.2,
      jitter: 42.7,
      bitrate: { average: 1200, min: 800, max: 1600, unit: "kbps" },
      bufferHealth: { avgLevel: 8.5, stallCount: 1, stallDuration: 1.2 },
      status: TestStatus.COMPLETED,
      duration: 30,
    },
    {
      userId: admin.id,
      url: "https://invalid-stream.example.com/test.m3u8",
      channelName: "Failed Stream",
      status: TestStatus.FAILED,
      errorMessage: "Connection timeout - unable to fetch manifest",
      duration: 10,
    },
    {
      userId: admin.id,
      playlistItemId: playlistItems[2]?.id,
      url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
      channelName: "Sintel",
      freeze: { detected: false, count: 0, totalDuration: 0, timestamps: [] },
      mosaic: { detected: true, severity: "low", frames: [45, 67] },
      blackFrame: { detected: true, count: 1, totalDuration: 0.5 },
      avSync: { offset_ms: 85, status: "warning" },
      lossFrame: { count: 12, percentage: 1.6 },
      latency: 520.8,
      jitter: 65.4,
      bitrate: { average: 3800, min: 2200, max: 5000, unit: "kbps" },
      bufferHealth: { avgLevel: 6.3, stallCount: 3, stallDuration: 4.1 },
      status: TestStatus.COMPLETED,
      duration: 60,
    },
    {
      userId: user1.id,
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      channelName: "Big Buck Bunny",
      freeze: { detected: false, count: 0, totalDuration: 0, timestamps: [] },
      mosaic: { detected: false, severity: "none", frames: [] },
      blackFrame: { detected: false, count: 0, totalDuration: 0 },
      avSync: { offset_ms: 8, status: "good" },
      lossFrame: { count: 1, percentage: 0.1 },
      latency: 210.3,
      jitter: 15.1,
      bitrate: { average: 2800, min: 2000, max: 3500, unit: "kbps" },
      bufferHealth: { avgLevel: 18.0, stallCount: 0, stallDuration: 0 },
      status: TestStatus.COMPLETED,
      duration: 30,
    },
  ];

  for (const test of testData) {
    await prisma.testResult.create({ data: test });
  }

  // Create activity logs
  const activities = [
    { userId: admin.id, action: "LOGIN", details: "Logged in successfully" },
    { userId: admin.id, action: "PLAYLIST_CREATE", details: JSON.stringify({ playlistName: "Public Test Streams" }) },
    { userId: admin.id, action: "PLAYLIST_CREATE", details: JSON.stringify({ playlistName: "Live Test Channels" }) },
    { userId: admin.id, action: "TEST_RUN", details: JSON.stringify({ channelName: "Big Buck Bunny", status: "COMPLETED" }) },
    { userId: admin.id, action: "TEST_RUN", details: JSON.stringify({ channelName: "Apple Bipbop", status: "COMPLETED" }) },
    { userId: admin.id, action: "TEST_RUN", details: JSON.stringify({ channelName: "Failed Stream", status: "FAILED" }) },
    { userId: admin.id, action: "TEST_RUN", details: JSON.stringify({ channelName: "Sintel", status: "COMPLETED" }) },
    { userId: user1.id, action: "LOGIN", details: "Logged in successfully" },
    { userId: user1.id, action: "PLAYLIST_CREATE", details: JSON.stringify({ playlistName: "My Test Streams" }) },
    { userId: user1.id, action: "TEST_RUN", details: JSON.stringify({ channelName: "Big Buck Bunny", status: "COMPLETED" }) },
    { userId: admin.id, action: "USER_CREATE", details: JSON.stringify({ createdUser: "user1@test.com" }) },
    { userId: admin.id, action: "USER_CREATE", details: JSON.stringify({ createdUser: "user2@test.com" }) },
  ];

  for (const activity of activities) {
    await prisma.activityLog.create({ data: activity });
  }

  // Create notifications
  const notifications = [
    { userId: admin.id, title: "ยินดีต้อนรับ", message: "ยินดีต้อนรับเข้าสู่ระบบ HLS Stream Analyzer", isRead: true },
    { userId: admin.id, title: "ทดสอบสำเร็จ", message: "การทดสอบ Big Buck Bunny เสร็จสมบูรณ์ - ผ่านทุกตัวชี้วัด", isRead: false },
    { userId: admin.id, title: "ทดสอบล้มเหลว", message: "การทดสอบ Failed Stream ล้มเหลว - Connection timeout", isRead: false },
    { userId: admin.id, title: "คำเตือน", message: "พบปัญหา Mosaic ในช่อง Sintel - ตรวจสอบคุณภาพสัญญาณ", isRead: false },
    { userId: user1.id, title: "ยินดีต้อนรับ", message: "ยินดีต้อนรับเข้าสู่ระบบ HLS Stream Analyzer", isRead: false },
  ];

  for (const notification of notifications) {
    await prisma.notification.create({ data: notification });
  }

  console.log("Seeding completed!");
  console.log(`Created ${3} users, ${3} playlists, ${testData.length} test results, ${activities.length} activity logs, ${notifications.length} notifications`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
