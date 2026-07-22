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
import time
import sys
import os
import webbrowser
import uvicorn

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from schema import (
    OptimizeRequest, OptimizeResponse, TraceRequest,
    PalletPackRequest, PalletPackResponse, PalletPlacementOut, PalletUsed,
)
from packing_algos.optimizer import run_optimizer
from packing_algos.algo_v1.trace import run_trace
from pallet_packing import BoxSpec, resolve_pallet, run_pallet_pack
from fastapi.staticfiles import StaticFiles

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
    using the algorithm named in the request body (default: algo1).

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
    re-packs from scratch for each container combination (and algo1 for each
    strategy) — without clamping the bar would jump backwards.
    """
    events: queue.Queue = queue.Queue()
    total = sum(b.quantity for b in body.boxes)

    # Closure state: highest pct emitted so far (monotonic) — keeps the bar
    # moving forward only and throttles to one event per 1% step.
    last_pct = 0

    # Placement accounts for 0-82 %; the flat re-pack loop fires synthetic
    # "placed" values above `total` (total+1, total+2, …) to cover 83-96 %,
    # and a sentinel value of total+100 signals the topological-sort phase at 97 %.
    # MAX_FLAT_STEPS is a generous upper bound on height-cap iterations.
    MAX_FLAT_STEPS = 20

    def progress_cb(placed: int) -> None:
        nonlocal last_pct
        if total == 0:
            pct = 0
        elif placed <= total:
            # Carton placement phase: 0 → 82 %
            pct = round(placed / total * 82)
        elif placed <= total + MAX_FLAT_STEPS:
            # Flat re-pack attempts: 83 → 96 %
            step = placed - total
            pct = 82 + round(step / MAX_FLAT_STEPS * 14)
        else:
            # Topological sort / finalise: 97 %
            pct = 97
        pct = min(99, pct)
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


    async def generate():
        loop = asyncio.get_event_loop()
        while True:
            event = await loop.run_in_executor(None, events.get)
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"
            
    threading.Thread(target=run, daemon=True).start()


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


@app.post("/api/pallet/optimize", response_model=PalletPackResponse)
def pallet_optimize(body: PalletPackRequest):
    """
    Single-SKU pallet packing: pack one carton type onto a pallet, returning the
    best repeating layer pattern for ONE pallet plus how many pallets the given
    quantity needs. Synchronous — the solve is instant, so no SSE/threads.

    Independent of the container optimizer: it calls pallet_packing.run_pallet_pack
    and touches none of the packing_algos machinery.
    """
    box = BoxSpec(
        id=body.box.id, w=body.box.w, h=body.box.h, d=body.box.d,
        rotationAllowed=body.box.rotationAllowed, stacking=body.box.stacking,
    )
    pallet = resolve_pallet(body.pallet.key, body.pallet.Wp, body.pallet.Dp, body.pallet.max_height)
    result = run_pallet_pack(box, pallet, body.quantity)

    return PalletPackResponse(
        placements=[
            PalletPlacementOut(boxId=p.boxId, x=p.x, y=p.y, z=p.z, w=p.w, h=p.h, d=p.d)
            for p in result.placements
        ],
        per_layer=result.per_layer,
        layers=result.layers,
        per_pallet=result.per_pallet,
        pallets_needed=result.pallets_needed,
        last_pallet_count=result.last_pallet_count,
        footprint_util=result.footprint_util,
        height_util=result.height_util,
        volume_util=result.volume_util,
        pallet=PalletUsed(
            label=pallet.label, Wp=pallet.Wp, Dp=pallet.Dp,
            deck_h=pallet.deck_h, max_height=pallet.max_height,
        ),
    )

# ── Keep-alive watchdog (packaged exe only) ─────────────────────────────────────
# Each open app tab holds one SSE connection to /api/keepalive. When the last
# connection closes (browser/tab closed) and stays closed past a grace period,
# the frozen exe exits itself — so closing the browser stops the process.
# A connection (not a polling timer) because browsers throttle background-tab
# timers to ~1/min, which would falsely kill the app while a tab is hidden.

_ui_connections = 0                 # currently open keep-alive streams
_last_ui_seen = time.time()         # when the count last dropped to zero
_GRACE_AFTER_CLOSE_S = 15.0         # survives refreshes / brief reconnects
_GRACE_STARTUP_S = 120.0            # time allowed for the first tab to load


@app.get("/api/keepalive")
async def keepalive(request: Request):
    """SSE stream the frontend holds open for the lifetime of a tab."""
    async def stream():
        global _ui_connections, _last_ui_seen
        _ui_connections += 1
        try:
            while not await request.is_disconnected():
                yield ": ping\n\n"   # comment frame — keeps proxies from buffering
                await asyncio.sleep(5)
        finally:
            _ui_connections -= 1
            _last_ui_seen = time.time()
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})


def _exit_when_browser_closes():
    """Poll the connection count; exit the process once no tab has been open
    past the grace period. Started only in the frozen exe — dev servers with
    --reload must never self-terminate."""
    ever_connected = False
    while True:
        time.sleep(2)
        if _ui_connections > 0:
            ever_connected = True
            continue
        grace = _GRACE_AFTER_CLOSE_S if ever_connected else _GRACE_STARTUP_S
        if time.time() - _last_ui_seen > grace:
            os._exit(0)


def resource_path(relative_path):
    # works both in dev and when frozen by PyInstaller
    base_path = getattr(sys, '_MEIPASS', os.path.abspath("."))
    return os.path.join(base_path, relative_path)

# --- mount frontend last, at root ---
app.mount("/", StaticFiles(directory=resource_path("frontend_dist"), html=True), name="static")

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    # In a PyInstaller exe launched without console handles, sys.stdout/stderr
    # can be None — uvicorn's default log formatter then crashes on
    # stdout.isatty(). Give the frozen process safe sinks and skip uvicorn's
    # dictConfig logging setup (log_config=None keeps plain root logging).
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")
    if getattr(sys, "frozen", False):
        threading.Thread(target=_exit_when_browser_closes, daemon=True).start()
    threading.Timer(1.2, open_browser).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_config=None)
