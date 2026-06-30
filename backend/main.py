"""
main.py — FastAPI application entry point for the Container Packing API.

Registers CORS middleware (allowing the Vite dev server at FRONTEND_ORIGIN),
a liveness probe at GET /health, the main optimizer endpoint at
POST /api/optimize, and a streaming variant POST /api/optimize/stream that
emits Server-Sent Events with live packing progress (the packing algorithm is
chosen in the request body).
"""

import asyncio
import json
import queue
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from schema import OptimizeRequest, OptimizeResponse, TraceRequest
from algorithms.optimizer import run_optimizer
from algorithms.trace import run_trace

FRONTEND_ORIGIN = "http://localhost:5173"

app = FastAPI(title="Container Packing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    """Liveness probe used by docker-compose healthcheck."""
    return {"status": "ok"}


@app.post("/api/optimize", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest):
    """
    Find the cheapest container combination that fits all boxes, then pack
    using the algorithm named in the request body (default: guillotine).

    Tries combinations in ascending cost order (cheapest first, fewest
    containers as tiebreak, most 40ft preferred at equal cost+count).
    Returns the first combination where all boxes fit, or the best partial
    result if nothing within the cost cap fits everything.
    """
    return run_optimizer(body)


@app.post("/api/optimize/stream")
async def optimize_stream(body: OptimizeRequest):
    """
    Same optimization as POST /api/optimize, but streams live progress as
    Server-Sent Events so the frontend can show a real progress bar.

    Events (one JSON object per `data:` line):
      {"type": "progress", "placed": N, "total": M, "pct": P}
      {"type": "result",   "data": <OptimizeResponse>}
      {"type": "error",    "message": "..."}

    The packing code is synchronous and CPU-bound, so it runs in a worker thread
    and pushes events onto a queue; this async generator drains the queue. The
    progress count is clamped to a monotonic maximum because the optimizer
    re-packs from scratch for each container combination (and algo2 for each
    strategy) — without clamping the bar would jump backwards.
    """
    events: queue.Queue = queue.Queue()
    total = sum(b.quantity for b in body.boxes)

    # Closure state: highest pct emitted so far (monotonic) — keeps the bar
    # moving forward only and throttles to one event per 1% step.
    last_pct = 0

    def progress_cb(placed: int) -> None:
        nonlocal last_pct
        pct = min(99, round(placed / total * 100)) if total else 0
        if pct > last_pct:
            last_pct = pct
            events.put({"type": "progress", "placed": placed, "total": total, "pct": pct})

    def run() -> None:
        try:
            result = run_optimizer(body, progress_cb=progress_cb)
            events.put({"type": "result", "data": result.model_dump()})
        except Exception as exc:  # surface any failure to the client
            events.put({"type": "error", "message": str(exc)})
        finally:
            events.put(None)  # sentinel: stream complete

    threading.Thread(target=run, daemon=True).start()

    async def generate():
        loop = asyncio.get_event_loop()
        while True:
            event = await loop.run_in_executor(None, events.get)
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/trace")
def trace(body: TraceRequest):
    """
    Step-by-step guillotine trace into a single 20ft container, for the
    algorithm visualizer. Returns { container, steps[] } where each step records
    the placed carton, its priority score, and the free-space split.
    """
    return run_trace(body.boxes, body.containers or None, body.algorithm, body.lashing)
