"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Download, Filter, Search, FileText, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

interface DetectionEvent {
  sec: number;
  type: "freeze" | "blackFrame" | "mosaic";
}

interface BitrateTimePoint {
  sec: number;
  bitrate: number | null;
  bandwidth: number | null;
}

interface TestResult {
  id: string;
  url: string;
  channelName: string | null;
  status: string;
  testedAt: string;
  latency: number | null;
  jitter: number | null;
  duration: number | null;
  freeze: any;
  mosaic: any;
  blackFrame: any;
  avSync: any;
  lossFrame: any;
  bitrate: any;
  bufferHealth: any;
  minuteSnapshots: MinuteSnapshot[] | null;
  detectionTimeline: DetectionEvent[] | null;
  bitrateTimeline: BitrateTimePoint[] | null;
}

export default function ReportsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailResult, setDetailResult] = useState<TestResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function fetchResults() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter) params.set("channel", channelFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.ok) {
        setResults(await res.json());
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchResults(); }, []);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/testing/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailResult(data);
      } else {
        toast.error("ไม่สามารถดึงข้อมูลรายละเอียดได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setDetailLoading(false);
    }
  }

  async function deleteResult(id: string, channelName: string | null) {
    if (!confirm(`ต้องการลบรายงาน "${channelName || "ไม่ระบุชื่อช่อง"}" ใช่หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/testing/${id}`, { method: "DELETE" });
      if (res.ok) {
        setResults(prev => prev.filter(r => r.id !== id));
        if (detailResult?.id === id) setDetailResult(null);
        toast.success("ลบรายงานเรียบร้อยแล้ว");
      } else {
        toast.error("ลบรายงานไม่สำเร็จ");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  function downloadSinglePDF(r: TestResult) {
    openPDFWindow([r], `รายงานผลทดสอบ - ${r.channelName || "ไม่ระบุชื่อช่อง"}`);
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "COMPLETED": return <Badge className="bg-green-500">สำเร็จ</Badge>;
      case "FAILED": return <Badge variant="destructive">ล้มเหลว</Badge>;
      case "RUNNING": return <Badge className="bg-blue-500">กำลังทดสอบ</Badge>;
      default: return <Badge variant="secondary">รอดำเนินการ</Badge>;
    }
  }

  function getMetricCell(value: any, type?: string) {
    if (!value) return <span className="text-muted-foreground">-</span>;
    const detected = value.detected === true || value.count > 0;

    let detail = "";
    if (type === "freeze" && value.count != null) {
      detail = `${value.count} ครั้ง / ${value.totalDuration ?? 0}s`;
    } else if (type === "blackFrame" && value.count != null) {
      detail = `${value.count} ครั้ง`;
    } else if (type === "mosaic") {
      detail = value.severity ? `ระดับ: ${value.severity}` : "";
    } else if (type === "avSync" && value.offset_ms != null) {
      detail = `${value.offset_ms} ms`;
    } else if (type === "lossFrame") {
      if (value.dropped != null && value.total != null) {
        detail = `${value.dropped}/${value.total} (${value.percentage ?? 0}%)`;
      } else if (value.count != null && value.percentage != null) {
        detail = `${value.count} (${value.percentage}%)`;
      }
    } else if (type === "bitrate") {
      if (value.average != null) {
        detail = `avg ${value.average}`;
        if (value.min != null) detail += ` / min ${value.min}`;
        if (value.max != null) detail += ` / max ${value.max}`;
        detail += ` ${value.unit || "kbps"}`;
      } else if (value.estimated != null) {
        detail = `~${value.estimated} kbps`;
      }
    } else if (type === "bufferHealth") {
      if (value.avgLevel != null) {
        detail = `avg ${value.avgLevel}s`;
        if (value.stallCount > 0) detail += ` / stall ${value.stallCount}x`;
      } else if (value.seconds != null) {
        detail = `${Number(value.seconds).toFixed(1)}s`;
      }
    }

    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant={detected ? "destructive" : "secondary"} className="text-xs w-fit">
          {detected ? "พบปัญหา" : "ปกติ"}
        </Badge>
        {detail && <span className="text-[10px] text-muted-foreground leading-tight">{detail}</span>}
      </div>
    );
  }

  function exportCSV() {
    const headers = ["ชื่อช่อง", "URL", "สถานะ", "วันที่ทดสอบ", "ระยะเวลา", "Latency (ms)", "Jitter (ms)", "Freeze", "Mosaic", "Black Frame", "A/V Sync", "Loss Frame"];
    const rows = results.map(r => [
      r.channelName || "",
      r.url,
      r.status,
      new Date(r.testedAt).toLocaleString("th-TH"),
      r.duration ? formatDuration(r.duration) : "",
      r.latency?.toFixed(0) || "",
      r.jitter?.toFixed(1) || "",
      r.freeze?.detected ? "พบปัญหา" : "ปกติ",
      r.mosaic?.detected ? "พบปัญหา" : "ปกติ",
      r.blackFrame?.detected ? "พบปัญหา" : "ปกติ",
      r.avSync?.detected ? "พบปัญหา" : "ปกติ",
      r.lossFrame?.detected ? "พบปัญหา" : "ปกติ",
    ]);

    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("ส่งออก CSV สำเร็จ");
  }

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds} วินาที`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m} นาที ${s} วินาที` : `${m} นาที`;
  }

  /** Detection chart: plots cumulative count at the actual second each event occurred */
  function buildDetectionChartSVG(events: DetectionEvent[], durationSec: number): string {
    if (!events || events.length === 0) return "";

    const W = 960, H = 300, PAD = { top: 35, right: 25, bottom: 45, left: 55 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const TOTAL_SECONDS = Math.max(900, Math.ceil(durationSec / 60) * 60); // at least 15 min, round up

    // Build cumulative counts per type, sorted by time
    const types = [
      { type: "freeze" as const, color: "#3b82f6", label: "Freeze" },
      { type: "blackFrame" as const, color: "#111827", label: "Black Frame" },
      { type: "mosaic" as const, color: "#f97316", label: "Mosaic" },
    ];

    // Y axis: find max cumulative count
    let maxVal = 4;
    for (const t of types) {
      const count = events.filter(e => e.type === t.type).length;
      maxVal = Math.max(maxVal, count);
    }

    const xPos = (sec: number) => PAD.left + (sec / TOTAL_SECONDS) * plotW;
    const yPos = (val: number) => PAD.top + plotH - (val / maxVal) * plotH;

    // --- Y axis gridlines ---
    const gridLines: string[] = [];
    for (let v = 0; v <= maxVal; v++) {
      const y = yPos(v);
      gridLines.push(`<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#cbd5e1" stroke-width="1.2"/>`);
      gridLines.push(`<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${v}</text>`);
    }

    // --- X axis gridlines every 5 seconds ---
    const xGridLines: string[] = [];
    for (let sec = 5; sec <= TOTAL_SECONDS; sec += 5) {
      const x = xPos(sec);
      if (sec % 60 === 0) {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#cbd5e1" stroke-width="1.2"/>`);
        const min = sec / 60;
        xGridLines.push(`<text x="${x}" y="${H - PAD.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">${min}:00</text>`);
      } else if (sec % 30 === 0) {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="3,3"/>`);
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        xGridLines.push(`<text x="${x}" y="${H - PAD.bottom + 14}" text-anchor="middle" font-size="8" fill="#94a3b8">${min}:${String(s).padStart(2, "0")}</text>`);
      } else {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#f1f5f9" stroke-width="1.2"/>`);
      }
    }

    const xLabels = `<text x="${PAD.left}" y="${H - PAD.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">0:00</text>`;

    // --- Data series: cumulative step lines ---
    const dots: string[] = [];
    const lines: string[] = [];

    for (const t of types) {
      const typeEvents = events.filter(e => e.type === t.type).sort((a, b) => a.sec - b.sec);
      if (typeEvents.length === 0) continue;

      // Build cumulative points: start at 0, step up at each event second
      const points: { x: number; y: number; val: number; sec: number }[] = [];
      // Start at time 0 with count 0
      points.push({ x: xPos(0), y: yPos(0), val: 0, sec: 0 });

      let cumCount = 0;
      for (const ev of typeEvents) {
        cumCount++;
        const x = xPos(ev.sec);
        const y = yPos(cumCount);
        points.push({ x, y, val: cumCount, sec: ev.sec });
      }

      // Step-line path (horizontal then vertical)
      if (points.length > 1) {
        let pathD = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          // Horizontal to new x, then vertical to new y
          pathD += ` L${points[i].x},${points[i - 1].y} L${points[i].x},${points[i].y}`;
        }
        lines.push(`<path d="${pathD}" fill="none" stroke="${t.color}" stroke-width="2" opacity="0.8"/>`);
      }

      // Dots at each event (skip the origin point)
      const offset = t.type === "freeze" ? -3 : t.type === "mosaic" ? 3 : 0;
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        dots.push(`<circle cx="${p.x + offset}" cy="${p.y}" r="4" fill="${t.color}" stroke="white" stroke-width="1.5"/>`);
        // Show count label at every event if sparse, or at last point
        if (typeEvents.length <= 15 || i === points.length - 1) {
          dots.push(`<text x="${p.x + offset}" y="${p.y - 8}" text-anchor="middle" font-size="8" fill="${t.color}" font-weight="600">${p.val}</text>`);
        }
      }
    }

    // Legend
    const legend = types.map((t, i) => {
      const lx = PAD.left + 10 + i * 140;
      return `<circle cx="${lx}" cy="${14}" r="5" fill="${t.color}"/>
              <text x="${lx + 10}" y="${18}" font-size="11" fill="#333">${t.label}</text>`;
    }).join("");

    return `
      <h2 style="font-size:15px;margin:20px 0 8px;color:#1a1a2e;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">กราฟตรวจจับปัญหา (Freeze / Mosaic / Black Frame)</h2>
      <div style="text-align:center;margin-bottom:12px;">
        <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:white;border:1px solid #e2e8f0;border-radius:6px;max-width:${W}px;">
          ${legend}
          ${gridLines.join("")}
          ${xGridLines.join("")}
          <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="16" y="${PAD.top + plotH / 2}" text-anchor="middle" font-size="10" fill="#64748b" transform="rotate(-90,16,${PAD.top + plotH / 2})">จำนวนสะสม (ครั้ง)</text>
          <text x="${PAD.left + plotW / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#64748b">เวลา (นาที:วินาที)</text>
          ${xLabels}
          ${lines.join("")}
          ${dots.join("")}
        </svg>
      </div>
    `;
  }

  /** Bitrate & Bandwidth chart: plots data every 10 seconds */
  function buildBitrateChartSVG(data: BitrateTimePoint[], durationSec: number): string {
    if (!data || data.length === 0) return "";

    const hasBitrate = data.some(d => d.bitrate != null);
    const hasBandwidth = data.some(d => d.bandwidth != null);
    if (!hasBitrate && !hasBandwidth) return "";

    const W = 960, H = 300, PAD = { top: 35, right: 25, bottom: 45, left: 55 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const TOTAL_SECONDS = Math.max(900, Math.ceil(durationSec / 60) * 60);

    // Y axis
    let maxVal = 100;
    for (const d of data) {
      if (d.bitrate != null) maxVal = Math.max(maxVal, d.bitrate);
      if (d.bandwidth != null) maxVal = Math.max(maxVal, d.bandwidth);
    }
    maxVal = Math.ceil(maxVal / 500) * 500;
    if (maxVal < 500) maxVal = 500;

    const xPos = (sec: number) => PAD.left + (sec / TOTAL_SECONDS) * plotW;
    const yPos = (val: number) => PAD.top + plotH - (val / maxVal) * plotH;

    // --- Y axis gridlines ---
    const yStep = maxVal <= 2000 ? 500 : maxVal <= 5000 ? 1000 : 2000;
    const gridLines: string[] = [];
    for (let v = 0; v <= maxVal; v += yStep) {
      const y = yPos(v);
      gridLines.push(`<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#cbd5e1" stroke-width="1.2"/>`);
      gridLines.push(`<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "M" : v}</text>`);
    }

    // --- X axis gridlines ---
    const xGridLines: string[] = [];
    for (let sec = 5; sec <= TOTAL_SECONDS; sec += 5) {
      const x = xPos(sec);
      if (sec % 60 === 0) {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#cbd5e1" stroke-width="1.2"/>`);
        const min = sec / 60;
        xGridLines.push(`<text x="${x}" y="${H - PAD.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">${min}:00</text>`);
      } else if (sec % 30 === 0) {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="3,3"/>`);
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        xGridLines.push(`<text x="${x}" y="${H - PAD.bottom + 14}" text-anchor="middle" font-size="8" fill="#94a3b8">${min}:${String(s).padStart(2, "0")}</text>`);
      } else {
        xGridLines.push(`<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + plotH}" stroke="#f1f5f9" stroke-width="1.2"/>`);
      }
    }

    const xLabels = `<text x="${PAD.left}" y="${H - PAD.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">0:00</text>`;

    // --- Data series ---
    const series: { key: "bitrate" | "bandwidth"; color: string; label: string; fill: string }[] = [];
    if (hasBitrate) series.push({ key: "bitrate", color: "#3b82f6", label: "Stream Bitrate", fill: "#93c5fd" });
    if (hasBandwidth) series.push({ key: "bandwidth", color: "#10b981", label: "Est. Bandwidth", fill: "#6ee7b7" });

    const areas: string[] = [];
    const pathLines: string[] = [];
    const dots: string[] = [];

    for (const s of series) {
      const points: { x: number; y: number; val: number }[] = [];
      data.forEach((d) => {
        const val = d[s.key];
        if (val == null) return;
        const x = xPos(d.sec);
        const y = yPos(val);
        points.push({ x, y, val });
      });

      if (points.length > 0) {
        // Area fill
        const areaD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
          + `L${points[points.length - 1].x},${PAD.top + plotH}L${points[0].x},${PAD.top + plotH}Z`;
        areas.push(`<path d="${areaD}" fill="${s.fill}" opacity="0.2"/>`);

        // Line
        const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        pathLines.push(`<path d="${lineD}" fill="none" stroke="${s.color}" stroke-width="2"/>`);

        // Dots — show value labels only every 30s to avoid clutter
        points.forEach((p, idx) => {
          dots.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${s.color}" stroke="white" stroke-width="1"/>`);
          const dataItem = data[idx];
          if (dataItem && dataItem.sec % 30 === 0) {
            dots.push(`<text x="${p.x}" y="${p.y - 7}" text-anchor="middle" font-size="8" fill="${s.color}" font-weight="600">${p.val}</text>`);
          }
        });
      }
    }

    // Legend
    const legend = series.map((s, i) => {
      const lx = PAD.left + 10 + i * 180;
      return `<rect x="${lx - 6}" y="${9}" width="12" height="12" rx="2" fill="${s.fill}" stroke="${s.color}" stroke-width="1"/>
              <text x="${lx + 12}" y="${18}" font-size="11" fill="#333">${s.label} (kbps)</text>`;
    }).join("");

    return `
      <h2 style="font-size:15px;margin:20px 0 8px;color:#1a1a2e;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">กราฟ Stream Bitrate & Est. Bandwidth</h2>
      <div style="text-align:center;margin-bottom:12px;">
        <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:white;border:1px solid #e2e8f0;border-radius:6px;max-width:${W}px;">
          ${legend}
          ${gridLines.join("")}
          ${xGridLines.join("")}
          <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="16" y="${PAD.top + plotH / 2}" text-anchor="middle" font-size="10" fill="#64748b" transform="rotate(-90,16,${PAD.top + plotH / 2})">kbps</text>
          <text x="${PAD.left + plotW / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#64748b">เวลา (นาที:วินาที)</text>
          ${xLabels}
          ${areas.join("")}
          ${pathLines.join("")}
          ${dots.join("")}
        </svg>
      </div>
    `;
  }

  function buildChannelPageHTML(r: TestResult): string {
    const statusText = r.status === "COMPLETED" ? "สำเร็จ" : r.status === "FAILED" ? "ล้มเหลว" : r.status;
    const metricStatus = (val: any) => val?.detected ? '<span style="color:#dc2626;font-weight:600">พบปัญหา</span>' : '<span style="color:#16a34a;font-weight:600">ปกติ</span>';

    let snapshotRows = "";
    if (r.minuteSnapshots && r.minuteSnapshots.length > 0) {
      snapshotRows = r.minuteSnapshots.map((snap, i) => `
        <tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">
          <td style="border:1px solid #e2e8f0;padding:6px 10px;">${snap.minute}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;">${snap.latency != null ? snap.latency.toFixed(0) : "-"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;">${snap.jitter != null ? snap.jitter.toFixed(1) : "-"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;">${snap.bitrate != null ? snap.bitrate : "-"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;">${snap.bufferHealth != null ? snap.bufferHealth.toFixed(2) : "-"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;color:${snap.droppedFrames > 0 ? '#dc2626' : 'inherit'}">${snap.droppedFrames}/${snap.totalFrames}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;color:${snap.freezeCount > 0 ? '#dc2626' : '#16a34a'}">${snap.freezeCount > 0 ? snap.freezeCount + " ครั้ง" : "ปกติ"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;color:${snap.blackFrameCount > 0 ? '#dc2626' : '#16a34a'}">${snap.blackFrameCount > 0 ? snap.blackFrameCount + " ครั้ง" : "ปกติ"}</td>
          <td style="border:1px solid #e2e8f0;padding:6px 10px;color:${snap.stallCount > 0 ? '#dc2626' : '#16a34a'}">${snap.stallCount > 0 ? snap.stallCount + " ครั้ง" : "ปกติ"}</td>
        </tr>
      `).join("");
    }

    const snapshotTable = snapshotRows ? `
      <h2 style="font-size:15px;margin:20px 0 8px;color:#1a1a2e;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">ข้อมูลรายนาที</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">นาทีที่</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Latency (ms)</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Jitter (ms)</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Bitrate (kbps)</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Buffer (s)</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Dropped</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Freeze</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Black Frame</th>
            <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Stall</th>
          </tr>
        </thead>
        <tbody>${snapshotRows}</tbody>
      </table>
    ` : `<p style="color:#888;text-align:center;margin-top:12px;font-size:12px;">ไม่มีข้อมูลรายนาที</p>`;

    return `
      <div class="channel-page">
        <h1 style="font-size:20px;margin-bottom:6px;color:#1a1a2e;">${r.channelName || "ไม่ระบุชื่อช่อง"}</h1>
        <div style="color:#666;font-size:12px;margin-bottom:16px;">
          URL: ${r.url}<br/>
          วันที่ทดสอบ: ${new Date(r.testedAt).toLocaleString("th-TH")}
          | ระยะเวลา: ${r.duration ? formatDuration(r.duration) : "-"}
          | สถานะ: ${statusText}
        </div>

        <h2 style="font-size:15px;margin:12px 0 8px;color:#1a1a2e;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">สรุปผล Metrics</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
          <thead>
            <tr>
              <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">Metric</th>
              <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">สถานะ</th>
              <th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;font-weight:600;color:#475569;">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Latency</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.latency != null ? r.latency.toFixed(0) + " ms" : "-"}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.jitter != null ? "Jitter: " + r.jitter.toFixed(1) + " ms" : ""}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Stream Bitrate</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.bitrate?.average ? r.bitrate.average + " kbps (avg)" : "-"}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.bitrate?.min != null ? "Min: " + r.bitrate.min + " / Max: " + r.bitrate.max + " kbps" : ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Est. Bandwidth</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${(() => {
                const snaps = r.minuteSnapshots || [];
                const bwVals = snaps.map(s => s.bandwidth).filter((v): v is number => v != null);
                if (bwVals.length === 0) return "-";
                const avg = Math.round(bwVals.reduce((a, b) => a + b, 0) / bwVals.length);
                return avg + " kbps (avg)";
              })()}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${(() => {
                const snaps = r.minuteSnapshots || [];
                const bwVals = snaps.map(s => s.bandwidth).filter((v): v is number => v != null);
                if (bwVals.length === 0) return "";
                return "Min: " + Math.min(...bwVals) + " / Max: " + Math.max(...bwVals) + " kbps";
              })()}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Buffer Health</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.bufferHealth?.avgLevel != null ? r.bufferHealth.avgLevel + " s (avg)" : "-"}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.bufferHealth?.stallCount > 0 ? "Stall: " + r.bufferHealth.stallCount + " ครั้ง" : ""}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Freeze</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${metricStatus(r.freeze)}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.freeze?.count > 0 ? r.freeze.count + " ครั้ง / " + (r.freeze.totalDuration ?? 0) + "s" : ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Mosaic</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${metricStatus(r.mosaic)}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.mosaic?.severity ? "ระดับ: " + r.mosaic.severity : ""}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Black Frame</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${metricStatus(r.blackFrame)}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.blackFrame?.count > 0 ? r.blackFrame.count + " ครั้ง" : ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">A/V Sync</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${metricStatus(r.avSync)}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.avSync?.offset_ms != null ? r.avSync.offset_ms + " ms" : ""}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;">Loss Frame</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${metricStatus(r.lossFrame)}</td>
              <td style="border:1px solid #e2e8f0;padding:6px 10px;">${r.lossFrame?.dropped != null ? r.lossFrame.dropped + "/" + r.lossFrame.total + " (" + (r.lossFrame.percentage ?? 0) + "%)" : ""}</td>
            </tr>
          </tbody>
        </table>

        ${r.detectionTimeline && r.detectionTimeline.length > 0 ? buildDetectionChartSVG(r.detectionTimeline, r.duration || 900) : ""}

        ${r.bitrateTimeline && r.bitrateTimeline.length > 0 ? buildBitrateChartSVG(r.bitrateTimeline, r.duration || 900) : ""}

        ${snapshotTable}
      </div>
    `;
  }

  function downloadPDF() {
    if (!detailResult) return;
    openPDFWindow([detailResult], `รายงานผลทดสอบ - ${detailResult.channelName || "ไม่ระบุชื่อช่อง"}`);
  }

  function downloadAllPDF() {
    if (results.length === 0) {
      toast.error("ไม่มีข้อมูลให้ดาวน์โหลด");
      return;
    }
    openPDFWindow(results, `รายงานผลทดสอบทั้งหมด (${results.length} ช่อง)`);
  }

  function openPDFWindow(data: TestResult[], title: string) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("กรุณาอนุญาต popup เพื่อดาวน์โหลด PDF");
      return;
    }

    const pages = data.map((r, i) => {
      const pageHTML = buildChannelPageHTML(r);
      const pageBreak = i < data.length - 1 ? '<div style="page-break-after:always;"></div>' : '';
      return pageHTML + pageBreak;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; font-size: 14px; }
    .channel-page { padding: 10px 0; }
    .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print {
      body { padding: 15px; }
      @page { margin: 1cm; size: A4; }
    }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:20px;">
    <h1 style="font-size:24px;color:#1a1a2e;">HLS Analyzer - รายงานผลทดสอบ</h1>
    <p style="color:#666;font-size:13px;">จำนวน ${data.length} ช่อง | สร้างเมื่อ ${new Date().toLocaleString("th-TH")}</p>
  </div>
  <div style="page-break-after:always;"></div>
  ${pages}
  <div class="footer">รายงานนี้ถูกสร้างโดย HLS Analyzer เมื่อ ${new Date().toLocaleString("th-TH")}</div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">รายงานผลการทดสอบ</h1>
        <div className="flex gap-2">
          <Button onClick={downloadAllPDF} variant="outline">
            <FileText className="mr-2 h-4 w-4" />ดาวน์โหลด PDF ทั้งหมด
          </Button>
          <Button onClick={exportCSV} variant="outline">
            <Download className="mr-2 h-4 w-4" />ส่งออก CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />ตัวกรอง</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>สถานะ</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="COMPLETED">สำเร็จ</SelectItem>
                  <SelectItem value="FAILED">ล้มเหลว</SelectItem>
                  <SelectItem value="PENDING">รอดำเนินการ</SelectItem>
                  <SelectItem value="RUNNING">กำลังทดสอบ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ชื่อช่อง</Label>
              <Input value={channelFilter} onChange={e => setChannelFilter(e.target.value)} placeholder="ค้นหาชื่อช่อง..." />
            </div>
            <div>
              <Label>ตั้งแต่วันที่</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>ถึงวันที่</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={fetchResults} className="w-full"><Search className="mr-2 h-4 w-4" />ค้นหา</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">ไม่พบข้อมูล</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อช่อง</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>วันที่ทดสอบ</TableHead>
                    <TableHead>ระยะเวลา</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Bitrate</TableHead>
                    <TableHead>Buffer</TableHead>
                    <TableHead>Freeze</TableHead>
                    <TableHead>Mosaic</TableHead>
                    <TableHead>Black Frame</TableHead>
                    <TableHead>A/V Sync</TableHead>
                    <TableHead>Loss Frame</TableHead>
                    <TableHead className="text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.channelName || <span className="text-muted-foreground">ไม่ระบุ</span>}</TableCell>
                      <TableCell>{getStatusLabel(r.status)}</TableCell>
                      <TableCell className="text-sm">{new Date(r.testedAt).toLocaleString("th-TH")}</TableCell>
                      <TableCell className="text-sm">{r.duration ? formatDuration(r.duration) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span>{r.latency != null ? `${r.latency.toFixed(0)} ms` : "-"}</span>
                          {r.jitter != null && <span className="text-[10px] text-muted-foreground">jitter: {r.jitter.toFixed(1)} ms</span>}
                        </div>
                      </TableCell>
                      <TableCell>{getMetricCell(r.bitrate, "bitrate")}</TableCell>
                      <TableCell>{getMetricCell(r.bufferHealth, "bufferHealth")}</TableCell>
                      <TableCell>{getMetricCell(r.freeze, "freeze")}</TableCell>
                      <TableCell>{getMetricCell(r.mosaic, "mosaic")}</TableCell>
                      <TableCell>{getMetricCell(r.blackFrame, "blackFrame")}</TableCell>
                      <TableCell>{getMetricCell(r.avSync, "avSync")}</TableCell>
                      <TableCell>{getMetricCell(r.lossFrame, "lossFrame")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDetail(r.id)}
                            disabled={detailLoading}
                            title="ดูรายละเอียด"
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadSinglePDF(r)}
                            title="ดาวน์โหลด PDF"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteResult(r.id, r.channelName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="ลบรายงาน"
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

      {/* Detail Dialog */}
      <Dialog open={!!detailResult} onOpenChange={(open) => { if (!open) setDetailResult(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>รายงานผลทดสอบแบบละเอียด</span>
              <Button size="sm" variant="outline" onClick={downloadPDF}>
                <Download className="mr-1 h-3 w-3" />ดาวน์โหลด PDF
              </Button>
            </DialogTitle>
          </DialogHeader>

          {detailResult && (
            <div>
              <h1>{detailResult.channelName || "ไม่ระบุชื่อช่อง"}</h1>
              <div className="meta" style={{ color: "#666", fontSize: "13px", marginBottom: "16px" }}>
                URL: {detailResult.url}<br />
                วันที่ทดสอบ: {new Date(detailResult.testedAt).toLocaleString("th-TH")}<br />
                ระยะเวลาทดสอบ: {detailResult.duration ? formatDuration(detailResult.duration) : "-"}<br />
                สถานะ: {detailResult.status === "COMPLETED" ? "สำเร็จ" : detailResult.status === "FAILED" ? "ล้มเหลว" : detailResult.status}
              </div>

              <h2>สรุปผลโดยรวม</h2>
              <Separator className="mb-4" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Latency</div>
                  <div className="text-lg font-semibold">{detailResult.latency != null ? `${detailResult.latency.toFixed(0)} ms` : "-"}</div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Jitter</div>
                  <div className="text-lg font-semibold">{detailResult.jitter != null ? `${detailResult.jitter.toFixed(1)} ms` : "-"}</div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Bitrate (เฉลี่ย)</div>
                  <div className="text-lg font-semibold">{detailResult.bitrate?.average ? `${detailResult.bitrate.average} kbps` : "-"}</div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Buffer Health (เฉลี่ย)</div>
                  <div className="text-lg font-semibold">{detailResult.bufferHealth?.avgLevel != null ? `${detailResult.bufferHealth.avgLevel} s` : "-"}</div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Freeze</div>
                  <div className={`text-lg font-semibold ${detailResult.freeze?.detected ? "text-red-600" : "text-green-600"}`}>
                    {detailResult.freeze?.detected ? `พบ ${detailResult.freeze.count} ครั้ง` : "ปกติ"}
                  </div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Black Frame</div>
                  <div className={`text-lg font-semibold ${detailResult.blackFrame?.detected ? "text-red-600" : "text-green-600"}`}>
                    {detailResult.blackFrame?.detected ? `พบ ${detailResult.blackFrame.count} ครั้ง` : "ปกติ"}
                  </div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Mosaic</div>
                  <div className={`text-lg font-semibold ${detailResult.mosaic?.detected ? "text-red-600" : "text-green-600"}`}>
                    {detailResult.mosaic?.detected ? "พบปัญหา" : "ปกติ"}
                  </div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">A/V Sync</div>
                  <div className={`text-lg font-semibold ${detailResult.avSync?.detected ? "text-red-600" : "text-green-600"}`}>
                    {detailResult.avSync?.detected ? "พบปัญหา" : "ปกติ"}
                  </div>
                </div>
                <div className="summary-item border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Loss Frame</div>
                  <div className={`text-lg font-semibold ${detailResult.lossFrame?.detected ? "text-red-600" : "text-green-600"}`}>
                    {detailResult.lossFrame?.detected
                      ? `${detailResult.lossFrame.dropped}/${detailResult.lossFrame.total} (${detailResult.lossFrame.percentage}%)`
                      : "ปกติ"}
                  </div>
                </div>
              </div>

              <h2>ข้อมูลรายนาที</h2>
              <Separator className="mb-4" />

              {detailResult.minuteSnapshots && detailResult.minuteSnapshots.length > 0 ? (
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>นาทีที่</th>
                        <th style={thStyle}>Latency (ms)</th>
                        <th style={thStyle}>Jitter (ms)</th>
                        <th style={thStyle}>Bitrate (kbps)</th>
                        <th style={thStyle}>Buffer (s)</th>
                        <th style={thStyle}>Dropped Frames</th>
                        <th style={thStyle}>Freeze</th>
                        <th style={thStyle}>Black Frame</th>
                        <th style={thStyle}>Stall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailResult.minuteSnapshots.map((snap, i) => (
                        <tr key={i} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                          <td style={tdStyle}>{snap.minute}</td>
                          <td style={tdStyle}>{snap.latency != null ? snap.latency.toFixed(0) : "-"}</td>
                          <td style={tdStyle}>{snap.jitter != null ? snap.jitter.toFixed(1) : "-"}</td>
                          <td style={tdStyle}>{snap.bitrate != null ? snap.bitrate : "-"}</td>
                          <td style={tdStyle}>{snap.bufferHealth != null ? snap.bufferHealth.toFixed(2) : "-"}</td>
                          <td style={tdStyle}>
                            <span style={{ color: snap.droppedFrames > 0 ? "#dc2626" : "inherit" }}>
                              {snap.droppedFrames} / {snap.totalFrames}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ color: snap.freezeCount > 0 ? "#dc2626" : "#16a34a" }}>
                              {snap.freezeCount > 0 ? `${snap.freezeCount} ครั้ง` : "ปกติ"}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ color: snap.blackFrameCount > 0 ? "#dc2626" : "#16a34a" }}>
                              {snap.blackFrameCount > 0 ? `${snap.blackFrameCount} ครั้ง` : "ปกติ"}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ color: snap.stallCount > 0 ? "#dc2626" : "#16a34a" }}>
                              {snap.stallCount > 0 ? `${snap.stallCount} ครั้ง` : "ปกติ"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  {detailResult.duration && detailResult.duration < 60
                    ? "การทดสอบนี้ใช้เวลาน้อยกว่า 1 นาที จึงมีเพียงข้อมูลสรุปรวม (1 บรรทัด)"
                    : "ไม่มีข้อมูลรายนาที"}
                </div>
              )}

              {/* For tests < 60s, show a single summary row */}
              {detailResult.minuteSnapshots && detailResult.minuteSnapshots.length === 0 && detailResult.duration && detailResult.duration < 60 && (
                <div className="overflow-x-auto mt-2">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>ช่วงเวลา</th>
                        <th style={thStyle}>Latency (ms)</th>
                        <th style={thStyle}>Jitter (ms)</th>
                        <th style={thStyle}>Bitrate (kbps)</th>
                        <th style={thStyle}>Buffer (s)</th>
                        <th style={thStyle}>Freeze</th>
                        <th style={thStyle}>Black Frame</th>
                        <th style={thStyle}>Loss Frame</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdStyle}>{formatDuration(detailResult.duration)}</td>
                        <td style={tdStyle}>{detailResult.latency != null ? detailResult.latency.toFixed(0) : "-"}</td>
                        <td style={tdStyle}>{detailResult.jitter != null ? detailResult.jitter.toFixed(1) : "-"}</td>
                        <td style={tdStyle}>{detailResult.bitrate?.average || "-"}</td>
                        <td style={tdStyle}>{detailResult.bufferHealth?.avgLevel != null ? detailResult.bufferHealth.avgLevel : "-"}</td>
                        <td style={tdStyle}>
                          <span style={{ color: detailResult.freeze?.detected ? "#dc2626" : "#16a34a" }}>
                            {detailResult.freeze?.detected ? `${detailResult.freeze.count} ครั้ง` : "ปกติ"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: detailResult.blackFrame?.detected ? "#dc2626" : "#16a34a" }}>
                            {detailResult.blackFrame?.detected ? `${detailResult.blackFrame.count} ครั้ง` : "ปกติ"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: detailResult.lossFrame?.detected ? "#dc2626" : "#16a34a" }}>
                            {detailResult.lossFrame?.detected ? `${detailResult.lossFrame.dropped} เฟรม` : "ปกติ"}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "8px 12px",
  textAlign: "left",
  background: "#f8fafc",
  fontWeight: 600,
  color: "#475569",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "8px 12px",
  textAlign: "left",
};
