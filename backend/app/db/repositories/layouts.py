from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Layout, StoredFile


class LayoutRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, project_id: UUID, *, lock: bool = False) -> Layout | None:
        statement = select(Layout).where(Layout.project_id == project_id)
        if lock:
            statement = statement.with_for_update()
        layout: Layout | None = await self._session.scalar(statement)
        return layout

    def add(self, item: Layout | StoredFile) -> None:
        self._session.add(item)

    async def file(self, file_id: UUID) -> StoredFile | None:
        return await self._session.get(StoredFile, file_id)

    async def copy(self, source_id: UUID, target_id: UUID, actor: str) -> None:
        layout = await self.get(source_id)
        if layout is None:
            return
        background = await self.file(layout.background_file_id) if layout.background_file_id else None
        file_id = None
        if background is not None:
            copy = StoredFile(
                owner_id=background.owner_id,
                project_id=target_id,
                purpose=background.purpose,
                filename=background.filename,
                content_type=background.content_type,
                size_bytes=background.size_bytes,
                data=background.data,
            )
            self._session.add(copy)
            await self._session.flush()
            file_id = copy.id
        self._session.add(
            Layout(
                project_id=target_id,
                version=1,
                template=layout.template,
                width_m=layout.width_m,
                height_m=layout.height_m,
                zones=layout.zones,
                racks=layout.racks,
                nodes=layout.nodes,
                edges=layout.edges,
                generated=layout.generated,
                generator={**layout.generator, "project_version": 1},
                stats=layout.stats,
                derivation=layout.derivation,
                warnings=layout.warnings,
                background_file_id=file_id,
                background_scale_m_per_px=layout.background_scale_m_per_px,
                updated_by=actor,
            )
        )
