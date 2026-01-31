import av
import numpy as np


def detect_freeze(video_path: str, threshold: float = 0.98, min_duration: float = 0.5) -> dict:
    """Detect frozen frames using similarity comparison between consecutive frames."""
    frozen_segments = []
    freeze_start = None
    prev_frame = None
    frame_count = 0
    fps = 30

    try:
        container = av.open(video_path)
        stream = container.streams.video[0]
        fps = float(stream.average_rate) if stream.average_rate else 30

        for frame in container.decode(video=0):
            current = frame.to_ndarray(format="gray")

            if prev_frame is not None:
                if current.shape == prev_frame.shape:
                    norm_curr = current.astype(float) / 255.0
                    norm_prev = prev_frame.astype(float) / 255.0
                    correlation = np.mean(norm_curr * norm_prev) / (
                        max(np.std(norm_curr) * np.std(norm_prev), 1e-10)
                    )
                    similarity = min(correlation, 1.0)

                    if similarity >= threshold:
                        if freeze_start is None:
                            freeze_start = frame_count / fps
                    else:
                        if freeze_start is not None:
                            freeze_end = frame_count / fps
                            if (freeze_end - freeze_start) >= min_duration:
                                frozen_segments.append({
                                    "start": round(freeze_start, 2),
                                    "end": round(freeze_end, 2),
                                    "duration": round(freeze_end - freeze_start, 2),
                                })
                            freeze_start = None

            prev_frame = current
            frame_count += 1

        container.close()
    except Exception:
        pass

    return {
        "detected": len(frozen_segments) > 0,
        "count": len(frozen_segments),
        "timestamps": frozen_segments[:20],
    }
