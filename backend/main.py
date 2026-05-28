from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Container Packing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# TODO: replace with real Guillotine algorithm in Phase 8
@app.post("/api/pack")
def pack(body: dict):
    return {"containers": []}
