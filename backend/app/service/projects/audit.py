from typing import Any
from uuid import UUID

from app.db.models import AuditEvent
from app.db.repositories.projects import ProjectRepository
from app.domain.auth import CurrentUser


class AuditLog:
    def __init__(self, repo: ProjectRepository, user: CurrentUser) -> None:
        self._repo = repo
        self._user = user

    def write(
        self,
        project_id: UUID | None,
        entity: str,
        action: str,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        note: str | None = None,
    ) -> None:
        self._repo.add(
            AuditEvent(
                project_id=project_id,
                actor=self._user.email,
                entity=entity,
                action=action,
                before=before,
                after=after,
                note=note,
            )
        )
