from collections.abc import Mapping

from app.engine.simulation.models import SimSettings
from app.engine.trace import Book

SECONDS_PER_MINUTE = 60.0
MM_PER_M = 1000.0


def _optional(norms: Book, key: str) -> float:
    quantity = norms.optional(key)
    return quantity.value if quantity is not None else 0.0


def settings_from(norms: Book, params: Mapping[str, float | None] | None = None) -> SimSettings:
    """Simulation settings from the norm registry; the same two-way width rule as the layout generator,
    including the pallet length from the object when it is given."""
    value = norms.value
    pallet_mm = (params or {}).get("pallet_dims_mm_length")
    loaded_m = pallet_mm / MM_PER_M if pallet_mm else value("layout_loaded_vehicle_width_m")
    return SimSettings(
        warmup_s=value("sim_warmup_min") * SECONDS_PER_MINUTE,
        takeover_wait_s=value("sim_human_takeover_wait_min") * SECONDS_PER_MINUTE,
        charge_threshold=value("sim_charge_threshold_share"),
        peak_window_h=value("sim_peak_window_hours"),
        peak_duration_h=value("sim_peak_duration_hours"),
        # Trucks at dock doors exist only in a warehouse; other objects have no such norms and no such flow.
        truck_pallets=_optional(norms, "sim_truck_pallets"),
        door_pallets_per_hour=_optional(norms, "layout_dock_pallets_per_door_hour"),
        aisle_capacity=int(value("sim_aisle_capacity_robots")),
        two_way_width_m=2 * loaded_m + value("aisle_safety_clearance_mm") / MM_PER_M,
        mtbf_h=value("sim_failure_mtbf_h"),
        repair_s=value("sim_repair_time_min") * SECONDS_PER_MINUTE,
        bottleneck_utilization=value("sim_bottleneck_utilization"),
        utilization_target=value("amr_utilization_target"),
        tow_dispatch_wait_s=value("sim_tow_dispatch_wait_min") * SECONDS_PER_MINUTE,
    )
