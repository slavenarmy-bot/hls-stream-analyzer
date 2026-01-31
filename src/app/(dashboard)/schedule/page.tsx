"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Play,
  X,
  Loader2,
  Clock,
  CalendarPlus,
  StopCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import Hls from "hls.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Playlist {
  id: string;
  name: string;
  items: { id: string; channelName: string; url: string }[];
}

interface ManualChannel {
  url: string;
  channelName: string;
}

interface ScheduledTestRecord {
  id: string;
  name: string;
  playlistId: string | null;
  channels: ManualChannel[] | null;
  testDuration: number;
  scheduledAt: string;
  recurrence: string;
  status: string;
  lastRunAt: string | null;
  playlist: {
    id: string;
    name: string;
    items: { id: string; channelName: string; url: string }[];
  } | null;
}

interface MinuteSnapshot {
  minute: number;
  latency: number | null;
  jitter: number | null;
  bitrate: number | null;
  bufferHealth: number | null;
  droppedFrames: number;
  totalFrames: number;
  freezeCount: number;
  blackFrameCount: number;
  stallCount: number;
}

interface TestAccumulator {
  // Incremental tracking (no unbounded arrays)
  latencySum: number;
  latencyCount: number;
  prevLatency: number | null;
  jitterSum: number;
  jitterCount: number;
  bitrateSum: number;
  bitrateCount: number;
  bitrateMin: number;
  bitrateMax: number;
  bufferSum: number;
  bufferCount: number;
  // Counters
  freezeCount: number;
  freezeTotalDuration: number;
  blackFrameCount: number;
  stallCount: number;
  stallDuration: number;
  secondsElapsed: number;
  // Per-minute tracking (reset every 60s)
  minuteSnapshots: MinuteSnapshot[];
  minuteLatencySamples: number[];
  minuteBitrateSamples: number[];
  minuteBufferSamples: number[];
  minuteFreezeCount: number;
  minuteBlackFrameCount: number;
  minuteStallCount: number;
  minuteDroppedFramesStart: number;
  minuteTotalFramesStart: number;
  lastVideoTime: number;
  lastCheckTime: number;
}

interface RunningTest {
  testId: string;
  url: string;
  channelName: string;
  progress: number;
  status: "running" | "completed" | "failed";
  hls: Hls | null;
  video: HTMLVideoElement | null;
  acc: TestAccumulator;
  intervalId: ReturnType<typeof setInterval> | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DURATION_OPTIONS = [
  { value: "30", label: "30 วินาที" },
  { value: "300", label: "5 นาที" },
  { value: "600", label: "10 นาที" },
  { value: "900", label: "15 นาที" },
  { value: "1800", label: "30 นาที" },
];

const RECURRENCE_OPTIONS = [
  { value: "ONCE", label: "ครั้งเดียว" },
  { value: "DAILY", label: "ทุกวัน" },
  { value: "WEEKLY", label: "ทุกสัปดาห์" },
];

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SCHEDULED: "default",
  RUNNING: "secondary",
  COMPLETED: "outline",
  CANCELLED: "secondary",
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 border-blue-200",
  RUNNING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "รอดำเนินการ",
  RUNNING: "กำลังทดสอบ",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAccumulator(): TestAccumulator {
  return {
    latencySum: 0, latencyCount: 0, prevLatency: null,
    jitterSum: 0, jitterCount: 0,
    bitrateSum: 0, bitrateCount: 0, bitrateMin: Infinity, bitrateMax: -Infinity,
    bufferSum: 0, bufferCount: 0,
    freezeCount: 0, freezeTotalDuration: 0,
    blackFrameCount: 0, stallCount: 0, stallDuration: 0,
    secondsElapsed: 0, minuteSnapshots: [],
    minuteLatencySamples: [], minuteBitrateSamples: [],
    minuteBufferSamples: [],
    minuteFreezeCount: 0, minuteBlackFrameCount: 0, minuteStallCount: 0,
    minuteDroppedFramesStart: 0, minuteTotalFramesStart: 0,
    lastVideoTime: -1, lastCheckTime: Date.now(),
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} วินาที`;
  return `${Math.floor(seconds / 60)} นาที`;
}

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateUrl(url: string, max = 40): string {
  return url.length > max ? url.slice(0, max) + "..." : url;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  // --- Form state ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPlaylistId, setFormPlaylistId] = useState("");
  const [formManualChannels, setFormManualChannels] = useState<ManualChannel[]>([]);
  const [formDuration, setFormDuration] = useState("30");
  const [formScheduledAt, setFormScheduledAt] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("ONCE");
  const [submitting, setSubmitting] = useState(false);

  // --- Data state ---
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [schedules, setSchedules] = useState<ScheduledTestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Running tests state ---
  const [runningTests, setRunningTests] = useState<RunningTest[]>([]);
  const runningTestsRef = useRef<RunningTest[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runScheduleName, setRunScheduleName] = useState("");
  const [runDuration, setRunDuration] = useState(30);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync ref with state
  useEffect(() => {
    runningTestsRef.current = runningTests;
  }, [runningTests]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule");
      if (res.ok) {
        const data = await res.json();
        setSchedules(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("ไม่สามารถโหลดข้อมูลตารางทดสอบได้");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlaylists = useCallback(async () => {
    try {
      const res = await fetch("/api/playlists");
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;
      const detailed = await Promise.all(
        list.map((p: { id: string }) =>
          fetch(`/api/playlists/${p.id}`).then((r) => r.json())
        )
      );
      setPlaylists(detailed);
    } catch {
      // Playlists are optional – silent fail
    }
  }, []);

  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
    canvasRef.current.width = 64;
    canvasRef.current.height = 36;

    fetchSchedules();
    fetchPlaylists();

    // Cleanup all running tests on unmount
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const t of runningTestsRef.current) {
        cleanupSingleTest(t);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Black frame detection
  // ---------------------------------------------------------------------------

  const isBlackFrame = useCallback(
    (video: HTMLVideoElement): boolean => {
      const canvas = canvasRef.current;
      if (!canvas || video.readyState < 2) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, 64, 36);
      const imageData = ctx.getImageData(0, 0, 64, 36);
      const pixels = imageData.data;
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      }
      return total / (pixels.length / 4) < 16;
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  function resetForm() {
    setFormName("");
    setFormPlaylistId("");
    setFormManualChannels([]);
    setFormDuration("30");
    setFormScheduledAt("");
    setFormRecurrence("ONCE");
  }

  function addManualChannel() {
    setFormManualChannels((prev) => [...prev, { url: "", channelName: "" }]);
  }

  function updateManualChannel(
    index: number,
    field: keyof ManualChannel,
    value: string
  ) {
    setFormManualChannels((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function removeManualChannel(index: number) {
    setFormManualChannels((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!formName.trim()) {
      toast.error("กรุณาระบุชื่อการทดสอบ");
      return;
    }
    if (!formScheduledAt) {
      toast.error("กรุณาระบุวันเวลาที่ต้องการทดสอบ");
      return;
    }

    const hasPlaylist = !!formPlaylistId;
    const validChannels = formManualChannels.filter((c) => c.url.trim());

    if (!hasPlaylist && validChannels.length === 0) {
      toast.error("กรุณาเลือก Playlist หรือเพิ่ม URL อย่างน้อย 1 รายการ");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        testDuration: parseInt(formDuration),
        scheduledAt: new Date(formScheduledAt).toISOString(),
        recurrence: formRecurrence,
      };

      if (hasPlaylist) {
        body.playlistId = formPlaylistId;
      } else {
        body.channels = validChannels;
      }

      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("สร้างตารางทดสอบเรียบร้อยแล้ว");
        resetForm();
        setDialogOpen(false);
        fetchSchedules();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "ไม่สามารถสร้างตารางทดสอบได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการสร้างตารางทดสอบ");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule actions
  // ---------------------------------------------------------------------------

  async function cancelSchedule(id: string) {
    try {
      const res = await fetch(`/api/schedule/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (res.ok) {
        toast.success("ยกเลิกตารางทดสอบแล้ว");
        fetchSchedules();
      } else {
        toast.error("ไม่สามารถยกเลิกได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  async function deleteSchedule(id: string) {
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ลบตารางทดสอบแล้ว");
        fetchSchedules();
      } else {
        toast.error("ไม่สามารถลบได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  // ---------------------------------------------------------------------------
  // Save channel results
  // ---------------------------------------------------------------------------

  async function saveChannelResults(test: RunningTest) {
    const acc = test.acc;

    // Flush remaining partial minute snapshot
    if (acc.secondsElapsed % 60 !== 0) {
      const partialMinute = Math.ceil(acc.secondsElapsed / 60);
      const quality = (
        test.video as HTMLVideoElement & {
          getVideoPlaybackQuality?: () => {
            droppedVideoFrames: number;
            totalVideoFrames: number;
          };
        }
      )?.getVideoPlaybackQuality?.();

      let partialJitter: number | null = null;
      if (acc.minuteLatencySamples.length >= 2) {
        let sumDiff = 0;
        for (let i = 1; i < acc.minuteLatencySamples.length; i++) {
          sumDiff += Math.abs(
            acc.minuteLatencySamples[i] - acc.minuteLatencySamples[i - 1]
          );
        }
        partialJitter = sumDiff / (acc.minuteLatencySamples.length - 1);
      }

      acc.minuteSnapshots.push({
        minute: partialMinute,
        latency:
          acc.minuteLatencySamples.length > 0
            ? avg(acc.minuteLatencySamples)
            : null,
        jitter: partialJitter,
        bitrate:
          acc.minuteBitrateSamples.length > 0
            ? Math.round(avg(acc.minuteBitrateSamples))
            : null,
        bufferHealth:
          acc.minuteBufferSamples.length > 0
            ? parseFloat(avg(acc.minuteBufferSamples).toFixed(2))
            : null,
        droppedFrames:
          (quality?.droppedVideoFrames || 0) - acc.minuteDroppedFramesStart,
        totalFrames:
          (quality?.totalVideoFrames || 0) - acc.minuteTotalFramesStart,
        freezeCount: acc.minuteFreezeCount,
        blackFrameCount: acc.minuteBlackFrameCount,
        stallCount: acc.minuteStallCount,
      });
    }

    // Compute overall jitter (incremental)
    const jitterValue = acc.jitterCount > 0
      ? acc.jitterSum / acc.jitterCount
      : null;

    const bitrateAvg = acc.bitrateCount > 0
      ? acc.bitrateSum / acc.bitrateCount
      : null;
    const bitrateMin = acc.bitrateCount > 0
      ? acc.bitrateMin
      : null;
    const bitrateMax = acc.bitrateCount > 0
      ? acc.bitrateMax
      : null;
    const bufferAvg = acc.bufferCount > 0
      ? acc.bufferSum / acc.bufferCount
      : null;

    const quality = (
      test.video as HTMLVideoElement & {
        getVideoPlaybackQuality?: () => {
          droppedVideoFrames: number;
          totalVideoFrames: number;
        };
      }
    )?.getVideoPlaybackQuality?.();

    const droppedFrames = quality?.droppedVideoFrames || 0;
    const totalFrames = quality?.totalVideoFrames || 0;

    const avgLatency = acc.latencyCount > 0
      ? acc.latencySum / acc.latencyCount
      : null;

    try {
      const res = await fetch(`/api/testing/${test.testId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          latency: avgLatency,
          jitter: jitterValue,
          bitrate:
            bitrateAvg != null
              ? {
                  detected: true,
                  average: Math.round(bitrateAvg),
                  min: bitrateMin,
                  max: bitrateMax,
                  unit: "kbps",
                }
              : { detected: false },
          bufferHealth:
            bufferAvg != null
              ? {
                  detected: true,
                  avgLevel: parseFloat(bufferAvg.toFixed(2)),
                  stallCount: acc.stallCount,
                  stallDuration: acc.stallDuration,
                }
              : { detected: false },
          freeze: {
            detected: acc.freezeCount > 0,
            count: acc.freezeCount,
            totalDuration: parseFloat(acc.freezeTotalDuration.toFixed(2)),
          },
          mosaic: {
            detected: false,
            count: 0,
          },
          blackFrame: {
            detected: acc.blackFrameCount > 0,
            count: acc.blackFrameCount,
            totalDuration: acc.blackFrameCount,
          },
          avSync: {
            detected: false,
            offset_ms: 0,
            status: "normal",
          },
          lossFrame: {
            detected: droppedFrames > 0,
            dropped: droppedFrames,
            total: totalFrames,
            count: droppedFrames,
            percentage:
              totalFrames > 0
                ? parseFloat(((droppedFrames / totalFrames) * 100).toFixed(2))
                : 0,
          },
          minuteSnapshots: acc.minuteSnapshots,
          duration: acc.secondsElapsed,
        }),
      });

      if (!res.ok) {
        console.error(
          `Failed to save results for ${test.channelName}:`,
          res.status
        );
      }
    } catch (err) {
      console.error(`Error saving results for ${test.channelName}:`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup helpers
  // ---------------------------------------------------------------------------

  function cleanupSingleTest(test: RunningTest) {
    if (test.intervalId) clearInterval(test.intervalId);
    if (test.timeoutId) clearTimeout(test.timeoutId);
    if (test.hls) {
      test.hls.destroy();
      test.hls = null;
    }
    if (test.video) {
      test.video.pause();
      test.video.src = "";
      test.video.remove();
      test.video = null;
    }
  }

  function stopAllTests() {
    for (const t of runningTestsRef.current) {
      cleanupSingleTest(t);
    }
    setRunningTests([]);
    setIsRunning(false);
    toast.info("หยุดการทดสอบทั้งหมดแล้ว");
    fetchSchedules();
  }

  // ---------------------------------------------------------------------------
  // Concurrent test runner
  // ---------------------------------------------------------------------------

  async function startScheduleRun(schedule: ScheduledTestRecord) {
    if (isRunning) {
      toast.error("มีการทดสอบกำลังดำเนินการอยู่ กรุณารอให้เสร็จสิ้นก่อน");
      return;
    }

    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "ไม่สามารถเริ่มทดสอบได้");
        return;
      }

      const data = await res.json();
      const { scheduleName, testDuration, tests } = data as {
        scheduleName: string;
        testDuration: number;
        tests: { testResultId: string; url: string; channelName: string }[];
      };

      if (!tests || tests.length === 0) {
        toast.error("ไม่มีช่องรายการสำหรับทดสอบ");
        return;
      }

      setRunScheduleName(scheduleName);
      setRunDuration(testDuration);
      setIsRunning(true);

      // Initialize running test objects
      const initialTests: RunningTest[] = tests.map((t) => ({
        testId: t.testResultId,
        url: t.url,
        channelName: t.channelName || t.url,
        progress: 0,
        status: "running" as const,
        hls: null,
        video: null,
        acc: createAccumulator(),
        intervalId: null,
        timeoutId: null,
      }));

      setRunningTests(initialTests);
      runningTestsRef.current = initialTests;

      toast.success(
        `เริ่มทดสอบ ${tests.length} ช่อง (${formatDuration(testDuration)})`
      );

      // Start each channel concurrently
      for (let i = 0; i < initialTests.length; i++) {
        startSingleChannelTest(initialTests[i], testDuration, tests.length);
      }

      fetchSchedules();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเริ่มทดสอบ");
      setIsRunning(false);
    }
  }

  function startSingleChannelTest(
    test: RunningTest,
    durationSec: number,
    totalChannels: number
  ) {
    if (!Hls.isSupported()) {
      markTestFailed(test, "เบราว์เซอร์ไม่รองรับ HLS");
      return;
    }

    // Create hidden video element
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.display = "none";
    document.body.appendChild(video);
    test.video = video;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    test.hls = hls;

    hls.loadSource(test.url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        // Autoplay might be blocked – continue collecting what we can
      });
    });

    hls.on(Hls.Events.ERROR, (_, errorData) => {
      if (errorData.fatal) {
        console.error(`HLS fatal error for ${test.channelName}:`, errorData.type);
        markTestFailed(test, `HLS error: ${errorData.type}`);
      }
    });

    // Metrics collection interval (every 1 second)
    const intervalId = setInterval(() => {
      const acc = test.acc;
      const v = test.video;
      const h = test.hls;
      if (!v || !h) return;

      // Latency (incremental)
      const currentLatency = (h as Hls & { latency?: number }).latency || null;
      if (currentLatency != null) {
        acc.latencySum += currentLatency;
        acc.latencyCount++;
        acc.minuteLatencySamples.push(currentLatency);
        if (acc.prevLatency != null) {
          acc.jitterSum += Math.abs(currentLatency - acc.prevLatency);
          acc.jitterCount++;
        }
        acc.prevLatency = currentLatency;
      }

      // Bitrate (incremental)
      const currentBitrate = h.bandwidthEstimate
        ? Math.round(h.bandwidthEstimate / 1000)
        : null;
      if (currentBitrate != null) {
        acc.bitrateSum += currentBitrate;
        acc.bitrateCount++;
        if (currentBitrate < acc.bitrateMin) acc.bitrateMin = currentBitrate;
        if (currentBitrate > acc.bitrateMax) acc.bitrateMax = currentBitrate;
        acc.minuteBitrateSamples.push(currentBitrate);
      }

      // Buffer health (incremental)
      const currentBuffer =
        v.buffered.length > 0
          ? v.buffered.end(v.buffered.length - 1) - v.currentTime
          : null;
      if (currentBuffer != null) {
        acc.bufferSum += currentBuffer;
        acc.bufferCount++;
        acc.minuteBufferSamples.push(currentBuffer);
        if (currentBuffer < 0.5) {
          acc.stallCount++;
          acc.stallDuration += 1;
          acc.minuteStallCount++;
        }
      }

      // Freeze / Black frame detection — skip first 10 seconds (startup false positives)
      const now = Date.now();
      const pastWarmup = acc.secondsElapsed >= 10;

      if (acc.lastVideoTime >= 0 && !v.paused && pastWarmup) {
        const timeDelta = (now - acc.lastCheckTime) / 1000;
        const videoTimeDelta = v.currentTime - acc.lastVideoTime;
        if (timeDelta > 0.5 && videoTimeDelta < 0.1) {
          acc.freezeCount++;
          acc.freezeTotalDuration += timeDelta;
          acc.minuteFreezeCount++;
        }
      }
      acc.lastVideoTime = v.currentTime;
      acc.lastCheckTime = now;

      // Black frame detection
      if (pastWarmup && isBlackFrame(v)) {
        acc.blackFrameCount++;
        acc.minuteBlackFrameCount++;
      }

      // Progress
      acc.secondsElapsed++;
      test.progress = Math.min(
        Math.round((acc.secondsElapsed / durationSec) * 100),
        100
      );

      // Minute snapshot
      if (acc.secondsElapsed % 60 === 0) {
        const minuteNum = acc.secondsElapsed / 60;
        const quality = (
          v as HTMLVideoElement & {
            getVideoPlaybackQuality?: () => {
              droppedVideoFrames: number;
              totalVideoFrames: number;
            };
          }
        ).getVideoPlaybackQuality?.();
        const currentDropped = quality?.droppedVideoFrames || 0;
        const currentTotal = quality?.totalVideoFrames || 0;

        let minuteJitter: number | null = null;
        if (acc.minuteLatencySamples.length >= 2) {
          let sumDiff = 0;
          for (let i = 1; i < acc.minuteLatencySamples.length; i++) {
            sumDiff += Math.abs(
              acc.minuteLatencySamples[i] - acc.minuteLatencySamples[i - 1]
            );
          }
          minuteJitter = sumDiff / (acc.minuteLatencySamples.length - 1);
        }

        acc.minuteSnapshots.push({
          minute: minuteNum,
          latency:
            acc.minuteLatencySamples.length > 0
              ? avg(acc.minuteLatencySamples)
              : null,
          jitter: minuteJitter,
          bitrate:
            acc.minuteBitrateSamples.length > 0
              ? Math.round(avg(acc.minuteBitrateSamples))
              : null,
          bufferHealth:
            acc.minuteBufferSamples.length > 0
              ? parseFloat(avg(acc.minuteBufferSamples).toFixed(2))
              : null,
          droppedFrames: currentDropped - acc.minuteDroppedFramesStart,
          totalFrames: currentTotal - acc.minuteTotalFramesStart,
          freezeCount: acc.minuteFreezeCount,
          blackFrameCount: acc.minuteBlackFrameCount,
          stallCount: acc.minuteStallCount,
        });

        // Reset per-minute counters
        acc.minuteLatencySamples = [];
        acc.minuteBitrateSamples = [];
        acc.minuteBufferSamples = [];
        acc.minuteFreezeCount = 0;
        acc.minuteBlackFrameCount = 0;
        acc.minuteStallCount = 0;
        acc.minuteDroppedFramesStart = currentDropped;
        acc.minuteTotalFramesStart = currentTotal;
      }

      // Trigger UI update
      updateRunningTestUI();
    }, 1000);
    test.intervalId = intervalId;

    // Timeout to finish after durationSec
    const timeoutId = setTimeout(async () => {
      if (test.intervalId) clearInterval(test.intervalId);
      test.intervalId = null;

      await saveChannelResults(test);

      test.status = "completed";
      test.progress = 100;

      // Cleanup HLS
      if (test.hls) {
        test.hls.destroy();
        test.hls = null;
      }
      if (test.video) {
        test.video.pause();
        test.video.src = "";
        test.video.remove();
        test.video = null;
      }

      updateRunningTestUI();
      checkAllCompleted(totalChannels);
    }, durationSec * 1000);
    test.timeoutId = timeoutId;
  }

  function markTestFailed(test: RunningTest, reason: string) {
    test.status = "failed";
    if (test.intervalId) clearInterval(test.intervalId);
    test.intervalId = null;
    if (test.timeoutId) clearTimeout(test.timeoutId);
    test.timeoutId = null;
    cleanupSingleTest(test);
    console.error(`Test failed for ${test.channelName}: ${reason}`);
    updateRunningTestUI();
  }

  function updateRunningTestUI() {
    setRunningTests([...runningTestsRef.current]);
  }

  function checkAllCompleted(totalChannels: number) {
    const current = runningTestsRef.current;
    const done = current.filter(
      (t) => t.status === "completed" || t.status === "failed"
    );
    if (done.length === totalChannels) {
      const succeeded = current.filter((t) => t.status === "completed").length;
      const failed = current.filter((t) => t.status === "failed").length;

      if (failed > 0) {
        toast.warning(
          `ทดสอบเสร็จสิ้น: สำเร็จ ${succeeded} ช่อง, ล้มเหลว ${failed} ช่อง`
        );
      } else {
        toast.success(`ทดสอบทั้ง ${succeeded} ช่องเสร็จสิ้นเรียบร้อย`);
      }

      setIsRunning(false);
      fetchSchedules();
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  function getChannelCount(schedule: ScheduledTestRecord): number {
    if (schedule.playlist?.items) return schedule.playlist.items.length;
    if (Array.isArray(schedule.channels)) return schedule.channels.length;
    return 0;
  }

  function getType(schedule: ScheduledTestRecord): string {
    return schedule.playlistId ? "Playlist" : "Manual";
  }

  function getRecurrenceLabel(value: string): string {
    return RECURRENCE_OPTIONS.find((o) => o.value === value)?.label || value;
  }

  const completedCount = runningTests.filter(
    (t) => t.status === "completed" || t.status === "failed"
  ).length;
  const overallProgress =
    runningTests.length > 0
      ? Math.round(
          runningTests.reduce((sum, t) => sum + t.progress, 0) /
            runningTests.length
        )
      : 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ตั้งเวลาทดสอบ Video</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchSchedules}>
            <RefreshCw className="mr-2 h-4 w-4" />
            รีเฟรช
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <CalendarPlus className="mr-2 h-4 w-4" />
                สร้างตารางทดสอบใหม่
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>สร้างตารางทดสอบใหม่</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Name */}
                <div>
                  <Label htmlFor="schedule-name">ชื่อการทดสอบ</Label>
                  <Input
                    id="schedule-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="เช่น ทดสอบ IPTV ทุกวัน"
                  />
                </div>

                {/* Playlist select */}
                <div>
                  <Label>เลือก Playlist</Label>
                  <Select
                    value={formPlaylistId}
                    onValueChange={(val) => {
                      setFormPlaylistId(val);
                      if (val) setFormManualChannels([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="เลือก Playlist..." />
                    </SelectTrigger>
                    <SelectContent>
                      {playlists.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.items?.length || 0} ช่อง)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formPlaylistId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-xs"
                      onClick={() => setFormPlaylistId("")}
                    >
                      ล้างการเลือก Playlist
                    </Button>
                  )}
                </div>

                {/* Manual URLs */}
                <div>
                  <Label>หรือใส่ URL ด้วยตนเอง</Label>
                  <div className="space-y-2 mt-2">
                    {formManualChannels.map((ch, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <Input
                            placeholder="URL (เช่น https://...m3u8)"
                            value={ch.url}
                            onChange={(e) =>
                              updateManualChannel(idx, "url", e.target.value)
                            }
                          />
                          <Input
                            placeholder="ชื่อช่อง"
                            value={ch.channelName}
                            onChange={(e) =>
                              updateManualChannel(
                                idx,
                                "channelName",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeManualChannel(idx)}
                          className="mt-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addManualChannel}
                      disabled={!!formPlaylistId}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      เพิ่ม URL
                    </Button>
                    {formPlaylistId && formManualChannels.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        เลือก Playlist แล้ว ไม่สามารถเพิ่ม URL ด้วยตนเองได้
                      </p>
                    )}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <Label>ระยะเวลาทดสอบ</Label>
                  <Select value={formDuration} onValueChange={setFormDuration}>
                    <SelectTrigger>
                      <Clock className="mr-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Scheduled at */}
                <div>
                  <Label htmlFor="schedule-datetime">
                    วันเวลาที่ต้องการทดสอบ
                  </Label>
                  <Input
                    id="schedule-datetime"
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                  />
                </div>

                {/* Recurrence */}
                <div>
                  <Label>การทำซ้ำ</Label>
                  <Select
                    value={formRecurrence}
                    onValueChange={setFormRecurrence}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      "บันทึก"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ------- Scheduled Tests Table ------- */}
      <Card>
        <CardHeader>
          <CardTitle>รายการตารางทดสอบ</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                กำลังโหลดข้อมูล...
              </span>
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ยังไม่มีตารางทดสอบ กดปุ่ม &ldquo;สร้างตารางทดสอบใหม่&rdquo;
              เพื่อเริ่มต้น
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead className="text-center">จำนวนช่อง</TableHead>
                    <TableHead>ระยะเวลา</TableHead>
                    <TableHead>เวลาที่กำหนด</TableHead>
                    <TableHead>การทำซ้ำ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getType(s)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {getChannelCount(s)}
                      </TableCell>
                      <TableCell>{formatDuration(s.testDuration)}</TableCell>
                      <TableCell>{formatDatetime(s.scheduledAt)}</TableCell>
                      <TableCell>{getRecurrenceLabel(s.recurrence)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            STATUS_COLORS[s.status] || STATUS_COLORS.SCHEDULED
                          }`}
                        >
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status === "SCHEDULED" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => startScheduleRun(s)}
                              disabled={isRunning}
                            >
                              <Play className="mr-1 h-3 w-3" />
                              เริ่มทดสอบ
                            </Button>
                          )}
                          {(s.status === "SCHEDULED" ||
                            s.status === "RUNNING") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelSchedule(s.id)}
                            >
                              <X className="mr-1 h-3 w-3" />
                              ยกเลิก
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSchedule(s.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------- Concurrent Test Runner Panel ------- */}
      {runningTests.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Loader2
                  className={`h-5 w-5 ${isRunning ? "animate-spin" : ""}`}
                />
                {isRunning
                  ? `กำลังทดสอบ ${completedCount}/${runningTests.length} ช่อง`
                  : `ทดสอบเสร็จสิ้น ${completedCount}/${runningTests.length} ช่อง`}
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {runScheduleName} - {formatDuration(runDuration)}
                </span>
                {isRunning && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={stopAllTests}
                  >
                    <StopCircle className="mr-1 h-4 w-4" />
                    หยุดทั้งหมด
                  </Button>
                )}
              </div>
            </div>
            {/* Overall progress */}
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>ความคืบหน้ารวม</span>
                <span>{overallProgress}%</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ช่อง</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="w-[200px]">ความคืบหน้า</TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runningTests.map((t) => (
                    <TableRow key={t.testId}>
                      <TableCell className="font-medium">
                        {t.channelName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {truncateUrl(t.url)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-1000 ${
                                t.status === "failed"
                                  ? "bg-red-500"
                                  : t.status === "completed"
                                  ? "bg-green-500"
                                  : "bg-blue-500"
                              }`}
                              style={{ width: `${t.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {t.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {t.status === "running" && (
                          <Badge
                            variant={STATUS_VARIANTS.RUNNING}
                            className="bg-yellow-100 text-yellow-800"
                          >
                            กำลังทดสอบ
                          </Badge>
                        )}
                        {t.status === "completed" && (
                          <Badge
                            variant={STATUS_VARIANTS.COMPLETED}
                            className="bg-green-100 text-green-800"
                          >
                            เสร็จสิ้น
                          </Badge>
                        )}
                        {t.status === "failed" && (
                          <Badge variant="destructive">ล้มเหลว</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
