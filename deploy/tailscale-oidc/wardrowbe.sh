#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$deploy_dir/../.." && pwd -P)"
runtime_dir="$deploy_dir/runtime"
app_env="$runtime_dir/wardrowbe.env"

load_runtime() {
  if [[ ! -f "$app_env" ]]; then
    echo "Missing $app_env; run setup.sh first" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$app_env"
  set +a
  export DEBUG="false"
  export DEV_MODE="false"
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

start_processes() {
  load_runtime
  mkdir -p "$runtime_dir"
  chmod 700 "$runtime_dir"

  if lsof -nP -iTCP:8001 -sTCP:LISTEN >/dev/null 2>&1 || \
     lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Wardrowbe port 8001 or 3000 already in use; stop existing instance first" >&2
    exit 1
  fi

  (
    set -a
    # shellcheck disable=SC1091
    source "$repo_root/backend/.env"
    # shellcheck disable=SC1090
    source "$app_env"
    set +a
    export DEBUG="false"
    cd "$repo_root/backend"
    exec ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --no-access-log
  ) >>"$runtime_dir/backend.log" 2>&1 &
  echo "$!" >"$runtime_dir/backend.pid"

  (
    set -a
    # shellcheck disable=SC1091
    source "$repo_root/backend/.env"
    # shellcheck disable=SC1090
    source "$app_env"
    set +a
    export DEBUG="false"
    cd "$repo_root/backend"
    exec ../.venv/bin/arq app.workers.worker.WorkerSettings
  ) >>"$runtime_dir/worker.log" 2>&1 &
  echo "$!" >"$runtime_dir/worker.pid"

  (
    set -a
    # shellcheck disable=SC1091
    source "$repo_root/frontend/.env.local"
    # shellcheck disable=SC1090
    source "$app_env"
    set +a
    export DEV_MODE="false"
    cd "$repo_root/frontend"
    exec npm run dev -- --hostname 127.0.0.1 --port 3000
  ) >>"$runtime_dir/frontend.log" 2>&1 &
  echo "$!" >"$runtime_dir/frontend.pid"

  for _ in {1..30}; do
    if curl --noproxy '*' --fail --silent http://127.0.0.1:8001/api/v1/health >/dev/null && \
       curl --noproxy '*' --fail --silent http://127.0.0.1:3000/login >/dev/null; then
      echo "Wardrowbe started"
      return
    fi
    sleep 1
  done

  echo "Wardrowbe did not become ready; inspect runtime logs" >&2
  return 1
}

stop_one() {
  local name="$1"
  local pid_file="$runtime_dir/$name.pid"
  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    return
  fi
  local pid
  pid="$(cat "$pid_file")"
  kill -TERM "$pid"
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      return
    fi
    sleep 0.25
  done
  echo "$name did not stop after SIGTERM" >&2
  return 1
}

status_processes() {
  local failed=0
  for name in backend worker frontend; do
    if is_running "$runtime_dir/$name.pid"; then
      echo "$name: running"
    else
      echo "$name: stopped"
      failed=1
    fi
  done
  return "$failed"
}

case "${1:-}" in
  start) start_processes ;;
  stop)
    stop_one frontend
    stop_one worker
    stop_one backend
    ;;
  restart)
    "$0" stop || true
    "$0" start
    ;;
  status) status_processes ;;
  *) echo "Usage: $0 start|stop|restart|status" >&2; exit 2 ;;
esac
