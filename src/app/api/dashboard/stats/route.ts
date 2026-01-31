import { NextRequest } from "next/server";
import os from "os";

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpus1 = os.cpus();
    setTimeout(() => {
      const cpus2 = os.cpus();
      let totalIdle = 0, totalTick = 0;
      for (let i = 0; i < cpus2.length; i++) {
        const c1 = cpus1[i].times;
        const c2 = cpus2[i].times;
        const idle = c2.idle - c1.idle;
        const total = (c2.user - c1.user) + (c2.nice - c1.nice) + (c2.sys - c1.sys) + (c2.idle - c1.idle) + (c2.irq - c1.irq);
        totalIdle += idle;
        totalTick += total;
      }
      resolve(totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0);
    }, 500);
  });
}

function getIntervalMs(interval: string): number {
  switch (interval) {
    case "1min": return 60000;
    case "5min": return 300000;
    case "10min": return 600000;
    default: return 1000;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get("interval") || "realtime";
  const intervalMs = getIntervalMs(interval);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      async function sendStats() {
        if (closed) return;
        try {
          const cpu = await getCpuUsage();
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;

          const data = {
            timestamp: new Date().toISOString(),
            cpu,
            memory: { used: usedMem, total: totalMem, percent: (usedMem / totalMem) * 100 },
            uptime: os.uptime(),
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
          controller.close();
        }
      }

      await sendStats();
      const timer = setInterval(sendStats, intervalMs);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
