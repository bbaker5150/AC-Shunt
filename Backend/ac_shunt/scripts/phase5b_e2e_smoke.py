"""
Phase 5b end-to-end smoke test.

Hits the running Daphne server with two real WebSocket clients AND
subscribes to Redis pub/sub in parallel, so we can simultaneously prove:

  1. HostSync broadcasts actually flow through Redis (not some bypass).
  2. A claim made by client A is delivered to client B's socket, over
     the full production path: WS(A) -> Daphne -> Redis -> Daphne -> WS(B).
  3. Release round-trips the same way.

Requires the dev server to be running with REDIS_URL set:

    $env:REDIS_URL = "redis://127.0.0.1:6379/0"
    $env:MOCK_INSTRUMENTS = "1"
    python manage.py runserver 0.0.0.0:8000

Then run from Backend/ac_shunt with the venv active:

    python scripts/phase5b_e2e_smoke.py

The test creates a unique workstation row with an instrument_address of
127.0.0.200 (plus a random suffix), so it won't collide with real
bench data or with other concurrent smoke runs.

Exit code 0 = all assertions passed.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path

import django

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ac_shunt.settings")
django.setup()

import redis  # noqa: E402
import websockets  # noqa: E402
from asgiref.sync import sync_to_async  # noqa: E402

from api.models import Workstation, WorkstationClaim  # noqa: E402

WS_URL = "ws://127.0.0.1:8000/ws/host-sync/"
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")


GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}[ OK ]{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"{RED}[FAIL]{RESET} {msg}")


def info(msg: str) -> None:
    print(f"{YELLOW}[INFO]{RESET} {msg}")


async def _drain_initial(ws, max_msgs: int = 4, timeout: float = 2.0) -> list[dict]:
    """Pull the burst of `session_changed` + `workstation_claims_update`
    messages the server pushes on connect so they don't pollute later asserts.
    """
    out: list[dict] = []
    end = time.time() + timeout
    while time.time() < end and len(out) < max_msgs:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=end - time.time())
        except (asyncio.TimeoutError, websockets.ConnectionClosed):
            break
        out.append(json.loads(raw))
    return out


async def _recv_until(ws, predicate, timeout: float = 5.0) -> dict | None:
    """Read WS messages until one matches predicate(msg) or timeout."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=end - time.time())
        except asyncio.TimeoutError:
            return None
        except websockets.ConnectionClosed:
            return None
        msg = json.loads(raw)
        if predicate(msg):
            return msg
    return None


def _redis_monitor_thread(stop_event, collected: list[dict]):
    """Run Redis MONITOR in a background thread.

    ``channels_redis.core.RedisChannelLayer`` uses Redis Lists (RPUSH/BRPOP)
    and Sets (SADD) for its wire protocol, not pub/sub, so a pub/sub
    subscriber would see nothing even when the backplane is fully engaged.
    MONITOR streams every command Redis executes, which gives us
    backend-agnostic proof that the channel layer is actually talking to
    Redis during the test window.
    """
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        with r.monitor() as m:
            for cmd in m.listen():
                if stop_event.is_set():
                    break
                command = cmd.get("command", "") or ""
                if "asgi" in command.lower():
                    collected.append({"command": command, "ts": time.time()})
    except Exception as exc:
        collected.append({"command": f"[monitor error: {exc!r}]", "ts": time.time()})


async def main() -> int:
    info(f"WS   -> {WS_URL}")
    info(f"Redis-> {REDIS_URL}")

    test_ip = f"127.0.0.200"
    unique_suffix = uuid.uuid4().hex[:6]
    ws_name = f"Phase5b-Smoke-{unique_suffix}"

    workstation = await sync_to_async(Workstation.objects.create)(
        name=ws_name,
        identifier=f"smoke-{unique_suffix}",
        is_default=False,
        is_active=True,
        instrument_addresses=[test_ip],
    )
    ok(f"Seeded Workstation id={workstation.id} name={ws_name!r} ip={test_ip}")

    stop_event = threading.Event()
    redis_events: list[dict] = []
    snoop_thread = threading.Thread(
        target=_redis_monitor_thread,
        args=(stop_event, redis_events),
        daemon=True,
    )
    snoop_thread.start()
    await asyncio.sleep(0.3)

    try:
        host_ws = await websockets.connect(WS_URL, open_timeout=5)
        observer_ws = await websockets.connect(WS_URL, open_timeout=5)
        ok("Opened two WebSocket clients to the running Daphne server")

        await _drain_initial(host_ws)
        await _drain_initial(observer_ws)

        await host_ws.send(json.dumps({"command": "identify", "role": "host"}))
        await observer_ws.send(json.dumps({"command": "identify", "role": "remote"}))
        await asyncio.sleep(0.3)
        ok("Both clients identified (host + remote)")

        await _drain_initial(host_ws, max_msgs=8, timeout=1.0)
        await _drain_initial(observer_ws, max_msgs=8, timeout=1.0)

        claim_payload = {
            "command": "claim_workstation",
            "ip": test_ip,
            "client_id": f"smoke-client-{unique_suffix}",
        }
        await host_ws.send(json.dumps(claim_payload))
        info(f"Host sent claim_workstation ip={test_ip}")

        def _is_claim_for_ip(msg: dict) -> bool:
            if msg.get("type") != "workstation_claims_update":
                return False
            return test_ip in (msg.get("claims") or {})

        observer_msg = await _recv_until(observer_ws, _is_claim_for_ip, timeout=5.0)
        if observer_msg is None:
            fail("Observer WS never received claim broadcast")
            return 1
        ok("Observer WS received the claim broadcast")

        host_echo = await _recv_until(host_ws, _is_claim_for_ip, timeout=5.0)
        if host_echo is None:
            fail("Host WS did not receive its own broadcast (group membership bug?)")
            return 1
        ok("Host WS also received the broadcast (group fan-out works for sender)")

        claim_row = await sync_to_async(
            lambda: WorkstationClaim.objects.filter(workstation_id=workstation.id).first()
        )()
        if claim_row is None:
            fail("WorkstationClaim DB row missing after claim")
            return 1
        ok(f"WorkstationClaim row exists: owner_label={claim_row.owner_label!r}")

        await host_ws.send(json.dumps({"command": "release_workstation", "ip": test_ip}))
        info(f"Host sent release_workstation ip={test_ip}")

        def _is_release_for_ip(msg: dict) -> bool:
            if msg.get("type") != "workstation_claims_update":
                return False
            return test_ip not in (msg.get("claims") or {})

        observer_release = await _recv_until(observer_ws, _is_release_for_ip, timeout=5.0)
        if observer_release is None:
            fail("Observer WS never received release broadcast")
            return 1
        ok("Observer WS received the release broadcast")

        post_release_row = await sync_to_async(
            lambda: WorkstationClaim.objects.filter(workstation_id=workstation.id).first()
        )()
        if post_release_row is not None:
            fail("WorkstationClaim row still present after release")
            return 1
        ok("WorkstationClaim row removed after release")

        await host_ws.close()
        await observer_ws.close()
        ok("Closed both WebSocket clients")

        await asyncio.sleep(0.5)
        stop_event.set()
        snoop_thread.join(timeout=3.0)

        asgi_cmds = [e for e in redis_events if "asgi" in e["command"].lower()]
        if not asgi_cmds:
            fail(
                "Redis MONITOR saw ZERO asgi commands during the test — "
                "broadcasts may be bypassing the Redis channel layer."
            )
            return 1

        verbs = {cmd["command"].split()[0].upper() for cmd in asgi_cmds}
        broadcast_verbs = {"RPUSH", "ZADD", "SADD", "LPUSH", "PUBLISH", "ZRANGEBYSCORE"}
        evidence = verbs & broadcast_verbs
        ok(
            f"Redis MONITOR captured {len(asgi_cmds)} asgi commands; "
            f"verbs seen: {sorted(verbs)}"
        )
        if not evidence:
            fail(
                "Saw asgi:* activity but none of the expected broadcast verbs "
                "(RPUSH/ZADD/SADD/PUBLISH). Channel layer may be misconfigured."
            )
            return 1
        ok(
            f"Broadcast-path Redis commands confirmed: {sorted(evidence)} "
            "(channels_redis is actively writing to Redis)."
        )

        return 0
    finally:
        stop_event.set()
        snoop_thread.join(timeout=2.0)
        await sync_to_async(
            lambda: WorkstationClaim.objects.filter(workstation_id=workstation.id).delete()
        )()
        await sync_to_async(workstation.delete)()
        info("Cleaned up seeded Workstation + any leftover claim rows")


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    if exit_code == 0:
        print(f"\n{GREEN}PHASE 5B E2E SMOKE: PASSED{RESET}")
    else:
        print(f"\n{RED}PHASE 5B E2E SMOKE: FAILED{RESET}")
    sys.exit(exit_code)
