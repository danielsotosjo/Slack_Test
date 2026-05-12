#!/usr/bin/env bash
# Sirve Project Hub en http://localhost:8080/ (siempre usa esta URL, no abras index.html con doble clic).
cd "$(dirname "$0")"
echo "Project Hub → http://localhost:8080/"
exec python3 -m http.server 8080
