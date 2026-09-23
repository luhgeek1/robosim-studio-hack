from app.engine.simulation.models import SimSettings
from app.engine.trace import Book

SECONDS_PER_MINUTE = 60.0
MM_PER_M = 1000.0


def settings_from(norms: Book) -> SimSettings:
    """Simulation settings from the norm registry; the same two-way width rule as the layout generator."""
    value = norms.value
    return SimSettings(
        warmup_s=value("sim_warmup_min") * SECONDS_PER_MINUTE,
        takeover_wait_s=value("sim_human_takeover_wait_min") * SECONDS_PER_MINUTE,
        charge_threshold=value("sim_charge_threshold_share"),
        peak_window_h=value("sim_peak_window_hours"),
        peak_duration_h=value("sim_peak_duration_hours"),
        truck_pallets=value("sim_truck_pallets"),
        door_pallets_per_hour=value("layout_dock_pallets_per_door_hour"),
        aisle_capacity=int(value("sim_aisle_capacity_robots")),
        two_way_width_m=2 * value("layout_loaded_vehicle_width_m")
        + value("aisle_safety_clearance_mm") / MM_PER_M,
        mtbf_h=value("sim_failure_mtbf_h"),
        repair_s=value("sim_repair_time_min") * SECONDS_PER_MINUTE,
        bottleneck_utilization=value("sim_bottleneck_utilization"),
        utilization_target=value("amr_utilization_target"),
        tow_dispatch_wait_s=value("sim_tow_dispatch_wait_min") * SECONDS_PER_MINUTE,
    )
