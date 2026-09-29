from datetime import UTC, date, datetime, time, timedelta

from app.core.errors import InvalidInputError
from app.db.repositories.analytics import AnalyticsRepository
from app.db.uow import UnitOfWork
from app.domain.admin import AnalyticsOverview

# The platform has no request-to-vendor (RFQ) flow yet; the field stays in the contract for the dashboard.
NO_RFQ = 0


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


class AnalyticsService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def overview(self, date_from: date | None, date_to: date | None) -> AnalyticsOverview:
        """Demand overview over all users' projects; ``date_to`` is inclusive (whole UTC day)."""
        if date_from and date_to and date_from > date_to:
            raise InvalidInputError("Начало периода позже его конца")
        repo = AnalyticsRepository(
            self._uow.session,
            _day_start(date_from) if date_from else None,
            _day_start(date_to + timedelta(days=1)) if date_to else None,
        )
        return AnalyticsOverview(
            period_from=date_from,
            period_to=date_to,
            projects_by_object_type=await repo.projects_by_object_type(),
            calculations_count=await repo.calculations_count(),
            avg_payback_years_by_object_type=await repo.avg_payback_by_object_type(),
            top_products_in_scenarios=await repo.top_products(),
            demand_by_industry=await repo.projects_by_industry(),
            catalog_gaps=await repo.catalog_gaps(),
            rfq_count=NO_RFQ,
        )
