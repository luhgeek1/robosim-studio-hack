from enum import StrEnum


class LayoutTemplate(StrEnum):
    WAREHOUSE_U_FLOW = "warehouse_u_flow"
    WAREHOUSE_FLOW_THROUGH = "warehouse_flow_through"
    HOSPITAL_FLOOR = "hospital_floor"
    AIRPORT_APRON = "airport_apron"


class ZoneKind(StrEnum):
    RECEIVING = "receiving"
    STORAGE = "storage"
    PICKING = "picking"
    PACKING = "packing"
    SHIPPING = "shipping"
    BUFFER = "buffer"
    CHARGING = "charging"
    CORRIDOR = "corridor"
    STATION = "station"
    ELEVATOR = "elevator"
    KITCHEN = "kitchen"
    LAUNDRY = "laundry"
    PHARMACY = "pharmacy"
    LAB = "lab"
    WARD = "ward"
    WASTE = "waste"
    GATE = "gate"
    APRON = "apron"
    TERMINAL = "terminal"
    OBSTACLE = "obstacle"
    OFFICE = "office"


class NodeKind(StrEnum):
    WAYPOINT = "waypoint"
    DOCK_IN = "dock_in"
    DOCK_OUT = "dock_out"
    PICK_STATION = "pick_station"
    CHARGER = "charger"
    ELEVATOR = "elevator"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    RACK_FACE = "rack_face"
    PARKING = "parking"


class EdgeKind(StrEnum):
    MAIN_AISLE = "main_aisle"
    RACK_AISLE = "rack_aisle"
    CORRIDOR = "corridor"
    DOOR = "door"
    ELEVATOR_LINK = "elevator_link"
    RAMP = "ramp"


class RackOrientation(StrEnum):
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"


class RouteKey(StrEnum):
    """Average shortest paths the layout feeds into the cycle model; keys of `stats.avg_route_m`."""

    DOCK_IN_TO_STORAGE = "dock_in_to_storage"
    STORAGE_TO_DOCK_OUT = "storage_to_dock_out"
    STORAGE_TO_STORAGE = "storage_to_storage"
    POD_TO_STATION = "pod_to_station"
    STORAGE_TO_CHARGER = "storage_to_charger"
    SERVICE_TO_WARD = "service_to_ward"
    SORTING_TO_STAND = "sorting_to_stand"
    TERMINAL_TO_HUB = "terminal_to_hub"

    @property
    def param_key(self) -> str:
        return f"layout_route_{self.value}_m"
