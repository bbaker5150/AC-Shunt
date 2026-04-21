"""
Mock instrument fixtures for UI development without lab hardware.

Activated when settings.MOCK_INSTRUMENTS is True. Both the discovery REST
endpoint (api.views.discover_instruments) and the per-instrument status
WebSocket (api.consumers.InstrumentStatusConsumer) consult this module
so the whole Instrument Status page - discovery, workstation grouping,
connection badges, status flags, role assignment, Zero Cal - renders with
plausible data straight from a dev machine.

Addresses intentionally live in reserved/documentation-only IP space
(192.0.2.0/24, RFC 5737) so they cannot collide with anything real on
the local network, and are easy to spot in logs.
"""

from __future__ import annotations

import time
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Canonical mock inventory
# ---------------------------------------------------------------------------
# Two workstations so the "Active Workstation" selector has something to do:
#   - "Local Workstation" (plain GPIB addresses -> frontend groups these under
#     the local workstation bucket automatically)
#   - Remote workstation at 192.0.2.10 (visa://... addresses -> frontend
#     groups these by extracted IP)
#
# Models are chosen so the UI exercises every branch:
#   - 5730A  -> status supported, shows live decoded ISR flags
#   - 5790B  -> status supported, shows live decoded ISR flags
#   - 8100   -> frontend hardcodes Connected, no status flags
#   - 11713C -> frontend hardcodes Connected, no status flags
MOCK_INVENTORY: List[Dict[str, str]] = [
    # --- Local workstation -------------------------------------------------
    {
        "address": "GPIB0::3::INSTR",
        "identity": "FLUKE,5730A,MOCK-AC-SRC-001,1.20",
        "model": "5730A",
    },
    {
        "address": "GPIB0::5::INSTR",
        "identity": "FLUKE,5790B,MOCK-TI-RD-001,2.10",
        "model": "5790B",
    },
    {
        "address": "GPIB0::15::INSTR",
        "identity": "CLARKE-HESS,8100,MOCK-AMP-001,1.00",
        "model": "8100",
    },
    # --- Remote workstation at 192.0.2.10 ---------------------------------
    {
        "address": "visa://192.0.2.10/GPIB0::8::INSTR",
        "identity": "FLUKE,5730A,MOCK-DC-SRC-002,1.20",
        "model": "5730A",
    },
    {
        "address": "visa://192.0.2.10/GPIB0::9::INSTR",
        "identity": "FLUKE,5790B,MOCK-STD-RD-002,2.10",
        "model": "5790B",
    },
    {
        "address": "visa://192.0.2.10/GPIB0::28::INSTR",
        "identity": "AGILENT,11713C,MOCK-SWITCH-002,1.00",
        "model": "11713C",
    },
]

# Address prefixes that mark an instrument as a mock fixture. The status WS
# uses this to decide whether to skip pyvisa and synthesize a response.
MOCK_ADDRESS_PREFIXES = ("MOCK::", "visa://192.0.2.", "GPIB0::3::", "GPIB0::5::",
                         "GPIB0::15::", "GPIB0::8::", "GPIB0::9::", "GPIB0::28::")


def is_mock_address(address: Optional[str]) -> bool:
    """
    True when the given GPIB/VISA address belongs to the mock inventory.
    Used by the status WebSocket to decide whether it is allowed to skip
    the real instrument connection path.
    """
    if not address:
        return False
    return any(address.startswith(prefix) for prefix in MOCK_ADDRESS_PREFIXES) or \
        any(entry["address"] == address for entry in MOCK_INVENTORY)


# ---------------------------------------------------------------------------
# Mock status (ISR) payloads
# ---------------------------------------------------------------------------
# The frontend decoder expects a 16-character binary string where each bit
# maps to a named status flag. See `decodeInstrumentStatus` in
# Frontend/ac-shunt-interface/src/contexts/InstrumentContext.js for the full
# bit -> flag map. These mock strings are picked to produce visually varied
# but plausible "healthy" status cards per model.

# 5730A: OPER + RLOCK + PLOCK + REMOTE + SETTLED
#  bit idx: 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
#  meaning: OP EGG ESN BST RCP RLK PSH PLK OFF SCL WBN RMT STL ZER ACX UN
_ISR_5730A = "100001010001" + "1" + "000"          # 16 chars
# 5790B: OPER + REMOTE + SETTLED (simpler, different silhouette in the UI)
_ISR_5790B = "100000000001" + "1" + "000"
# Generic fallback for other status-supported variants
_ISR_FALLBACK = "1000000000001000"                  # OPER + SETTLED


def mock_isr_for_model(model: Optional[str]) -> str:
    """Return a 16-char ISR binary string matching the frontend decoder."""
    if not model:
        return _ISR_FALLBACK
    up = model.upper()
    if "5730" in up:
        return _ISR_5730A
    if "5790" in up:
        return _ISR_5790B
    return _ISR_FALLBACK


def mock_status_response(model: str, gpib_address: str) -> Dict:
    """
    Payload shape produced by the real InstrumentStatusConsumer.get_status_sync()
    path, matched exactly so the frontend handles mock responses without any
    special case.
    """
    return {
        "instrument_model": model,
        "gpib_address": gpib_address,
        "timestamp": time.time(),
        "status_report": "ok",
        "raw_isr": mock_isr_for_model(model),
    }


# ---------------------------------------------------------------------------
# Role assignment helper (used by the session seed command)
# ---------------------------------------------------------------------------
# Sensible default assignment for the seeded mock session so the
# "Assigned Roles" section on the panel is populated out-of-the-box.
MOCK_SESSION_ROLE_ASSIGNMENT: Dict[str, Dict[str, str]] = {
    "standard_reader": {
        "model": "5790B",
        "serial": "MOCK-STD-RD-002",
        "address": "visa://192.0.2.10/GPIB0::9::INSTR",
    },
    "test_reader": {
        "model": "5790B",
        "serial": "MOCK-TI-RD-001",
        "address": "GPIB0::5::INSTR",
    },
    "ac_source": {
        "serial": "MOCK-AC-SRC-001",
        "address": "GPIB0::3::INSTR",
    },
    "dc_source": {
        "serial": "MOCK-DC-SRC-002",
        "address": "visa://192.0.2.10/GPIB0::8::INSTR",
    },
    "amplifier": {
        "serial": "MOCK-AMP-001",
        "address": "GPIB0::15::INSTR",
    },
    "switch_driver": {
        "model": "11713C",
        "serial": "MOCK-SWITCH-002",
        "address": "visa://192.0.2.10/GPIB0::28::INSTR",
    },
}
