from fastapi import APIRouter

from app.api.v1 import auth, catalog, matching, me, params, projects, reference, system

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(reference.router)
api_router.include_router(catalog.router)
api_router.include_router(projects.router)
api_router.include_router(params.router)
api_router.include_router(matching.router)
