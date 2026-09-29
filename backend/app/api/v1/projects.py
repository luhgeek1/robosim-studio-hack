from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, Query, Response, status

from app.api.deps import UowDep, require
from app.api.schemas.projects import (
    AuditEvent,
    AuditList,
    Project,
    ProjectCopy,
    ProjectCreate,
    ProjectList,
    ProjectUpdate,
)
from app.domain.auth import CurrentUser, Permission
from app.domain.project.models import InitMode, ProjectStatus
from app.domain.reference import ObjectTypeKey
from app.service.projects.service import ProjectDraft, ProjectPatch, ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ProjectIdPath = Annotated[UUID, Path()]
MAX_PAGE_SIZE = 200


@router.get("", operation_id="listProjects", summary="Проекты пользователя")
async def list_projects(
    user: OwnerDep,
    uow: UowDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    q: Annotated[str | None, Query()] = None,
    object_type: Annotated[ObjectTypeKey | None, Query()] = None,
    project_status: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    sort: Annotated[Literal["updated_desc", "created_desc", "name"], Query()] = "updated_desc",
    organization_id: Annotated[UUID | None, Query()] = None,
) -> ProjectList:
    items, total = await ProjectService(uow, user).list_projects(
        organization_id=organization_id,
        q=q,
        object_type=object_type.value if object_type else None,
        status=project_status.value if project_status else None,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return ProjectList(
        items=[Project.from_domain(i) for i in items], page=page, page_size=page_size, total=total
    )


@router.post(
    "",
    operation_id="createProject",
    summary="Создать проект (пустой, из демо-данных или копией)",
    status_code=status.HTTP_201_CREATED,
)
async def create_project(payload: ProjectCreate, user: OwnerDep, uow: UowDep) -> Project:
    init = payload.init
    draft = ProjectDraft(
        name=payload.name,
        object_type=payload.object_type.value,
        mode=init.mode if init else InitMode.BLANK,
        demo_key=init.demo_key if init else None,
        source_project_id=init.source_project_id if init else None,
        organization_id=payload.organization_id,
        notes=payload.notes,
        tags=payload.tags,
    )
    return Project.from_domain(await ProjectService(uow, user).create(draft))


@router.get(
    "/{project_id}",
    operation_id="getProject",
    summary="Проект",
    responses={404: {"description": "Не найдено"}},
)
async def get_project(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> Project:
    return Project.from_domain(await ProjectService(uow, user).get(project_id))


@router.patch(
    "/{project_id}",
    operation_id="updateProject",
    summary="Переименовать, заметки, теги, статус, перенос в другую рабочую область",
)
async def update_project(
    project_id: ProjectIdPath, payload: ProjectUpdate, user: OwnerDep, uow: UowDep
) -> Project:
    patch = ProjectPatch(
        fields=frozenset(payload.model_fields_set),
        name=payload.name,
        notes=payload.notes,
        tags=payload.tags,
        status=ProjectStatus(payload.status) if payload.status else None,
        organization_id=payload.organization_id,
    )
    return Project.from_domain(await ProjectService(uow, user).update(project_id, patch))


@router.delete(
    "/{project_id}",
    operation_id="deleteProject",
    summary="Удалить проект вместе с файлами, расчётами и отчётами (ТЗ 4.4.6)",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> Response:
    await ProjectService(uow, user).delete(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/copy",
    operation_id="copyProject",
    summary="Копировать проект со сценариями (ТЗ 3.1.3)",
    status_code=status.HTTP_201_CREATED,
)
async def copy_project(
    project_id: ProjectIdPath,
    user: OwnerDep,
    uow: UowDep,
    payload: Annotated[ProjectCopy | None, Body()] = None,
) -> Project:
    return Project.from_domain(
        await ProjectService(uow, user).copy(project_id, payload.name if payload else None)
    )


@router.get(
    "/{project_id}/export.json",
    operation_id="exportProjectJson",
    summary="Полный снимок проекта (параметры, сценарии, расчёты) в JSON",
)
async def export_project(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> dict[str, Any]:
    return await ProjectService(uow, user).export(project_id)


@router.get("/{project_id}/audit", operation_id="listProjectAudit", summary="Журнал изменений проекта")
async def list_project_audit(
    project_id: ProjectIdPath,
    user: OwnerDep,
    uow: UowDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> AuditList:
    items, total = await ProjectService(uow, user).audit(project_id, page, page_size)
    return AuditList(
        items=[AuditEvent.from_domain(i) for i in items], page=page, page_size=page_size, total=total
    )
