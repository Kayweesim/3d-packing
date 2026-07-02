#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"

osascript -e "tell app \"Terminal\" to do script \"cd '$ROOT/backend' && venv/bin/uvicorn main:app --reload --port 8000\""
osascript -e "tell app \"Terminal\" to do script \"cd '$ROOT/frontend' && npm run dev\""
