from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response, status

from app.api.deps import UowDep, require
from app.api.schemas.organizations import (
    IncomingInvitation,
    IncomingInvitationList,
    InvitationCreate,
    Organization,
    OrganizationDetail,
    OrganizationInvitation,
    OrganizationList,
    OrganizationWrite,
)
from app.domain.auth import CurrentUser, Permission
from app.service.organizations import OrganizationService

router = APIRouter(tags=["organizations"])

MemberDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
OrganizationIdPath = Annotated[UUID, Path()]
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Не найдено"}}
CONFLICT: dict[int | str, dict[str, Any]] = {409: {"description": "Конфликт"}}


@router.get("/organizations", operation_id="listOrganizations", summary="Организации пользователя")
async def list_organizations(user: MemberDep, uow: UowDep) -> OrganizationList:
    items = await OrganizationService(uow, user).mine()
    return OrganizationList(items=[Organization.from_domain(i) for i in items])


@router.post(
    "/organizations",
    operation_id="createOrganization",
    summary="Создать организацию (создатель — владелец)",
    status_code=status.HTTP_201_CREATED,
)
async def create_organization(payload: OrganizationWrite, user: MemberDep, uow: UowDep) -> Organization:
    return Organization.from_domain(await OrganizationService(uow, user).create(payload.name))


@router.get(
    "/organizations/{organization_id}",
    operation_id="getOrganization",
    summary="Организация: участники и ожидающие приглашения",
    responses=NOT_FOUND,
)
async def get_organization(
    organization_id: OrganizationIdPath, user: MemberDep, uow: UowDep
) -> OrganizationDetail:
    return OrganizationDetail.from_detail(await OrganizationService(uow, user).detail(organization_id))


@router.patch(
    "/organizations/{organization_id}",
    operation_id="updateOrganization",
    summary="Переименовать организацию (владелец)",
    responses=NOT_FOUND,
)
async def update_organization(
    organization_id: OrganizationIdPath, payload: OrganizationWrite, user: MemberDep, uow: UowDep
) -> Organization:
    return Organization.from_domain(
        await OrganizationService(uow, user).rename(organization_id, payload.name)
    )


@router.delete(
    "/organizations/{organization_id}",
    operation_id="deleteOrganization",
    summary="Удалить организацию вместе с её проектами (владелец)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_organization(organization_id: OrganizationIdPath, user: MemberDep, uow: UowDep) -> Response:
    await OrganizationService(uow, user).delete(organization_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/organizations/{organization_id}/invitations",
    operation_id="inviteToOrganization",
    summary="Пригласить пользователя по email (владелец)",
    status_code=status.HTTP_201_CREATED,
    responses={**NOT_FOUND, **CONFLICT},
)
async def invite_to_organization(
    organization_id: OrganizationIdPath, payload: InvitationCreate, user: MemberDep, uow: UowDep
) -> OrganizationInvitation:
    invitation = await OrganizationService(uow, user).invite(organization_id, str(payload.email))
    return OrganizationInvitation.from_domain(invitation)


@router.delete(
    "/organizations/{organization_id}/invitations/{invitation_id}",
    operation_id="revokeOrganizationInvitation",
    summary="Отозвать приглашение (владелец)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def revoke_invitation(
    organization_id: OrganizationIdPath,
    invitation_id: Annotated[UUID, Path()],
    user: MemberDep,
    uow: UowDep,
) -> Response:
    await OrganizationService(uow, user).revoke(organization_id, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/organizations/{organization_id}/members/{user_id}",
    operation_id="removeOrganizationMember",
    summary="Исключить участника (владелец) или выйти из организации (свой user_id)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **CONFLICT},
)
async def remove_member(
    organization_id: OrganizationIdPath,
    user_id: Annotated[UUID, Path()],
    user: MemberDep,
    uow: UowDep,
) -> Response:
    await OrganizationService(uow, user).remove_member(organization_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/invitations", operation_id="listMyInvitations", summary="Приглашения в организации, ждущие ответа"
)
async def list_my_invitations(user: MemberDep, uow: UowDep) -> IncomingInvitationList:
    items = await OrganizationService(uow, user).incoming()
    return IncomingInvitationList(items=[IncomingInvitation.from_domain(i) for i in items])


@router.post(
    "/me/invitations/{invitation_id}/accept",
    operation_id="acceptInvitation",
    summary="Принять приглашение — стать участником организации",
    responses=NOT_FOUND,
)
async def accept_invitation(
    invitation_id: Annotated[UUID, Path()], user: MemberDep, uow: UowDep
) -> Organization:
    return Organization.from_domain(await OrganizationService(uow, user).accept(invitation_id))


@router.post(
    "/me/invitations/{invitation_id}/decline",
    operation_id="declineInvitation",
    summary="Отклонить приглашение",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def decline_invitation(
    invitation_id: Annotated[UUID, Path()], user: MemberDep, uow: UowDep
) -> Response:
    await OrganizationService(uow, user).decline(invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
