"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Activity, Clock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface SystemStats {
  timestamp: string;
  cpu: number;
  memory: { used: number; total: number; percent: number };
  uptime: number;
}

export default function DashboardPage() {
  const [interval, setIntervalValue] = useState("realtime");
  const [stats, setStats] = useState<SystemStats[]>([]);
  const [current, setCurrent] = useState<SystemStats | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/dashboard/stats?interval=${interval}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: SystemStats = JSON.parse(event.data);
        setCurrent(data);
        setStats(prev => {
          const next = [...prev, data];
          return next.slice(-60);
        });
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [interval]);

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d} วัน ${h} ชั่วโมง ${m} นาที`;
  }

  function formatBytes(bytes: number) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard แบบ Real-time</h1>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Select value={interval} onValueChange={setIntervalValue}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="realtime">Realtime</SelectItem>
              <SelectItem value="1min">ทุก 1 นาที</SelectItem>
              <SelectItem value="5min">ทุก 5 นาที</SelectItem>
              <SelectItem value="10min">ทุก 10 นาที</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current?.cpu.toFixed(1) ?? "-"}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current?.memory.percent.toFixed(1) ?? "-"}%</div>
            <p className="text-xs text-muted-foreground">{current ? `${formatBytes(current.memory.used)} / ${formatBytes(current.memory.total)}` : "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{current ? formatUptime(current.uptime) : "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">อัปเดตทุก</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {interval === "realtime" ? "1 วินาที" : interval === "1min" ? "1 นาที" : interval === "5min" ? "5 นาที" : "10 นาที"}
            </div>
            <Badge variant="secondary" className="mt-1">{stats.length} จุดข้อมูล</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>CPU Usage (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString("th-TH")} />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString("th-TH")} formatter={(v) => [`${Number(v).toFixed(1)}%`, "CPU"]} />
                <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memory Usage (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.map(s => ({ ...s, memPercent: s.memory.percent }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString("th-TH")} />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString("th-TH")} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Memory"]} />
                <Area type="monotone" dataKey="memPercent" stroke="#10b981" fill="#6ee7b7" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
