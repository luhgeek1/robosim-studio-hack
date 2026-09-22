from collections.abc import Sequence
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, Path, Response, UploadFile

from app.api.deps import UowDep, require
from app.api.schemas.base import ApiModel
from app.api.schemas.layouts import Layout, LayoutGenerateRequest, LayoutUpdate
from app.domain.auth import CurrentUser, Permission
from app.service.layouts.service import LayoutPatch, LayoutService

router = APIRouter(prefix="/projects/{project_id}/layout", tags=["layout"])


def _dump(items: Sequence[ApiModel] | None) -> list[dict[str, Any]] | None:
    return [item.model_dump(by_alias=True) for item in items] if items is not None else None


OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ProjectIdPath = Annotated[UUID, Path()]


@router.get(
    "",
    operation_id="getLayout",
    summary="Планировка объекта (зоны, стеллажи, узлы, рёбра)",
    responses={404: {"description": "Планировка ещё не сгенерирована"}},
)
async def get_layout(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> Layout:
    return Layout.from_view(await LayoutService(uow, user).get(project_id))


@router.put(
    "",
    operation_id="updateLayout",
    summary="Сохранить правки редактора",
    responses={422: {"description": "Планировка не прошла проверку"}},
)
async def update_layout(
    project_id: ProjectIdPath, payload: LayoutUpdate, user: OwnerDep, uow: UowDep
) -> Layout:
    fields = payload.model_fields_set
    patch = LayoutPatch(
        zones=_dump(payload.zones),
        racks=_dump(payload.racks),
        nodes=_dump(payload.nodes),
        edges=_dump(payload.edges),
        background_scale_m_per_px=payload.background_scale_m_per_px,
        scale_set="background_scale_m_per_px" in fields,
    )
    return Layout.from_view(await LayoutService(uow, user).update(project_id, patch))


@router.post(
    "/generate",
    operation_id="generateLayout",
    summary="Сгенерировать планировку из параметров объекта",
    responses={409: {"description": "Не хватает параметров"}},
)
async def generate_layout(
    project_id: ProjectIdPath,
    user: OwnerDep,
    uow: UowDep,
    payload: Annotated[LayoutGenerateRequest | None, Body()] = None,
) -> Layout:
    request = payload or LayoutGenerateRequest()
    view = await LayoutService(uow, user).generate(
        project_id, request.template.value if request.template else None, request.overrides
    )
    return Layout.from_view(view)


@router.post(
    "/background",
    operation_id="uploadLayoutBackground",
    summary="Загрузить план объекта как подложку (png/jpg/pdf)",
    responses={
        404: {"description": "Планировка ещё не сгенерирована"},
        413: {"description": "Файл больше 10 МБ"},
        415: {"description": "Неподдерживаемый формат"},
    },
)
async def upload_background(
    project_id: ProjectIdPath,
    user: OwnerDep,
    uow: UowDep,
    file: Annotated[UploadFile, File()],
    scale_m_per_px: Annotated[float | None, Form(gt=0)] = None,
) -> Layout:
    content = await file.read()
    view = await LayoutService(uow, user).upload_background(
        project_id, file.filename or "plan", file.content_type or "", content, scale_m_per_px
    )
    return Layout.from_view(view)


@router.get(
    "/background",
    operation_id="getLayoutBackground",
    summary="Файл подложки планировки",
    response_class=Response,
    responses={
        200: {"content": {"image/png": {}, "image/jpeg": {}, "application/pdf": {}}, "description": "Файл"},
        404: {"description": "Подложка не загружена"},
    },
)
async def get_background(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> Response:
    stored = await LayoutService(uow, user).background(project_id)
    return Response(
        content=stored.data,
        media_type=stored.content_type,
        headers={"Content-Disposition": f'inline; filename="{stored.filename}"'},
    )
