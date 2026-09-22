from typing import Any
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.service.projects.processes import ProcessesOverview, ProcessView

PROFILE_PROVENANCE: dict[str, Any] = {
    "status": "assumption",
    "note": "Пиковое окно sim_peak_window_hours в середине рабочего дня с пиковым коэффициентом объекта, "
    "остальные рабочие часы — равномерно; сумма за сутки — объём из параметров",
}


class LaborGroup(ApiModel):
    key: str
    name: str
    headcount: float
    salary_rub_month: float = Field(description="Оклад gross")
    cost_rub_year: float = Field(
        description="Полные затраты работодателя (оклад × 12 × коэффициент начислений)"
    )


class CurrentState(ApiModel):
    labor_groups: list[LaborGroup]
    fte: float
    cost_rub_year: float
    productivity_per_hour: float | None = Field(default=None, description="На одного сотрудника")
    sla_now: float | None = None


class ProcessDemand(ApiModel):
    process_key: str
    name: str
    demand_unit: str
    demand_per_day: float | None
    avg_per_hour: float | None
    peak_per_hour: float | None
    hourly_profile: list[float] | None = Field(
        default=None, description="Доли суточного объёма по часам (сумма = 1); тот же профиль играет имитация"
    )
    profile_provenance: dict[str, Any] | None = None
    current: CurrentState
    share_of_labor_cost: float = Field(ge=0, le=1)
    robotizable: bool
    solution_types: list[str]
    notes: list[str]

    @classmethod
    def from_domain(cls, item: ProcessView) -> "ProcessDemand":
        result = item.result
        return cls(
            process_key=result.process_key,
            name=result.name,
            demand_unit=item.demand_unit,
            demand_per_day=result.demand_per_day,
            avg_per_hour=result.avg_per_hour,
            peak_per_hour=result.peak_per_hour,
            hourly_profile=item.hourly_profile,
            profile_provenance=PROFILE_PROVENANCE if item.hourly_profile else None,
            current=CurrentState(
                labor_groups=[
                    LaborGroup(
                        key=g.key,
                        name=g.name,
                        headcount=g.headcount,
                        salary_rub_month=g.salary_rub_month,
                        cost_rub_year=g.cost_rub_year,
                    )
                    for g in result.labor
                ],
                fte=result.fte,
                cost_rub_year=result.cost_rub_year,
                productivity_per_hour=result.productivity_per_hour,
            ),
            share_of_labor_cost=min(result.share_of_labor_cost, 1.0),
            robotizable=item.robotizable,
            solution_types=item.solution_types,
            notes=item.notes,
        )


class ProcessDemandList(ApiModel):
    project_id: UUID
    project_version: int
    processes: list[ProcessDemand]
    total_labor_cost_rub_year: float
    working_hours_per_day: float | None = None
    peak_factor: float | None = None

    @classmethod
    def from_domain(cls, item: ProcessesOverview) -> "ProcessDemandList":
        return cls(
            project_id=item.project_id,
            project_version=item.project_version,
            processes=[ProcessDemand.from_domain(p) for p in item.processes],
            total_labor_cost_rub_year=item.total_labor_cost_rub_year,
            working_hours_per_day=item.working_hours_per_day,
            peak_factor=item.peak_factor,
        )
