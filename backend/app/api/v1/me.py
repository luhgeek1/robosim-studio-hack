from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response, status

from app.api.deps import CurrentUserDep, UowDep, require
from app.api.schemas.auth import ApiKey, ApiKeyCreate, ApiKeyCreated, ApiKeyList, User, UserUpdate
from app.domain.auth import CurrentUser, Permission
from app.service.auth import ApiKeyService, ProfileService, ProfileUpdate

router = APIRouter(prefix="/me", tags=["auth"])

KeyManagerDep = Annotated[CurrentUser, Depends(require(Permission.API_KEYS_MANAGE))]


@router.get("", operation_id="getMe", summary="Текущий пользователь")
async def get_me(user: CurrentUserDep, uow: UowDep) -> User:
    return User.from_domain(await ProfileService(uow).get(user.id))


@router.patch("", operation_id="updateMe", summary="Обновить профиль")
async def update_me(payload: UserUpdate, user: CurrentUserDep, uow: UowDep) -> User:
    patch = ProfileUpdate(fields=frozenset(payload.model_fields_set), **payload.model_dump())
    return User.from_domain(await ProfileService(uow).update(user.id, patch))


@router.get(
    "/api-keys", operation_id="listApiKeys", summary="Ключи API пользователя (для интеграций WMS/ERP/1С)"
)
async def list_api_keys(user: KeyManagerDep, uow: UowDep) -> ApiKeyList:
    keys = await ApiKeyService(uow).list_keys(user.id)
    return ApiKeyList(items=[ApiKey.from_domain(key) for key in keys])


@router.post(
    "/api-keys",
    operation_id="createApiKey",
    summary="Создать ключ API",
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(payload: ApiKeyCreate, user: KeyManagerDep, uow: UowDep) -> ApiKeyCreated:
    created = await ApiKeyService(uow).create(user, payload.name, [scope.value for scope in payload.scopes])
    return ApiKeyCreated(**ApiKey.from_domain(created.info).model_dump(), secret=created.secret)


@router.delete(
    "/api-keys/{key_id}",
    operation_id="revokeApiKey",
    summary="Отозвать ключ API",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Не найдено"}},
)
async def revoke_api_key(key_id: Annotated[UUID, Path()], user: KeyManagerDep, uow: UowDep) -> Response:
    await ApiKeyService(uow).revoke(user.id, key_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
