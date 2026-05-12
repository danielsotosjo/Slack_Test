#!/usr/bin/env python3
"""
Servidor local: archivos estáticos + API REST que persiste la app en JSON (carpeta data/).

  python3 server.py
  python3 server.py --host 0.0.0.0 --port 8080

API:
  GET  /api/state  → JSON unificado (404 si aún no hay datos)
  PUT/POST /api/state  → guarda cuerpo JSON en data/*.json
"""
from __future__ import annotations

import argparse
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def _read_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _write_json_atomic(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text + "\n", encoding="utf-8")
    tmp.replace(path)


def load_state() -> dict | None:
    """Compone el estado desde data/*.json. None = sin base aún."""
    if not DATA.is_dir():
        return None
    if not (DATA / "projects.json").is_file():
        return None
    meta = _read_json(DATA / "meta.json", {"schemaVersion": 1})
    return {
        "version": int(meta.get("schemaVersion", 1)),
        "projects": _read_json(DATA / "projects.json", []),
        "tasks": _read_json(DATA / "tasks.json", []),
        "assignees": _read_json(DATA / "assignees.json", []),
        "vendors": _read_json(DATA / "vendors.json", []),
        "stakeholders": _read_json(DATA / "stakeholders.json", []),
        "ui": _read_json(DATA / "ui.json", {}),
    }


def save_state(payload: dict) -> None:
    """Parte el payload en archivos JSON."""
    projects = payload.get("projects")
    tasks = payload.get("tasks")
    if not isinstance(projects, list) or not isinstance(tasks, list):
        raise ValueError("projects y tasks deben ser arrays")
    version = int(payload.get("version", 1))
    _write_json_atomic(DATA / "meta.json", {"schemaVersion": version})
    _write_json_atomic(DATA / "projects.json", projects)
    _write_json_atomic(DATA / "tasks.json", tasks)
    _write_json_atomic(DATA / "assignees.json", payload.get("assignees") or [])
    _write_json_atomic(DATA / "vendors.json", payload.get("vendors") or [])
    _write_json_atomic(DATA / "stakeholders.json", payload.get("stakeholders") or [])
    _write_json_atomic(DATA / "ui.json", payload.get("ui") or {})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args_):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args_))

    def do_GET(self):
        parsed = urlparse(self.path)
        path_only = parsed.path or "/"
        if len(path_only) > 1 and path_only.endswith("/"):
            path_only = path_only[:-1]
        if path_only == "/api/state":
            self._handle_get_state()
            return
        q = ("?" + parsed.query) if parsed.query else ""
        if path_only == "/":
            self.path = "/index.html" + q
        return super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        path_only = parsed.path or "/"
        if len(path_only) > 1 and path_only.endswith("/"):
            path_only = path_only[:-1]
        if path_only == "/api/state":
            self._handle_put_state()
            return
        self.send_error(405, "Method not allowed")

    def do_POST(self):
        parsed = urlparse(self.path)
        path_only = parsed.path or "/"
        if len(path_only) > 1 and path_only.endswith("/"):
            path_only = path_only[:-1]
        if path_only == "/api/state":
            self._handle_put_state()
            return
        self.send_error(405, "Method not allowed")

    def _handle_get_state(self):
        try:
            data = load_state()
        except OSError as e:
            self.send_error(500, str(e))
            return
        if data is None:
            self.send_response(404)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _handle_put_state(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 25 * 1024 * 1024:
            self.send_error(413, "Body too large")
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            save_state(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(400, "JSON inválido")
            return
        except ValueError as e:
            self.send_error(400, str(e))
            return
        except OSError as e:
            self.send_error(500, str(e))
            return
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


def main():
    ap = argparse.ArgumentParser(description="Project Hub — servidor local + JSON en data/")
    ap.add_argument("--host", default="127.0.0.1", help="Interfaz (0.0.0.0 para red local)")
    ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Project Hub → http://{args.host}:{args.port}/")
    print(f"Base JSON  → {DATA}/")
    print("  projects.json | tasks.json | assignees.json | vendors.json | stakeholders.json | ui.json | meta.json")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrado.")


if __name__ == "__main__":
    main()
