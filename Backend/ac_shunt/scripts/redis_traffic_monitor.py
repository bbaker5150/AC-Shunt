"""
Phase 5b smoke helper: live Redis traffic monitor.

Subscribes to Redis keyspace notifications + channels_redis backplane
and prints every pub/sub event the channel layer produces. Prove-you're-
on-Redis tool; kill with Ctrl+C when done.

Usage (from Backend/ac_shunt/, with venv active):
    python scripts\redis_traffic_monitor.py

If you see messages like:
    MSG  asgi:group:hostsync_broadcast  {"type":"workstation_claims_update",...}
then every WebSocket broadcast is flowing through Redis as expected.
"""

import os
import sys
import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
print(f"Connecting to {REDIS_URL} ...")

r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
try:
    r.ping()
except Exception as exc:
    print(f"FAILED to reach Redis: {exc!r}")
    sys.exit(1)

pubsub = r.pubsub()
pubsub.psubscribe("asgi:*", "__keyspace@0__:asgi*")
print("Subscribed to asgi:* and asgi keyspace events.")
print("Waiting for channel-layer traffic ... (Ctrl+C to stop)\n")

try:
    for msg in pubsub.listen():
        if msg["type"] not in {"pmessage", "message"}:
            continue
        channel = msg.get("channel", "?")
        data = msg.get("data", "")
        if isinstance(data, bytes):
            try:
                data = data.decode("utf-8", errors="replace")
            except Exception:
                data = repr(data)
        trunc = data[:200] + ("..." if len(str(data)) > 200 else "")
        print(f"MSG  {channel}  {trunc}")
except KeyboardInterrupt:
    print("\nStopped.")
