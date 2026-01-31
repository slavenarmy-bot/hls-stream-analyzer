import av
import numpy as np
import cv2


def detect_mosaic(video_path: str, edge_threshold: float = 50.0) -> dict:
    """Detect mosaic/blocking artifacts using Sobel edge detection."""
    mosaic_frames = []
    frame_count = 0
    fps = 30

    try:
        container = av.open(video_path)
        stream = container.streams.video[0]
        fps = float(stream.average_rate) if stream.average_rate else 30

        for frame in container.decode(video=0):
            img = frame.to_ndarray(format="gray")

            sobel_x = cv2.Sobel(img, cv2.CV_64F, 1, 0, ksize=3)
            sobel_y = cv2.Sobel(img, cv2.CV_64F, 0, 1, ksize=3)
            edge_magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
            mean_edge = np.mean(edge_magnitude)

            if mean_edge > edge_threshold:
                h, w = img.shape
                block_scores = []
                for block_size in [8, 16]:
                    if h >= block_size and w >= block_size:
                        for y in range(0, h - block_size, block_size):
                            row_diff = np.mean(np.abs(
                                img[y + block_size - 1, :].astype(float) -
                                img[min(y + block_size, h - 1), :].astype(float)
                            ))
                            block_scores.append(row_diff)

                avg_block_score = np.mean(block_scores) if block_scores else 0
                if avg_block_score > 20:
                    timestamp = frame_count / fps
                    mosaic_frames.append({
                        "frame": frame_count,
                        "timestamp": round(timestamp, 2),
                        "blockScore": round(float(avg_block_score), 2),
                    })

            frame_count += 1

        container.close()
    except Exception:
        pass

    return {
        "detected": len(mosaic_frames) > 0,
        "count": len(mosaic_frames),
        "timestamps": mosaic_frames[:20],
    }
