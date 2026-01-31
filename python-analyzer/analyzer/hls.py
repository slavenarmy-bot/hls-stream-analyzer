import time
import httpx


async def analyze_hls(url: str, duration: int = 30) -> dict:
    """Analyze HLS stream for latency, jitter, bitrate, and buffer health."""
    latencies = []
    bitrates = []
    segment_durations = []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            start = time.time()
            resp = await client.get(url)
            resp.raise_for_status()
            initial_latency = (time.time() - start) * 1000
            latencies.append(initial_latency)

            playlist_text = resp.text
            lines = playlist_text.strip().split("\n")

            for line in lines:
                if line.startswith("#EXTINF:"):
                    try:
                        dur = float(line.split(":")[1].split(",")[0])
                        segment_durations.append(dur)
                    except (ValueError, IndexError):
                        pass
                elif line.startswith("#EXT-X-STREAM-INF:"):
                    parts = line.split(",")
                    for part in parts:
                        if "BANDWIDTH=" in part:
                            try:
                                bw = int(part.split("BANDWIDTH=")[1])
                                bitrates.append(bw / 1000)
                            except (ValueError, IndexError):
                                pass

            for _ in range(min(3, duration // 2)):
                start = time.time()
                resp = await client.get(url)
                lat = (time.time() - start) * 1000
                latencies.append(lat)

    except Exception:
        pass

    avg_latency = sum(latencies) / len(latencies) if latencies else None

    jitter = None
    if len(latencies) > 1:
        diffs = [abs(latencies[i] - latencies[i - 1]) for i in range(1, len(latencies))]
        jitter = sum(diffs) / len(diffs)

    total_duration = sum(segment_durations)

    return {
        "latency": avg_latency,
        "jitter": jitter,
        "bitrate": {
            "average": sum(bitrates) / len(bitrates) if bitrates else None,
            "values": bitrates[:10],
        },
        "bufferHealth": {
            "totalDuration": total_duration,
            "segmentCount": len(segment_durations),
            "avgSegmentDuration": (
                sum(segment_durations) / len(segment_durations)
                if segment_durations
                else 0
            ),
        },
    }
