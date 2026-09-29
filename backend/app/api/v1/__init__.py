from fastapi import APIRouter

from app.api.v1 import (
    admin,
    admin_reference,
    analysis,
    auth,
    calculations,
    catalog,
    layouts,
    matching,
    me,
    organizations,
    params,
    projects,
    reference,
    reports,
    scenarios,
    simulations,
    system,
    vendor,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(organizations.router)
api_router.include_router(reference.router)
api_router.include_router(catalog.router)
api_router.include_router(projects.router)
api_router.include_router(params.router)
api_router.include_router(layouts.router)
api_router.include_router(matching.router)
api_router.include_router(scenarios.router)
api_router.include_router(calculations.router)
api_router.include_router(analysis.router)
api_router.include_router(simulations.router)
api_router.include_router(reports.router)
api_router.include_router(admin.router)
api_router.include_router(vendor.router)
api_router.include_router(admin_reference.router)
