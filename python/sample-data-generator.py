import json
import random
from datetime import datetime, timedelta

# Configuration
NUM_WO = 2500
WORK_CENTERS = ["WC-001", "WC-002", "WC-003", "WC-004", "WC-005"]

# Generate Work Orders
work_orders = []
for i in range(1, NUM_WO + 1):
    wo_id = f"WO-{i:04d}"
    
    # Randomly select 0 to 3 dependencies from previously created IDs to ensure DAG
    num_deps = random.choices([0, 1, 2, 3], weights=[0.6, 0.25, 0.1, 0.05])[0]
    dependencies = []
    if i > 1:
        dep_pool = [f"WO-{j:04d}" for j in range(max(1, i-50), i)] # Limit lookback for realistic chains
        dependencies = random.sample(dep_pool, min(num_deps, len(dep_pool)))
        
    work_orders.append({
        "id": wo_id,
        "work_center_id": random.choice(WORK_CENTERS),
        "duration_minutes": random.randint(30, 240),
        "priority": random.randint(1, 5),
        "dependencies": sorted(dependencies)
    })

# Final Data Structure
data = {
    "work_centers": [
        {"id": "WC-001", "name": "Milling A", "shift": {"days": ["MON", "TUE", "WED", "THU", "FRI"], "start": "08:00:00Z", "end": "17:00:00Z"}},
        {"id": "WC-002", "name": "Milling B", "shift": {"days": ["MON", "TUE", "WED", "THU", "FRI"], "start": "08:00:00Z", "end": "17:00:00Z"}},
        {"id": "WC-003", "name": "Lathe A", "shift": {"days": ["MON", "TUE", "WED", "THU", "FRI"], "start": "08:00:00Z", "end": "17:00:00Z"}},
        {"id": "WC-004", "name": "Lathe B", "shift": {"days": ["MON", "TUE", "WED", "THU", "FRI"], "start": "08:00:00Z", "end": "17:00:00Z"}},
        {"id": "WC-005", "name": "Assembly/QA", "shift": {"days": ["MON", "TUE", "WED", "THU", "FRI"], "start": "08:00:00Z", "end": "17:00:00Z"}}
    ],
    "maintenance_windows": [
        {"id": "MNT-001", "work_center_id": "WC-001", "start": "2026-02-02T08:00:00Z", "end": "2026-02-02T12:00:00Z"},
        {"id": "MNT-002", "work_center_id": "WC-003", "start": "2026-02-15T08:00:00Z", "end": "2026-02-15T17:00:00Z"},
        {"id": "MNT-003", "work_center_id": "WC-005", "start": "2026-02-20T12:00:00Z", "end": "2026-02-20T16:00:00Z"}
    ],
    "work_orders": work_orders
}

# Output to file
with open("./data/stress_test_manufacturing_data.json", "w") as f:
    json.dump(data, f, indent=2)

import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

# =========================
# Configuration
# =========================
NUM_WO = 2500
WORK_CENTERS = [
    ("WC-001", "Milling A"),
    ("WC-002", "Milling B"),
    ("WC-003", "Lathe A"),
    ("WC-004", "Lathe B"),
    ("WC-005", "Assembly/QA"),
]

# Mon-Fri 08:00-17:00 UTC
SHIFT_DAYS = [0, 1, 2, 3, 4]  # Monday=0 .. Sunday=6 (Python weekday)
SHIFT_START_HOUR = 8
SHIFT_END_HOUR = 17

# Base date for initial schedule placement
BASE_START_ISO = "2026-02-02T08:00:00Z"

# Maintenance windows (blocked time periods) per work center
MAINTENANCE_WINDOWS = [
    {"id": "MNT-001", "work_center_id": "WC-001", "start": "2026-02-02T08:00:00Z", "end": "2026-02-02T12:00:00Z", "reason": "Planned PM"},
    {"id": "MNT-002", "work_center_id": "WC-003", "start": "2026-02-15T08:00:00Z", "end": "2026-02-15T17:00:00Z", "reason": "Planned PM"},
    {"id": "MNT-003", "work_center_id": "WC-005", "start": "2026-02-20T12:00:00Z", "end": "2026-02-20T16:00:00Z", "reason": "Calibration"},
]

# % of work orders that are fixed maintenance orders (cannot be rescheduled)
MAINTENANCE_WO_RATE = 0.004  # ~10 out of 2500

# =========================
# Date helpers (UTC)
# =========================

def parse_utc(iso: str) -> datetime:
    # ISO like 2026-02-02T08:00:00Z
    if iso.endswith("Z"):
        iso = iso[:-1] + "+00:00"
    return datetime.fromisoformat(iso).astimezone(timezone.utc)


def to_iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class BlockedInterval:
    start: datetime
    end: datetime
    reason: str


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def in_blocked(t: datetime, blocked: List[BlockedInterval]) -> Optional[BlockedInterval]:
    for b in blocked:
        if b.start <= t < b.end:
            return b
    return None


def next_shift_window(t: datetime) -> Tuple[datetime, datetime]:
    """Return (shift_start, shift_end) for the current day if applicable,
    otherwise the next future shift window. Assumes Mon-Fri schedule."""

    # Search up to 21 days ahead for safety
    cur = t
    for _ in range(21):
        day_start = datetime(cur.year, cur.month, cur.day, tzinfo=timezone.utc)
        weekday = day_start.weekday()  # Mon=0..Sun=6
        if weekday in SHIFT_DAYS:
            s = day_start + timedelta(hours=SHIFT_START_HOUR)
            e = day_start + timedelta(hours=SHIFT_END_HOUR)
            if cur < s:
                return s, e
            if s <= cur < e:
                return s, e
        # move to next day
        cur = (day_start + timedelta(days=1, hours=0, minutes=0, seconds=0))
    raise ValueError("No shift window found within search horizon.")


def normalize_start(candidate: datetime, blocked: List[BlockedInterval]) -> datetime:
    """Move candidate forward until it lands inside a shift AND not inside a blocked interval."""
    t = candidate
    while True:
        shift_start, shift_end = next_shift_window(t)

        if t < shift_start:
            t = shift_start
            continue

        if t >= shift_end:
            # jump to next day (a tiny step forward is enough; we re-normalize)
            t = shift_end + timedelta(minutes=1)
            continue

        b = in_blocked(t, blocked)
        if b:
            t = b.end
            continue

        return t


def calculate_end_date_with_shifts(start: datetime, duration_minutes: int, blocked: List[BlockedInterval]) -> datetime:
    """Consume working minutes across shifts while skipping blocked intervals."""
    remaining = duration_minutes
    t = start

    while remaining > 0:
        t = normalize_start(t, blocked)
        shift_start, shift_end = next_shift_window(t)

        # Determine the earliest stop time: either shift_end or the next blocked.start
        work_until = shift_end
        for b in blocked:
            if b.start > t and b.start < work_until:
                work_until = b.start

        available = int((work_until - t).total_seconds() // 60)
        if available <= 0:
            t = work_until + timedelta(minutes=1)
            continue

        used = min(remaining, available)
        t = t + timedelta(minutes=used)
        remaining -= used

        if remaining > 0:
            # bump forward so we don't get stuck on exact boundaries
            t = t + timedelta(minutes=1)

    return t


# =========================
# Build Work Centers (doc-shape)
# =========================

# Convert Python weekday (Mon=0..Sun=6) to spec dayOfWeek (Sun=0..Sat=6)
# Spec: 0=Sunday
PY_TO_SPEC_DOW = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}


def build_work_centers() -> List[dict]:
    windows_by_wc: Dict[str, List[dict]] = {wc_id: [] for wc_id, _ in WORK_CENTERS}
    for w in MAINTENANCE_WINDOWS:
        windows_by_wc[w["work_center_id"]].append(
            {
                "startDate": w["start"],
                "endDate": w["end"],
                "reason": w.get("reason") or "maintenance",
            }
        )

    shifts = []
    for py_dow in SHIFT_DAYS:
        shifts.append(
            {
                "dayOfWeek": PY_TO_SPEC_DOW[py_dow],
                "startHour": SHIFT_START_HOUR,
                "endHour": SHIFT_END_HOUR,
            }
        )

    docs = []
    for wc_id, wc_name in WORK_CENTERS:
        docs.append(
            {
                "docId": wc_id,
                "docType": "workCenter",
                "data": {
                    "name": wc_name,
                    "shifts": shifts,
                    "maintenanceWindows": windows_by_wc.get(wc_id, []),
                },
            }
        )

    return docs


# =========================
# Build Work Orders (doc-shape)
# =========================

def build_blocked_by_wc(work_center_docs: List[dict]) -> Dict[str, List[BlockedInterval]]:
    blocked_by_wc: Dict[str, List[BlockedInterval]] = {}
    for wc in work_center_docs:
        wc_id = wc["docId"]
        blocked: List[BlockedInterval] = []
        for mw in wc["data"].get("maintenanceWindows", []):
            blocked.append(
                BlockedInterval(
                    start=parse_utc(mw["startDate"]),
                    end=parse_utc(mw["endDate"]),
                    reason=f"maintenanceWindow:{mw.get('reason','maintenance')}",
                )
            )
        blocked.sort(key=lambda b: b.start)
        blocked_by_wc[wc_id] = blocked
    return blocked_by_wc


def add_fixed_maintenance_orders(
    work_orders: List[dict],
    blocked_by_wc: Dict[str, List[BlockedInterval]],
    count: int,
) -> None:
    """Insert a few fixed maintenance work orders (isMaintenance=true) into the dataset."""
    base = parse_utc(BASE_START_ISO)
    for i in range(count):
        wc_id, _ = random.choice(WORK_CENTERS)

        # pick a random day offset and time within shift
        day_offset = random.randint(0, 25)
        start = base + timedelta(days=day_offset, hours=random.randint(0, 6))  # 08:00..14:00-ish
        start = normalize_start(start, blocked_by_wc[wc_id])

        duration = random.choice([30, 60, 90, 120])
        end = calculate_end_date_with_shifts(start, duration, blocked_by_wc[wc_id])

        wo_id = f"WO-MNT-{i+1:03d}"
        work_orders.append(
            {
                "docId": wo_id,
                "docType": "workOrder",
                "data": {
                    "workOrderNumber": wo_id,
                    "manufacturingOrderId": "MO-0001",
                    "workCenterId": wc_id,
                    "startDate": to_iso_z(start),
                    "endDate": to_iso_z(end),
                    "durationMinutes": duration,
                    "isMaintenance": True,
                    "dependsOnWorkOrderIds": [],
                },
            }
        )

        # Also block that time on the WC so scheduled work orders won't overlap
        blocked_by_wc[wc_id].append(BlockedInterval(start=start, end=end, reason=f"fixedMaintenanceOrder:{wo_id}"))
        blocked_by_wc[wc_id].sort(key=lambda b: b.start)


def build_work_orders(work_center_docs: List[dict]) -> List[dict]:
    blocked_by_wc = build_blocked_by_wc(work_center_docs)

    # Generate dependency-safe list (DAG) similar to the original script
    raw_work_orders = []
    for i in range(1, NUM_WO + 1):
        wo_id = f"WO-{i:04d}"

        num_deps = random.choices([0, 1, 2, 3], weights=[0.6, 0.25, 0.1, 0.05])[0]
        dependencies: List[str] = []
        if i > 1:
            dep_pool = [f"WO-{j:04d}" for j in range(max(1, i - 50), i)]
            dependencies = random.sample(dep_pool, min(num_deps, len(dep_pool)))

        wc_id, _ = random.choice(WORK_CENTERS)
        raw_work_orders.append(
            {
                "id": wo_id,
                "work_center_id": wc_id,
                "duration_minutes": random.randint(30, 240),
                "priority": random.randint(1, 5),
                "dependencies": sorted(dependencies),
            }
        )

    # Create docs and assign an initial schedule per work center (sequential, shift-aware)
    base = parse_utc(BASE_START_ISO)

    # Split by WC and order by priority desc (and then by id)
    by_wc: Dict[str, List[dict]] = {wc_id: [] for wc_id, _ in WORK_CENTERS}
    for rwo in raw_work_orders:
        by_wc[rwo["work_center_id"]].append(rwo)

    for wc_id in by_wc:
        by_wc[wc_id].sort(key=lambda x: (-x["priority"], x["id"]))

    docs: List[dict] = []

    # Add some fixed maintenance work orders up front
    mnt_count = max(1, int(NUM_WO * MAINTENANCE_WO_RATE))
    add_fixed_maintenance_orders(docs, blocked_by_wc, mnt_count)

    next_free: Dict[str, datetime] = {wc_id: base for wc_id, _ in WORK_CENTERS}

    for wc_id, rows in by_wc.items():
        t = next_free[wc_id]
        for rwo in rows:
            start = normalize_start(t, blocked_by_wc[wc_id])
            end = calculate_end_date_with_shifts(start, int(rwo["duration_minutes"]), blocked_by_wc[wc_id])

            docs.append(
                {
                    "docId": rwo["id"],
                    "docType": "workOrder",
                    "data": {
                        "workOrderNumber": rwo["id"],
                        "manufacturingOrderId": "MO-0001",
                        "workCenterId": wc_id,
                        "startDate": to_iso_z(start),
                        "endDate": to_iso_z(end),
                        "durationMinutes": int(rwo["duration_minutes"]),
                        "isMaintenance": False,
                        "dependsOnWorkOrderIds": rwo["dependencies"],
                    },
                }
            )

            # Move the line forward
            t = end
        next_free[wc_id] = t

    return docs


# =========================
# Build Manufacturing Orders (minimal)
# =========================

def build_manufacturing_orders() -> List[dict]:
    # Minimal: one MO for all WOs (fine for this test unless you want richer data)
    return [
        {
            "docId": "MO-0001",
            "docType": "manufacturingOrder",
            "data": {
                "manufacturingOrderNumber": "MO-0001",
                "itemId": "PIPE-001",
                "quantity": 1000,
                "dueDate": "2026-02-28T17:00:00Z",
            },
        }
    ]


def main() -> None:
    random.seed(42)

    work_centers = build_work_centers()
    work_orders = build_work_orders(work_centers)
    manufacturing_orders = build_manufacturing_orders()

    output = {
        "workCenters": work_centers,
        "workOrders": work_orders,
        "manufacturingOrders": manufacturing_orders,
    }

    out_path = "./data/stress_test_docs.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote {len(work_centers)} workCenters, {len(work_orders)} workOrders, {len(manufacturing_orders)} manufacturingOrders -> {out_path}")


if __name__ == "__main__":
    main()