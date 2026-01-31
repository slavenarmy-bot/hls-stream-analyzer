import av


def detect_av_sync(video_path: str, threshold_ms: float = 50.0) -> dict:
    """Detect audio-video synchronization issues by comparing PTS timestamps."""
    try:
        container = av.open(video_path)

        video_pts = []
        audio_pts = []

        if container.streams.video:
            video_stream = container.streams.video[0]
            video_tb = float(video_stream.time_base)
            for packet in container.demux(video_stream):
                if packet.pts is not None:
                    video_pts.append(packet.pts * video_tb)
                if len(video_pts) >= 100:
                    break

        container.seek(0)

        if container.streams.audio:
            audio_stream = container.streams.audio[0]
            audio_tb = float(audio_stream.time_base)
            for packet in container.demux(audio_stream):
                if packet.pts is not None:
                    audio_pts.append(packet.pts * audio_tb)
                if len(audio_pts) >= 100:
                    break

        container.close()

        if not video_pts or not audio_pts:
            return {"detected": False, "drift_ms": 0, "note": "No audio or video stream found"}

        video_start = video_pts[0]
        audio_start = audio_pts[0]
        drift_ms = abs(video_start - audio_start) * 1000

        return {
            "detected": drift_ms > threshold_ms,
            "drift_ms": round(drift_ms, 2),
            "video_start": round(video_start, 4),
            "audio_start": round(audio_start, 4),
        }

    except Exception:
        return {"detected": False, "drift_ms": 0, "error": "Could not analyze A/V sync"}
