from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Path,
    Request,
    Response,
    UploadFile,
    status,
)

from app.api.deps import UowDep, require
from app.api.files import content_disposition
from app.api.schemas.layouts import FileRef
from app.api.schemas.reports import Report, ReportList, ReportRequest, VisualUpload
from app.core.errors import FileTooLargeError, UnsupportedFileTypeError
from app.domain.auth import CurrentUser, Permission
from app.service.jobs.queue import JobQueue
from app.service.reports.service import REPORT_JOB, ReportService
from app.service.simulations.service import SimulationService

router = APIRouter(tags=["reports"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ReportIdPath = Annotated[UUID, Path()]
VISUAL_TYPES = frozenset({"image/png", "image/gif"})
VISUAL_MAX_BYTES = 10 * 1024 * 1024


def get_queue(request: Request) -> JobQueue:
    return JobQueue(request.app.state.settings, request.app.state.db)


@router.get(
    "/projects/{project_id}/reports", operation_id="listReports", summary="Сформированные отчёты проекта"
)
async def list_reports(project_id: Annotated[UUID, Path()], user: OwnerDep, uow: UowDep) -> ReportList:
    service = ReportService(uow, user)
    return ReportList(
        items=[Report.from_row(r, await service.file(r)) for r in await service.runs(project_id)]
    )


@router.post(
    "/projects/{project_id}/reports",
    operation_id="createReport",
    summary="Сформировать отчёт PDF / Excel с формулами / DOCX (фоновая задача)",
    status_code=status.HTTP_202_ACCEPTED,
    responses={409: {"description": "Нет расчётов для отчёта"}},
)
async def create_report(
    project_id: Annotated[UUID, Path()],
    payload: ReportRequest,
    user: OwnerDep,
    uow: UowDep,
    queue: Annotated[JobQueue, Depends(get_queue)],
    background: BackgroundTasks,
) -> Report:
    report = await ReportService(uow, user).create(
        project_id, payload.format, payload.model_dump(mode="json", exclude={"format"})
    )
    if report.job_id is not None:
        background.add_task(queue.dispatch, REPORT_JOB, report.job_id)
    return Report.from_row(report, None)


@router.get(
    "/reports/{report_id}",
    operation_id="getReport",
    summary="Отчёт и ссылка на файл",
    responses={404: {"description": "Не найдено"}},
)
async def get_report(report_id: ReportIdPath, user: OwnerDep, uow: UowDep) -> Report:
    service = ReportService(uow, user)
    report = await service.get(report_id)
    return Report.from_row(report, await service.file(report))


@router.get(
    "/reports/{report_id}/download",
    operation_id="downloadReport",
    summary="Скачать файл отчёта",
    response_class=Response,
    responses={
        200: {
            "description": "Файл",
            "content": {
                "application/pdf": {},
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                "application/json": {},
            },
        },
        409: {"description": "Ещё формируется"},
    },
)
async def download_report(report_id: ReportIdPath, user: OwnerDep, uow: UowDep) -> Response:
    stored = await ReportService(uow, user).download(report_id)
    return Response(
        content=stored.data,
        media_type=stored.content_type,
        headers={"Content-Disposition": content_disposition(stored.filename)},
    )


@router.post(
    "/simulations/{simulation_id}/visuals",
    operation_id="uploadSimulationVisual",
    summary="Сохранить снимок или запись плеера для отчёта (ТЗ 3.7.4)",
    status_code=status.HTTP_201_CREATED,
    responses={413: {"description": "Файл больше 10 МБ"}, 415: {"description": "Неподдерживаемый формат"}},
)
async def upload_visual(
    simulation_id: Annotated[UUID, Path()],
    user: OwnerDep,
    uow: UowDep,
    file: Annotated[UploadFile, File()],
    kind: Annotated[Literal["simulation_png", "simulation_gif", "chart_png"], Form()],
    caption: Annotated[str | None, Form(max_length=300)] = None,
) -> VisualUpload:
    run = await SimulationService(uow, user).get(simulation_id)
    content_type = file.content_type or ""
    if content_type not in VISUAL_TYPES:
        raise UnsupportedFileTypeError("Снимок принимается в PNG или GIF")
    data = await file.read()
    if len(data) > VISUAL_MAX_BYTES:
        raise FileTooLargeError("Снимок больше 10 МБ")
    stored = await ReportService(uow, user).upload_visual(
        run.project_id, simulation_id, caption or file.filename or "Снимок имитации", content_type, data
    )
    return VisualUpload(
        id=stored.id,
        kind=kind,
        simulation_id=simulation_id,
        file=FileRef(
            url=f"/api/v1/files/{stored.id}",
            filename=stored.filename,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
        ),
        caption=caption,
    )


@router.get(
    "/files/{file_id}",
    operation_id="downloadFile",
    summary="Скачать загруженный файл проекта (снимок имитации, подложка, отчёт)",
    response_class=Response,
    responses={200: {"description": "Файл"}, 404: {"description": "Не найдено"}},
)
async def download_file(file_id: Annotated[UUID, Path()], user: OwnerDep, uow: UowDep) -> Response:
    stored = await ReportService(uow, user).stored(file_id)
    return Response(
        content=stored.data,
        media_type=stored.content_type,
        headers={"Content-Disposition": content_disposition(stored.filename, inline=True)},
    )
