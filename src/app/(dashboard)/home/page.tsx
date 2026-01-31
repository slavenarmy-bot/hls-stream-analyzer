"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, XCircle, Clock, Tv } from "lucide-react";

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
}

export default function HomePage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/testing?limit=10");
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setStats(data.stats || { total: 0, passed: 0, failed: 0, pending: 0 });
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function getStatusBadge(status: string) {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />สำเร็จ</Badge>;
      case "FAILED":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />ล้มเหลว</Badge>;
      case "RUNNING":
        return <Badge className="bg-blue-500 hover:bg-blue-600"><Activity className="mr-1 h-3 w-3" />กำลังทดสอบ</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />รอดำเนินการ</Badge>;
    }
  }

  function getMetricBadge(label: string, value: any) {
    if (!value) return null;
    const detected = value.detected === true || value.count > 0;
    return (
      <Badge key={label} variant={detected ? "destructive" : "secondary"} className="text-xs">
        {label}: {detected ? "พบปัญหา" : "ปกติ"}
      </Badge>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">หน้าหลัก</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ทดสอบทั้งหมด</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">สำเร็จ</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{stats.passed}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ล้มเหลว</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{stats.failed}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">รอดำเนินการ</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.pending}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tv className="h-5 w-5" />ผลวิเคราะห์ล่าสุด 10 รายการ</CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">ยังไม่มีผลการทดสอบ</p>
          ) : (
            <div className="space-y-3">
              {results.map((result) => (
                <div key={result.id} className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Tv className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{result.channelName || "ไม่ระบุชื่อช่อง"}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-md">{result.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(result.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(result.testedAt).toLocaleString("th-TH")}
                      </span>
                    </div>
                  </div>
                  {result.status === "COMPLETED" && (
                    <div className="flex flex-wrap gap-1.5 ml-7">
                      {getMetricBadge("Freeze", result.freeze)}
                      {getMetricBadge("Mosaic", result.mosaic)}
                      {getMetricBadge("Black Frame", result.blackFrame)}
                      {getMetricBadge("A/V Sync", result.avSync)}
                      {getMetricBadge("Loss Frame", result.lossFrame)}
                      {result.latency != null && (
                        <Badge variant="secondary" className="text-xs">
                          Latency: {result.latency.toFixed(0)}ms
                        </Badge>
                      )}
                      {result.jitter != null && (
                        <Badge variant="secondary" className="text-xs">
                          Jitter: {result.jitter.toFixed(1)}ms
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
