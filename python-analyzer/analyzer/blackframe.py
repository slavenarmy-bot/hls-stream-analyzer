import av
import numpy as np


def detect_black_frame(video_path: str, threshold: int = 16) -> dict:
    """Detect black frames where average pixel value is below threshold."""
    black_frames = []
    frame_count = 0
    fps = 30

    try:
        container = av.open(video_path)
        stream = container.streams.video[0]
        fps = float(stream.average_rate) if stream.average_rate else 30

        for frame in container.decode(video=0):
            img = frame.to_ndarray(format="gray")
            mean_val = np.mean(img)

            if mean_val < threshold:
                timestamp = frame_count / fps
                black_frames.append({
                    "frame": frame_count,
                    "timestamp": round(timestamp, 2),
                    "meanValue": round(float(mean_val), 2),
                })

            frame_count += 1

        container.close()
    except Exception:
        pass

    return {
        "detected": len(black_frames) > 0,
        "count": len(black_frames),
        "timestamps": black_frames[:20],
    }
