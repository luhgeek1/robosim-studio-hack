from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from app.domain.catalog import ProductSummary


class ProposalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class ProposalKind(StrEnum):
    NEW_PRODUCT = "new_product"
    UPDATE = "update"


class ProposalDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


@dataclass(frozen=True, slots=True)
class ManufacturerRef:
    id: UUID
    name: str
    country: str
    region: str | None
    website: str | None


@dataclass(frozen=True, slots=True)
class ProposalInfo:
    id: UUID
    kind: ProposalKind
    status: ProposalStatus
    manufacturer: ManufacturerRef
    product_id: UUID | None
    product_name: str
    card: dict[str, Any] | None
    specs: list[dict[str, Any]]
    comment: str
    author_name: str | None
    author_email: str | None
    created_at: datetime
    catalog_version: str
    product_changed_since: bool
    reviewed_at: datetime | None = None
    reviewer_name: str | None = None
    review_comment: str | None = None


@dataclass(frozen=True, slots=True)
class KeySpecGap:
    key: str
    name: str


@dataclass(frozen=True, slots=True)
class VendorProductStats:
    product_id: UUID
    missing_key_specs: list[KeySpecGap]
    relevant_projects: int
    scenarios_count: int
    manual_adds: int
    pending_proposal_id: UUID | None


@dataclass(frozen=True, slots=True)
class VendorGap:
    object_type: str
    process_key: str
    process_name: str
    no_fit_count: int
    solution_types: list[str]


@dataclass(frozen=True, slots=True)
class VendorOverview:
    manufacturer: ManufacturerRef
    products: list[ProductSummary]
    stats: list[VendorProductStats]
    projects_total: int
    projects_by_object_type: dict[str, int]
    scenarios_with_products: int
    proposals_by_status: dict[str, int]
    gaps: list[VendorGap] = field(default_factory=list)
