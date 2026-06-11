"""
main.py — FastAPI application entry point for the Container Packing API.

Registers CORS middleware (allowing the Vite dev server at FRONTEND_ORIGIN),
a liveness probe at GET /health, and the main optimizer endpoint at
POST /api/optimize/guillotine.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schema import OptimizeRequest, OptimizeResponse
from algorithms.optimizer import run_optimizer

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


@app.post("/api/optimize/guillotine", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest):
    """
    Find the cheapest container combination that fits all boxes, then pack
    using the Guillotine algorithm.

    Tries combinations in ascending cost order (cheapest first, fewest
    containers as tiebreak, most 40ft preferred at equal cost+count).
    Returns the first combination where all boxes fit, or the best partial
    result if nothing within the cost cap fits everything.
    """
    return run_optimizer(body)
