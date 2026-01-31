from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import tempfile
import os

from analyzer.hls import analyze_hls
from analyzer.freeze import detect_freeze
from analyzer.blackframe import detect_black_frame
from analyzer.mosaic import detect_mosaic
from analyzer.avsync import detect_av_sync
from analyzer.metrics import analyze_metrics

app = FastAPI(title="HLS Stream Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str
    duration: int = 30


class AnalyzeResponse(BaseModel):
    freeze: dict
    mosaic: dict
    blackFrame: dict
    avSync: dict
    lossFrame: dict
    latency: float | None
    jitter: float | None
    bitrate: dict
    bufferHealth: dict


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    try:
        hls_result = await analyze_hls(req.url, req.duration)

        video_path = None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(req.url)
                resp.raise_for_status()
                lines = resp.text.strip().split("\n")
                segment_url = None
                for line in reversed(lines):
                    if not line.startswith("#") and line.strip():
                        segment_url = line.strip()
                        break

                if segment_url and not segment_url.startswith("http"):
                    base_url = req.url.rsplit("/", 1)[0]
                    segment_url = f"{base_url}/{segment_url}"

                if segment_url:
                    seg_resp = await client.get(segment_url)
                    seg_resp.raise_for_status()
                    with tempfile.NamedTemporaryFile(suffix=".ts", delete=False) as f:
                        f.write(seg_resp.content)
                        video_path = f.name
        except Exception:
            pass

        freeze_result = {"detected": False, "count": 0, "timestamps": []}
        black_result = {"detected": False, "count": 0, "timestamps": []}
        mosaic_result = {"detected": False, "count": 0, "timestamps": []}
        avsync_result = {"detected": False, "drift_ms": 0}
        loss_result = {"detected": False, "dropped": 0, "total": 0}

        if video_path and os.path.exists(video_path):
            try:
                freeze_result = detect_freeze(video_path)
                black_result = detect_black_frame(video_path)
                mosaic_result = detect_mosaic(video_path)
                avsync_result = detect_av_sync(video_path)
                loss_result = analyze_metrics(video_path)
            finally:
                os.unlink(video_path)

        return AnalyzeResponse(
            freeze=freeze_result,
            mosaic=mosaic_result,
            blackFrame=black_result,
            avSync=avsync_result,
            lossFrame=loss_result,
            latency=hls_result.get("latency"),
            jitter=hls_result.get("jitter"),
            bitrate=hls_result.get("bitrate", {}),
            bufferHealth=hls_result.get("bufferHealth", {}),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
