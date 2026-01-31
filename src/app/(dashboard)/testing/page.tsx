"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Shuffle, Activity, Loader2, Clock, StopCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import Hls from "hls.js";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Playlist {
  id: string;
  name: string;
  items: { id: string; channelName: string; url: string }[];
}

interface ChartPoint {
  time: number;
  bitrate: number;
  dropped: number;
  total: number;
}

interface Metrics {
  latency: number | null;
  jitter: number | null;
  bitrate: number | null;
  bandwidth: number | null;
  bufferHealth: number | null;
  droppedFrames: number;
  totalFrames: number;
  levels: number;
  currentLevel: number;
}

interface MinuteSnapshot {
  minute: number;
  latency: number | null;
  jitter: number | null;
  bitrate: number | null;
  bandwidth: number | null;
  bufferHealth: number | null;
  droppedFrames: number;
  totalFrames: number;
  freezeCount: number;
  blackFrameCount: number;
  mosaicCount: number;
  stallCount: number;
}

interface TestAccumulator {
  // Incremental latency/jitter tracking (no unbounded array)
  latencySum: number;
  latencyCount: number;
  prevLatency: number | null;
  jitterSum: number;
  jitterCount: number;
  // Incremental bitrate tracking
  bitrateSum: number;
  bitrateCount: number;
  bitrateMin: number;
  bitrateMax: number;
  // Incremental buffer tracking
  bufferSum: number;
  bufferCount: number;
  // Incremental A/V sync tracking
  avSyncSum: number;
  avSyncCount: number;
  avSyncIssueCount: number;
  // Counters
  freezeCount: number;
  freezeTotalDuration: number;
  lastVideoTime: number;
  lastCheckTime: number;
  blackFrameCount: number;
  mosaicCount: number;
  stallCount: number;
  stallDuration: number;
  // Timeline data for PDF charts (bounded by test duration)
  detectionTimeline: { sec: number; type: "freeze" | "blackFrame" | "mosaic" }[];
  bitrateTimeline: { sec: number; bitrate: number | null; bandwidth: number | null }[];
  // Per-minute tracking (reset every 60s, self-cleaning)
  minuteLatencySamples: number[];
  minuteBitrateSamples: number[];
  minuteBandwidthSamples: number[];
  minuteBufferSamples: number[];
  minuteFreezeCount: number;
  minuteBlackFrameCount: number;
  minuteMosaicCount: number;
  minuteStallCount: number;
  minuteDroppedFramesStart: number;
  minuteTotalFramesStart: number;
  minuteSnapshots: MinuteSnapshot[];
  secondsElapsed: number;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 วินาที" },
  { value: "300", label: "5 นาที" },
  { value: "600", label: "10 นาที" },
  { value: "900", label: "15 นาที" },
  { value: "1800", label: "30 นาที" },
];

export default function TestingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const testAccRef = useRef<TestAccumulator | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testIdRef = useRef<string | null>(null);
  const audioSbRef = useRef<SourceBuffer | null>(null);
  const videoSbRef = useRef<SourceBuffer | null>(null);
  const bufferTypeRef = useRef<"demuxed" | "muxed" | "unknown">("unknown");

  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [channelName, setChannelName] = useState(searchParams.get("channel") || "");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testDuration, setTestDuration] = useState("30");
  const [testProgress, setTestProgress] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({
    latency: null, jitter: null, bitrate: null, bandwidth: null, bufferHealth: null,
    droppedFrames: 0, totalFrames: 0, levels: 0, currentLevel: -1,
  });
  const metricsLatestRef = useRef<Metrics>(metrics);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [avSyncMode, setAvSyncMode] = useState<"demuxed" | "muxed" | "unknown">("unknown");
  const [avSyncOffset, setAvSyncOffset] = useState<number | null>(null);
  const [completedTestId, setCompletedTestId] = useState<string | null>(null);
  const [streamCodecInfo, setStreamCodecInfo] = useState<{
    hasAudio: boolean;
    audioCodec: string;
    audioTracks: number;
    videoCodec: string;
    resolution: string;
    frameRate: number | null;
  } | null>(null);

  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
    canvasRef.current.width = 64;
    canvasRef.current.height = 36;

    fetch("/api/playlists").then(r => r.ok ? r.json() : []).then(data => {
      const list = Array.isArray(data) ? data : [];
      Promise.all(
        list.map((p: { id: string }) =>
          fetch(`/api/playlists/${p.id}`).then(r => r.json())
        )
      ).then(setPlaylists);
    });

    return () => {
      stopStream();
    };
  }, []);


  const isBlackFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 64, 36);
    const imageData = ctx.getImageData(0, 0, 64, 36);
    const pixels = imageData.data;
    let totalBrightness = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      totalBrightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (pixels.length / 4);
    return avgBrightness < 16;
  }, []);

  /** Mosaic/blocking detection via blockiness score.
   *  Divides the frame into 8x8 blocks and measures boundary discontinuity
   *  (average absolute difference between adjacent block-edge pixels).
   *  A high score indicates blocking artefacts typical of heavy compression. */
  const isMosaic = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    // Canvas is 64x36; use 8-pixel blocks → 8 cols, 4 rows
    ctx.drawImage(video, 0, 0, 64, 36);
    const imgData = ctx.getImageData(0, 0, 64, 36);
    const d = imgData.data;
    const w = 64;
    const blockSize = 8;

    const luma = (idx: number) => (d[idx] + d[idx + 1] + d[idx + 2]) / 3;

    let boundarySum = 0;
    let boundaryCount = 0;

    // Horizontal block boundaries (every blockSize columns, compare adjacent pixels)
    for (let y = 0; y < 36; y++) {
      for (let bx = blockSize; bx < w; bx += blockSize) {
        const leftIdx = (y * w + bx - 1) * 4;
        const rightIdx = (y * w + bx) * 4;
        boundarySum += Math.abs(luma(leftIdx) - luma(rightIdx));
        boundaryCount++;
      }
    }

    // Vertical block boundaries (every blockSize rows)
    for (let x = 0; x < w; x++) {
      for (let by = blockSize; by < 36; by += blockSize) {
        const topIdx = ((by - 1) * w + x) * 4;
        const bottomIdx = (by * w + x) * 4;
        boundarySum += Math.abs(luma(topIdx) - luma(bottomIdx));
        boundaryCount++;
      }
    }

    const avgBoundaryDiff = boundaryCount > 0 ? boundarySum / boundaryCount : 0;
    // Threshold: a value > 30 indicates significant blocking artefacts
    return avgBoundaryDiff > 30;
  }, []);

  function startStream() {
    if (!url.trim()) {
      toast.error("กรุณาใส่ URL ของ HLS Stream");
      return;
    }

    stopStream();
    setChartData([]);
    setAvSyncMode("unknown");
    setAvSyncOffset(null);
    setStreamCodecInfo(null);
    audioSbRef.current = null;
    videoSbRef.current = null;
    bufferTypeRef.current = "unknown";

    if (!videoRef.current) return;


    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const v = videoRef.current;
        if (v) {
          // Start muted to satisfy autoplay policy, then unmute
          v.muted = true;
          v.play().then(() => {
            // Auto-unmute after playback starts
            v.muted = false;
          }).catch((err) => {
            console.warn("Autoplay blocked:", err);
            toast.info("กรุณากดปุ่ม Play บน Video Player เพื่อเริ่มเล่น");
          });
        }
        setIsPlaying(true);

        // Detect codec info from hls.js
        const audioTracks = hls.audioTracks || [];
        const level = hls.levels?.[hls.currentLevel >= 0 ? hls.currentLevel : 0];
        const audioCodec = level?.audioCodec || audioTracks[0]?.attrs?.CODECS || "unknown";
        const videoCodec = level?.videoCodec || level?.attrs?.CODECS?.split(",")[0] || "unknown";
        const width = level?.width || 0;
        const height = level?.height || 0;
        const frameRate = level?.attrs?.["FRAME-RATE"] ? parseFloat(level.attrs["FRAME-RATE"]) : null;

        setStreamCodecInfo({
          hasAudio: audioTracks.length > 0 || !!level?.audioCodec,
          audioCodec,
          audioTracks: audioTracks.length || (level?.audioCodec ? 1 : 0),
          videoCodec,
          resolution: width && height ? `${width}x${height}` : "unknown",
          frameRate,
        });
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          toast.error(`เกิดข้อผิดพลาด: ${data.type}`);
          stopStream();
        }
      });
      hls.on(Hls.Events.BUFFER_CREATED, (_, data) => {
        const tracks = data.tracks as Record<string, { buffer?: SourceBuffer }>;
        if (tracks["audio"]?.buffer && tracks["video"]?.buffer) {
          audioSbRef.current = tracks["audio"].buffer;
          videoSbRef.current = tracks["video"].buffer;
          bufferTypeRef.current = "demuxed";
        } else {
          bufferTypeRef.current = "muxed";
        }
      });
      hlsRef.current = hls;

      metricsIntervalRef.current = setInterval(() => {
        if (!hlsRef.current || !videoRef.current) return;
        const h = hlsRef.current;
        const v = videoRef.current;

        const quality = (v as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number } }).getVideoPlaybackQuality?.();

        const acc = testAccRef.current;
        const currentLatency = h.latency || null;
        let currentJitter: number | null = null;

        if (acc && currentLatency != null) {
          acc.latencySum += currentLatency;
          acc.latencyCount++;
          acc.minuteLatencySamples.push(currentLatency);
          // Incremental jitter: track sum of consecutive absolute diffs
          if (acc.prevLatency != null) {
            acc.jitterSum += Math.abs(currentLatency - acc.prevLatency);
            acc.jitterCount++;
            currentJitter = acc.jitterSum / acc.jitterCount;
          }
          acc.prevLatency = currentLatency;
        }

        // Stream bitrate = declared bitrate of the currently playing quality level
        const currentLevel = h.currentLevel >= 0 ? h.levels?.[h.currentLevel] : null;
        const currentBitrate = currentLevel?.bitrate ? Math.round(currentLevel.bitrate / 1000) : null;
        // Bandwidth = estimated available download speed (network throughput)
        const currentBandwidth = h.bandwidthEstimate ? Math.round(h.bandwidthEstimate / 1000) : null;
        const currentBuffer = v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) - v.currentTime : null;

        if (acc) {
          if (currentBitrate != null) {
            acc.bitrateSum += currentBitrate;
            acc.bitrateCount++;
            if (currentBitrate < acc.bitrateMin) acc.bitrateMin = currentBitrate;
            if (currentBitrate > acc.bitrateMax) acc.bitrateMax = currentBitrate;
            acc.minuteBitrateSamples.push(currentBitrate);
          }
          if (currentBandwidth != null) {
            acc.minuteBandwidthSamples.push(currentBandwidth);
          }
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

          const now = Date.now();
          // Skip error detection in first 10 seconds (stream startup can cause false positives)
          const pastWarmup = acc.secondsElapsed >= 10;

          if (acc.lastVideoTime >= 0 && !v.paused && pastWarmup) {
            const timeDelta = (now - acc.lastCheckTime) / 1000;
            const videoTimeDelta = v.currentTime - acc.lastVideoTime;
            if (timeDelta > 0.5 && videoTimeDelta < 0.1) {
              acc.freezeCount++;
              acc.freezeTotalDuration += timeDelta;
              acc.minuteFreezeCount++;
              acc.detectionTimeline.push({ sec: acc.secondsElapsed, type: "freeze" });
            }
          }
          acc.lastVideoTime = v.currentTime;
          acc.lastCheckTime = now;

          if (pastWarmup && isBlackFrame()) {
            acc.blackFrameCount++;
            acc.minuteBlackFrameCount++;
            acc.detectionTimeline.push({ sec: acc.secondsElapsed, type: "blackFrame" });
          }

          if (pastWarmup && isMosaic()) {
            acc.mosaicCount++;
            acc.minuteMosaicCount++;
            acc.detectionTimeline.push({ sec: acc.secondsElapsed, type: "mosaic" });
          }

          // A/V Sync accumulator update (only during test)
          if (bufferTypeRef.current === "demuxed" && audioSbRef.current && videoSbRef.current) {
            try {
              const aSb = audioSbRef.current;
              const vSb = videoSbRef.current;
              if (aSb.buffered.length > 0 && vSb.buffered.length > 0) {
                const audioEnd = aSb.buffered.end(aSb.buffered.length - 1);
                const videoEnd = vSb.buffered.end(vSb.buffered.length - 1);
                const offsetMs = Math.round((videoEnd - audioEnd) * 1000);
                acc.avSyncSum += offsetMs;
                acc.avSyncCount++;
                if (Math.abs(offsetMs) > 80) {
                  acc.avSyncIssueCount++;
                }
              }
            } catch { /* SourceBuffer may be removed */ }
          }

          // Track seconds and create minute snapshots
          acc.secondsElapsed++;
          setTestProgress(acc.secondsElapsed);

          // Record bitrate/bandwidth every 10 seconds for PDF chart
          if (acc.secondsElapsed % 10 === 0) {
            acc.bitrateTimeline.push({
              sec: acc.secondsElapsed,
              bitrate: currentBitrate,
              bandwidth: currentBandwidth,
            });
          }

          if (acc.secondsElapsed % 60 === 0) {
            const minuteNum = acc.secondsElapsed / 60;
            const currentDropped = quality?.droppedVideoFrames || 0;
            const currentTotal = quality?.totalVideoFrames || 0;

            // Calculate per-minute jitter
            let minuteJitter: number | null = null;
            if (acc.minuteLatencySamples.length >= 2) {
              let sumDiff = 0;
              for (let i = 1; i < acc.minuteLatencySamples.length; i++) {
                sumDiff += Math.abs(acc.minuteLatencySamples[i] - acc.minuteLatencySamples[i - 1]);
              }
              minuteJitter = sumDiff / (acc.minuteLatencySamples.length - 1);
            }

            const snapshot: MinuteSnapshot = {
              minute: minuteNum,
              latency: acc.minuteLatencySamples.length > 0
                ? acc.minuteLatencySamples.reduce((a, b) => a + b, 0) / acc.minuteLatencySamples.length
                : null,
              jitter: minuteJitter,
              bitrate: acc.minuteBitrateSamples.length > 0
                ? Math.round(acc.minuteBitrateSamples.reduce((a, b) => a + b, 0) / acc.minuteBitrateSamples.length)
                : null,
              bandwidth: acc.minuteBandwidthSamples.length > 0
                ? Math.round(acc.minuteBandwidthSamples.reduce((a, b) => a + b, 0) / acc.minuteBandwidthSamples.length)
                : null,
              bufferHealth: acc.minuteBufferSamples.length > 0
                ? parseFloat((acc.minuteBufferSamples.reduce((a, b) => a + b, 0) / acc.minuteBufferSamples.length).toFixed(2))
                : null,
              droppedFrames: currentDropped - acc.minuteDroppedFramesStart,
              totalFrames: currentTotal - acc.minuteTotalFramesStart,
              freezeCount: acc.minuteFreezeCount,
              blackFrameCount: acc.minuteBlackFrameCount,
              mosaicCount: acc.minuteMosaicCount,
              stallCount: acc.minuteStallCount,
            };
            acc.minuteSnapshots.push(snapshot);

            // Reset per-minute counters
            acc.minuteLatencySamples = [];
            acc.minuteBitrateSamples = [];
            acc.minuteBandwidthSamples = [];
            acc.minuteBufferSamples = [];
            acc.minuteFreezeCount = 0;
            acc.minuteBlackFrameCount = 0;
            acc.minuteMosaicCount = 0;
            acc.minuteStallCount = 0;
            acc.minuteDroppedFramesStart = currentDropped;
            acc.minuteTotalFramesStart = currentTotal;
          }
        }

        // A/V Sync detection for UI — runs always when stream is playing (not just during test)
        if (bufferTypeRef.current === "demuxed" && audioSbRef.current && videoSbRef.current) {
          try {
            const aSb = audioSbRef.current;
            const vSb = videoSbRef.current;
            if (aSb.buffered.length > 0 && vSb.buffered.length > 0) {
              setAvSyncMode("demuxed");
              const audioEnd = aSb.buffered.end(aSb.buffered.length - 1);
              const videoEnd = vSb.buffered.end(vSb.buffered.length - 1);
              setAvSyncOffset(Math.round((videoEnd - audioEnd) * 1000));
            } else {
              setAvSyncMode("demuxed");
              setAvSyncOffset(null);
            }
          } catch {
            setAvSyncMode("muxed");
            setAvSyncOffset(null);
          }
        } else if (bufferTypeRef.current === "muxed") {
          setAvSyncMode("muxed");
          setAvSyncOffset(null);
        }

        const newMetrics: Metrics = {
          latency: currentLatency,
          jitter: currentJitter,
          bitrate: currentBitrate,
          bandwidth: currentBandwidth,
          bufferHealth: currentBuffer,
          droppedFrames: quality?.droppedVideoFrames || 0,
          totalFrames: quality?.totalVideoFrames || 0,
          levels: h.levels?.length || 0,
          currentLevel: h.currentLevel,
        };
        setMetrics(newMetrics);
        metricsLatestRef.current = newMetrics;

        // Push chart data point
        setChartData(prev => {
          const currentDroppedCumulative = quality?.droppedVideoFrames ?? 0;
          const prevDroppedCumulative = prev.length > 0 ? prev[prev.length - 1].total : 0;
          const droppedThisSecond = Math.max(0, currentDroppedCumulative - prevDroppedCumulative);
          const point: ChartPoint = {
            time: prev.length + 1,
            bitrate: currentBitrate ?? 0,
            dropped: droppedThisSecond,
            total: currentDroppedCumulative,
          };
          // Keep last 300 points (5 minutes) to avoid memory bloat
          const next = [...prev, point];
          return next.length > 300 ? next.slice(-300) : next;
        });
      }, 1000);
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = url;
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      toast.error("เบราว์เซอร์ไม่รองรับ HLS");
    }
  }

  function stopStream() {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setIsPlaying(false);
    setMetrics({ latency: null, jitter: null, bitrate: null, bandwidth: null, bufferHealth: null, droppedFrames: 0, totalFrames: 0, levels: 0, currentLevel: -1 });
  }

  /** Save accumulated test results to server */
  async function saveTestResults(testId: string, actualDurationSec: number) {
    const m = metricsLatestRef.current;
    const acc = testAccRef.current;

    // Flush remaining partial minute snapshot
    if (acc && acc.secondsElapsed % 60 !== 0) {
      const partialMinute = Math.ceil(acc.secondsElapsed / 60);
      let partialJitter: number | null = null;
      if (acc.minuteLatencySamples.length >= 2) {
        let sumDiff = 0;
        for (let i = 1; i < acc.minuteLatencySamples.length; i++) {
          sumDiff += Math.abs(acc.minuteLatencySamples[i] - acc.minuteLatencySamples[i - 1]);
        }
        partialJitter = sumDiff / (acc.minuteLatencySamples.length - 1);
      }
      acc.minuteSnapshots.push({
        minute: partialMinute,
        latency: acc.minuteLatencySamples.length > 0
          ? acc.minuteLatencySamples.reduce((a, b) => a + b, 0) / acc.minuteLatencySamples.length
          : null,
        jitter: partialJitter,
        bitrate: acc.minuteBitrateSamples.length > 0
          ? Math.round(acc.minuteBitrateSamples.reduce((a, b) => a + b, 0) / acc.minuteBitrateSamples.length)
          : null,
        bandwidth: acc.minuteBandwidthSamples.length > 0
          ? Math.round(acc.minuteBandwidthSamples.reduce((a, b) => a + b, 0) / acc.minuteBandwidthSamples.length)
          : null,
        bufferHealth: acc.minuteBufferSamples.length > 0
          ? parseFloat((acc.minuteBufferSamples.reduce((a, b) => a + b, 0) / acc.minuteBufferSamples.length).toFixed(2))
          : null,
        droppedFrames: m.droppedFrames - acc.minuteDroppedFramesStart,
        totalFrames: m.totalFrames - acc.minuteTotalFramesStart,
        freezeCount: acc.minuteFreezeCount,
        blackFrameCount: acc.minuteBlackFrameCount,
        mosaicCount: acc.minuteMosaicCount,
        stallCount: acc.minuteStallCount,
      });
    }

    const jitterValue = acc && acc.jitterCount > 0
      ? acc.jitterSum / acc.jitterCount
      : null;

    const bitrateAvg = acc && acc.bitrateCount > 0
      ? acc.bitrateSum / acc.bitrateCount
      : null;
    const bitrateMin = acc && acc.bitrateCount > 0
      ? acc.bitrateMin
      : null;
    const bitrateMax = acc && acc.bitrateCount > 0
      ? acc.bitrateMax
      : null;

    const bufferAvg = acc && acc.bufferCount > 0
      ? acc.bufferSum / acc.bufferCount
      : null;

    const putRes = await fetch("/api/testing/" + testId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "COMPLETED",
        latency: m.latency,
        jitter: jitterValue,
        bitrate: bitrateAvg != null ? {
          detected: true,
          average: Math.round(bitrateAvg),
          min: bitrateMin,
          max: bitrateMax,
          unit: "kbps",
        } : { detected: false },
        bufferHealth: bufferAvg != null ? {
          detected: true,
          avgLevel: parseFloat(bufferAvg.toFixed(2)),
          stallCount: acc?.stallCount || 0,
          stallDuration: acc?.stallDuration || 0,
        } : { detected: false },
        freeze: {
          detected: (acc?.freezeCount || 0) > 0,
          count: acc?.freezeCount || 0,
          totalDuration: parseFloat((acc?.freezeTotalDuration || 0).toFixed(2)),
        },
        mosaic: {
          detected: (acc?.mosaicCount || 0) > 0,
          count: acc?.mosaicCount || 0,
        },
        blackFrame: {
          detected: (acc?.blackFrameCount || 0) > 0,
          count: acc?.blackFrameCount || 0,
          totalDuration: acc?.blackFrameCount || 0,
        },
        avSync: (() => {
          const count = acc?.avSyncCount || 0;
          if (count === 0) return { detected: false, offset_ms: 0, status: "normal" };
          const avgOffset = Math.round((acc?.avSyncSum || 0) / count);
          const issueCount = acc?.avSyncIssueCount || 0;
          const status = issueCount > 0 ? (Math.abs(avgOffset) > 200 ? "critical" : "warning") : "normal";
          return {
            detected: issueCount > 0,
            offset_ms: avgOffset,
            issueCount,
            status,
          };
        })(),
        lossFrame: {
          detected: m.droppedFrames > 0,
          dropped: m.droppedFrames,
          total: m.totalFrames,
          count: m.droppedFrames,
          percentage: m.totalFrames > 0 ? parseFloat((m.droppedFrames / m.totalFrames * 100).toFixed(2)) : 0,
        },
        minuteSnapshots: acc?.minuteSnapshots || [],
        detectionTimeline: acc?.detectionTimeline || [],
        bitrateTimeline: acc?.bitrateTimeline || [],
        duration: actualDurationSec,
      }),
    });

    if (putRes.ok) {
      setCompletedTestId(testId);
      toast.success("ทดสอบเสร็จสิ้น");
    } else {
      const errData = await putRes.json().catch(() => ({}));
      console.error("PUT failed:", putRes.status, errData);
      toast.error(`บันทึกผลทดสอบไม่สำเร็จ (${putRes.status}): ${errData?.error || "Unknown error"}`);
    }
  }

  function cleanupTest() {
    testAccRef.current = null;
    testTimeoutRef.current = null;
    testIdRef.current = null;
    setIsTesting(false);
    setTestProgress(0);
  }

  async function startTest() {
    if (!url.trim()) {
      toast.error("กรุณาใส่ URL ก่อนเริ่มทดสอบ");
      return;
    }

    const durationSec = parseInt(testDuration);
    setIsTesting(true);
    setTestProgress(0);
    setCompletedTestId(null);

    testAccRef.current = {
      latencySum: 0, latencyCount: 0, prevLatency: null,
      jitterSum: 0, jitterCount: 0,
      bitrateSum: 0, bitrateCount: 0, bitrateMin: Infinity, bitrateMax: -Infinity,
      bufferSum: 0, bufferCount: 0,
      avSyncSum: 0, avSyncCount: 0, avSyncIssueCount: 0,
      freezeCount: 0, freezeTotalDuration: 0,
      lastVideoTime: -1, lastCheckTime: Date.now(),
      blackFrameCount: 0, mosaicCount: 0,
      stallCount: 0, stallDuration: 0,
      detectionTimeline: [], bitrateTimeline: [],
      minuteLatencySamples: [], minuteBitrateSamples: [],
      minuteBandwidthSamples: [], minuteBufferSamples: [],
      minuteFreezeCount: 0, minuteBlackFrameCount: 0,
      minuteMosaicCount: 0, minuteStallCount: 0,
      minuteDroppedFramesStart: 0, minuteTotalFramesStart: 0,
      minuteSnapshots: [], secondsElapsed: 0,
    };

    try {
      const res = await fetch("/api/testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, channelName: channelName || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        testIdRef.current = data.id;
        const durationLabel = DURATION_OPTIONS.find(o => o.value === testDuration)?.label || testDuration;
        toast.success(`เริ่มทดสอบแล้ว (${durationLabel})`);

        startStream();

        testTimeoutRef.current = setTimeout(async () => {
          try {
            await saveTestResults(data.id, durationSec);
          } catch (err) {
            console.error("Test completion error:", err);
            toast.error("เกิดข้อผิดพลาดในการบันทึกผลทดสอบ");
          }
          cleanupTest();
        }, durationSec * 1000);
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
      cleanupTest();
    }
  }

  async function stopTestEarly() {
    const testId = testIdRef.current;
    const acc = testAccRef.current;
    if (!testId || !acc) return;

    // Cancel the pending timeout
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }

    const actualDuration = acc.secondsElapsed;
    try {
      await saveTestResults(testId, actualDuration);
    } catch (err) {
      console.error("Early stop error:", err);
      toast.error("เกิดข้อผิดพลาดในการบันทึกผลทดสอบ");
    }
    cleanupTest();
  }

  function handleRandomChannel() {
    const allItems = playlists.flatMap(p => p.items || []);
    if (allItems.length === 0) {
      toast.error("ไม่มีช่องรายการใน Playlist");
      return;
    }
    const random = allItems[Math.floor(Math.random() * allItems.length)];
    setUrl(random.url);
    setChannelName(random.channelName);
    toast.info(`สุ่มได้: ${random.channelName}`);
  }

  function handlePlaylistSelect(playlistId: string) {
    setSelectedPlaylist(playlistId);
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlist?.items?.length) {
      setUrl(playlist.items[0].url);
      setChannelName(playlist.items[0].channelName);
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s} วินาที`;
  }

  const durationSec = parseInt(testDuration);
  const durationLabel = DURATION_OPTIONS.find(o => o.value === testDuration)?.label || testDuration;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ทดสอบ Video Stream</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-black rounded-t-lg overflow-hidden">
                <video ref={videoRef} className="h-full w-full" controls playsInline />
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50">
                    <p>ใส่ URL แล้วกด เล่น เพื่อเริ่ม</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ตั้งค่าการทดสอบ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>เลือกจาก Playlist</Label>
                  <Select value={selectedPlaylist} onValueChange={handlePlaylistSelect}>
                    <SelectTrigger><SelectValue placeholder="เลือก Playlist..." /></SelectTrigger>
                    <SelectContent>
                      {playlists.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.items?.length || 0} ช่อง)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={handleRandomChannel}><Shuffle className="mr-2 h-4 w-4" />สุ่มช่อง</Button>
                </div>
              </div>

              <div>
                <Label htmlFor="channelName">ชื่อช่อง</Label>
                <Input id="channelName" value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="ระบุชื่อช่อง (ไม่บังคับ)" />
              </div>

              <div>
                <Label htmlFor="url">URL (HLS Stream)</Label>
                <Input id="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/stream.m3u8" />
              </div>

              <div>
                <Label>ระยะเวลาทดสอบ</Label>
                <Select value={testDuration} onValueChange={setTestDuration} disabled={isTesting}>
                  <SelectTrigger>
                    <Clock className="mr-2 h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                {!isPlaying ? (
                  <Button onClick={startStream}><Play className="mr-2 h-4 w-4" />เล่น</Button>
                ) : (
                  <Button variant="destructive" onClick={stopStream}><Square className="mr-2 h-4 w-4" />หยุด</Button>
                )}
                <Button onClick={startTest} disabled={isTesting} variant="secondary">
                  {isTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังทดสอบ...</> : <><Activity className="mr-2 h-4 w-4" />เริ่มทดสอบ ({durationLabel})</>}
                </Button>
                {isTesting && (
                  <Button onClick={stopTestEarly} variant="destructive">
                    <StopCircle className="mr-2 h-4 w-4" />สิ้นสุดการทดสอบ
                  </Button>
                )}
                {completedTestId && !isTesting && (
                  <Button
                    variant="outline"
                    onClick={() => router.push("/reports")}
                    className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                  >
                    <FileText className="mr-2 h-4 w-4" />เปิดรายงาน
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Metrics แบบ Real-time</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Latency</span>
                <Badge variant="secondary">{metrics.latency != null ? `${metrics.latency.toFixed(0)} ms` : "-"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Jitter</span>
                <Badge variant="secondary">{metrics.jitter != null ? `${metrics.jitter.toFixed(1)} ms` : "-"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stream Bitrate</span>
                <Badge variant="secondary">{metrics.bitrate != null ? `${metrics.bitrate} kbps` : "-"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Est. Bandwidth</span>
                <Badge variant="outline">{metrics.bandwidth != null ? `${metrics.bandwidth} kbps` : "-"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Buffer Health</span>
                <Badge variant="secondary">{metrics.bufferHealth != null ? `${metrics.bufferHealth.toFixed(1)} s` : "-"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Dropped Frames</span>
                <Badge variant={metrics.droppedFrames > 0 ? "destructive" : "secondary"}>
                  {metrics.droppedFrames} / {metrics.totalFrames}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Quality Levels</span>
                <Badge variant="secondary">{metrics.levels > 0 ? `${metrics.currentLevel + 1} / ${metrics.levels}` : "-"}</Badge>
              </div>
            </CardContent>
          </Card>

          {chartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Bitrate (kbps)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: "วินาที", position: "insideBottomRight", offset: -5, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`${value} kbps`, "Bitrate"]} labelFormatter={(label) => `${label} วินาที`} />
                    <Area type="monotone" dataKey="bitrate" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {chartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Dropped Frames (ต่อวินาที)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: "วินาที", position: "insideBottomRight", offset: -5, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(value) => [`${value} เฟรม`, "Dropped"]} labelFormatter={(label) => `${label} วินาที`} />
                    <Bar dataKey="dropped" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {isTesting && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">กำลังทดสอบ... {formatTime(testProgress)} / {durationLabel}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((testProgress / durationSec) * 100, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {isPlaying && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">สถานะโมดูลตรวจสอบ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Freeze Detection", color: "green" as const, count: testAccRef.current?.freezeCount },
                  { label: "Black Frame", color: "green" as const, count: testAccRef.current?.blackFrameCount },
                  { label: "Mosaic / Blocking", color: "green" as const, count: testAccRef.current?.mosaicCount },
                  { label: "Audio Track", color: (streamCodecInfo?.hasAudio ? "green" : "gray") as "green" | "yellow" | "gray", note: streamCodecInfo ? (streamCodecInfo.hasAudio ? streamCodecInfo.audioCodec : "ไม่พบเสียง") : undefined },
                  { label: "Loss Frame", color: "green" as const, count: metrics.droppedFrames },
                  { label: "Bitrate Monitor", color: (metrics.bitrate != null ? "green" : "gray") as "green" | "yellow" | "gray" },
                  { label: "Buffer Health", color: (metrics.bufferHealth != null ? "green" : "gray") as "green" | "yellow" | "gray" },
                  { label: "Latency / Jitter", color: (metrics.latency != null ? "green" : "gray") as "green" | "yellow" | "gray" },
                  { label: "A/V Sync", color: (isTesting ? (avSyncMode === "muxed" ? "yellow" : "green") : "gray") as "green" | "yellow" | "gray", count: testAccRef.current?.avSyncIssueCount, note: avSyncMode === "muxed" ? "muxed" : undefined },
                ].map((mod) => {
                  const dotColor = mod.color === "green" ? "bg-green-500 animate-pulse" : mod.color === "yellow" ? "bg-yellow-500 animate-pulse" : "bg-gray-300";
                  const textColor = mod.color !== "gray" ? "text-foreground" : "text-muted-foreground";
                  return (
                    <div key={mod.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
                        <span className={textColor}>{mod.label}</span>
                        {"note" in mod && mod.note && (
                          <span className="text-xs text-yellow-600">({mod.note})</span>
                        )}
                      </div>
                      {mod.count != null && mod.count > 0 && (
                        <Badge variant="destructive" className="text-xs">{mod.count}</Badge>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {streamCodecInfo && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Stream Codec Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Video Section */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Video</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Codec</span>
                        <Badge variant="secondary" className="font-mono text-xs">{streamCodecInfo.videoCodec}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Resolution</span>
                        <Badge variant="secondary">{streamCodecInfo.resolution}</Badge>
                      </div>
                      {streamCodecInfo.frameRate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Frame Rate</span>
                          <Badge variant="secondary">{streamCodecInfo.frameRate} fps</Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audio Section */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Audio</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <div className={`h-2.5 w-2.5 rounded-full ${streamCodecInfo.hasAudio ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                        <span>{streamCodecInfo.hasAudio ? "พบ Audio Track" : "ไม่พบ Audio Track"}</span>
                      </div>
                      {streamCodecInfo.hasAudio && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Codec</span>
                            <Badge variant="secondary" className="font-mono text-xs">{streamCodecInfo.audioCodec}</Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">จำนวน Track</span>
                            <Badge variant="secondary">{streamCodecInfo.audioTracks}</Badge>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* A/V Sync Message Box */}
          {isPlaying && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Audio-Video Sync</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Current Status */}
                {avSyncMode === "unknown" && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <div className="h-3 w-3 rounded-full bg-gray-400 animate-pulse" />
                    <div>
                      <p className="text-sm font-medium">กำลังรอข้อมูล...</p>
                      <p className="text-xs text-muted-foreground">ระบบจะเริ่มตรวจสอบเมื่อเริ่มทดสอบ</p>
                    </div>
                  </div>
                )}

                {avSyncMode === "muxed" && (
                  <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Muxed Stream</p>
                      <p className="text-xs text-yellow-700">Audio และ Video รวมอยู่ใน track เดียว ไม่สามารถวัดค่า A/V offset แยกได้</p>
                    </div>
                  </div>
                )}

                {avSyncMode === "demuxed" && avSyncOffset != null && (
                  <div className={`flex items-start gap-3 rounded-lg p-3 border ${
                    Math.abs(avSyncOffset) <= 40
                      ? "bg-green-50 border-green-200"
                      : Math.abs(avSyncOffset) <= 80
                        ? "bg-green-50 border-green-200"
                        : Math.abs(avSyncOffset) <= 200
                          ? "bg-yellow-50 border-yellow-200"
                          : "bg-red-50 border-red-200"
                  }`}>
                    <div className={`mt-0.5 h-3 w-3 rounded-full flex-shrink-0 ${
                      Math.abs(avSyncOffset) <= 80 ? "bg-green-500" : Math.abs(avSyncOffset) <= 200 ? "bg-yellow-500 animate-pulse" : "bg-red-500 animate-pulse"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${
                          Math.abs(avSyncOffset) <= 80 ? "text-green-800" : Math.abs(avSyncOffset) <= 200 ? "text-yellow-800" : "text-red-800"
                        }`}>
                          {Math.abs(avSyncOffset) <= 40 ? "ปกติ" : Math.abs(avSyncOffset) <= 80 ? "ยอมรับได้" : Math.abs(avSyncOffset) <= 200 ? "เสียงเริ่มเพี้ยน" : "เสียงไม่ตรงกับภาพ"}
                        </p>
                        <span className={`text-lg font-mono font-bold tabular-nums ${
                          Math.abs(avSyncOffset) <= 80 ? "text-green-700" : Math.abs(avSyncOffset) <= 200 ? "text-yellow-700" : "text-red-700"
                        }`}>
                          {avSyncOffset > 0 ? "+" : ""}{avSyncOffset} ms
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${
                        Math.abs(avSyncOffset) <= 80 ? "text-green-600" : Math.abs(avSyncOffset) <= 200 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {avSyncOffset > 0
                          ? "Video นำหน้า Audio " + avSyncOffset + " ms"
                          : avSyncOffset < 0
                            ? "Audio นำหน้า Video " + Math.abs(avSyncOffset) + " ms"
                            : "Audio และ Video ตรงกันพอดี"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Scale Reference */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">มาตรฐาน A/V Sync</p>
                  <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                    <div className="bg-green-500 flex-[40]" title="0-40ms: ดีมาก" />
                    <div className="bg-green-400 flex-[40]" title="40-80ms: ยอมรับได้" />
                    <div className="bg-yellow-400 flex-[120]" title="80-200ms: สังเกตได้" />
                    <div className="bg-red-500 flex-[100]" title=">200ms: มีปัญหา" />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0 ms</span>
                    <span>40</span>
                    <span>80</span>
                    <span>200 ms</span>
                    <span>300+ ms</span>
                  </div>
                  <div className="flex gap-3 flex-wrap mt-1">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-[10px] text-muted-foreground">ปกติ (&le;80ms)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">เริ่มเพี้ยน (80-200ms)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-[10px] text-muted-foreground">มีปัญหา (&gt;200ms)</span>
                    </div>
                  </div>
                </div>

                {/* Stats Summary (during testing) */}
                {isTesting && testAccRef.current && testAccRef.current.avSyncCount > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">สรุประหว่างทดสอบ</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ค่าเฉลี่ย</span>
                        <span className="font-mono font-medium">
                          {Math.round(testAccRef.current.avSyncSum / testAccRef.current.avSyncCount)} ms
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ตรวจแล้ว</span>
                        <span className="font-mono font-medium">{testAccRef.current.avSyncCount} ครั้ง</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ผิดปกติ</span>
                        <span className={`font-mono font-medium ${testAccRef.current.avSyncIssueCount > 0 ? "text-red-600" : "text-green-600"}`}>
                          {testAccRef.current.avSyncIssueCount} ครั้ง
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">อัตราปกติ</span>
                        <span className="font-mono font-medium">
                          {Math.round(((testAccRef.current.avSyncCount - testAccRef.current.avSyncIssueCount) / testAccRef.current.avSyncCount) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
