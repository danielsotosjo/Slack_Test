#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Project Hub — http://localhost:8080/"
echo "Base JSON en: $(pwd)/data/"
exec python3 server.py --port 8080
