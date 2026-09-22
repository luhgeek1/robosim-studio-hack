from app.domain.reference import ObjectTypeKey
from app.seeds.schemas import (
    load_catalog_mapping,
    load_norm_set,
    load_object_types,
    load_solution_types,
    load_spec_keys,
)


def test_seed_files_are_valid_and_consistent() -> None:
    solution_types = {item.key for item in load_solution_types()}
    mapping = load_catalog_mapping()
    all_types = solution_types | {item.key for item in mapping.extra_solution_types}
    spec_keys = {item.key for item in load_spec_keys()}
    object_types = {item.key: item for item in load_object_types()}

    assert set(object_types) == {ObjectTypeKey.WAREHOUSE, ObjectTypeKey.AIRPORT, ObjectTypeKey.HOSPITAL}
    for item in load_solution_types():
        assert set(item.capability_keys) <= spec_keys, item.key
    for product in mapping.products:
        assert product.solution_type in all_types, product.name
        allowed = {p.key for t in product.object_types for p in object_types[t].processes}
        assert set(product.processes) <= allowed, product.name


def test_norms_have_known_sources_and_unique_keys() -> None:
    norm_set = load_norm_set("v1")
    sources = {source.key for source in norm_set.sources}
    keys = [norm.key for norm in norm_set.norms]
    assert len(keys) == len(set(keys))
    assert {norm.source for norm in norm_set.norms} <= sources
    for norm in norm_set.norms:
        if norm.range and norm.range.min is not None and norm.range.max is not None:
            assert norm.range.min <= norm.value <= norm.range.max, norm.key


def test_every_process_labor_group_is_defined() -> None:
    for object_type in load_object_types():
        labor = {group.key for group in object_type.labor_groups}
        for process in object_type.processes:
            assert set(process.labor_groups) <= labor, (object_type.key, process.key)
