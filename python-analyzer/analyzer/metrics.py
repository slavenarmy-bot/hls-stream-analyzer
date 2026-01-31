import av


def analyze_metrics(video_path: str) -> dict:
    """Analyze video for frame loss and other metrics."""
    total_frames = 0
    dropped_frames = 0
    prev_pts = None

    try:
        container = av.open(video_path)
        stream = container.streams.video[0]
        fps = float(stream.average_rate) if stream.average_rate else 30
        expected_interval = 1.0 / fps
        time_base = float(stream.time_base)

        for packet in container.demux(video=0):
            if packet.pts is not None:
                current_pts = packet.pts * time_base
                total_frames += 1

                if prev_pts is not None:
                    gap = current_pts - prev_pts
                    if gap > expected_interval * 1.5:
                        estimated_dropped = int(gap / expected_interval) - 1
                        dropped_frames += max(estimated_dropped, 1)

                prev_pts = current_pts

        container.close()
    except Exception:
        pass

    return {
        "detected": dropped_frames > 0,
        "dropped": dropped_frames,
        "total": total_frames,
        "dropRate": round(dropped_frames / max(total_frames, 1) * 100, 2),
    }
