import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import analysis, catalog, projects
from .config import settings
from .db import Base, SessionLocal, engine
from .services.catalog import load_catalog

logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.app_name, version="0.2.0", description="RoboScope API: данные объекта → подбор → количество → экономика → симуляция → рекомендация.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?", allow_methods=["*"], allow_headers=["*"])
app.include_router(projects.router)
app.include_router(catalog.router)
app.include_router(analysis.router)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        n = load_catalog(db)
        logging.getLogger(__name__).info("catalog loaded: %s robots", n)


@app.get("/api/health")
def health():
    return {"status": "ok", "import_provider": settings.import_provider, "explanation_provider": settings.explanation_provider}
