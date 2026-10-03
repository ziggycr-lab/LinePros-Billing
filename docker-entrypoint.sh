#!/bin/sh
set -eu

# Fail closed: production containers must not start without auth secrets.
if [ "${NODE_ENV:-}" = "production" ] && [ "${LINEPROS_AUTH:-on}" != "off" ]; then
  if [ -z "${LINEPROS_SESSION_SECRET:-}" ]; then
    echo "[linepros] refusing to start: LINEPROS_SESSION_SECRET is missing" >&2
    exit 1
  fi
  if [ -z "${LINEPROS_ADMIN_PASSWORD_HASH:-}" ] && [ -z "${LINEPROS_ADMIN_PASSWORD:-}" ]; then
    echo "[linepros] refusing to start: set LINEPROS_ADMIN_PASSWORD_HASH (preferred)" >&2
    exit 1
  fi
fi

exec "$@"
