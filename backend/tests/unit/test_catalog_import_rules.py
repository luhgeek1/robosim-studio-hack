from app.domain.admin.catalog_import import CatalogKeys, field_changes, infer_solution_type

KNOWN: list[tuple[CatalogKeys, str]] = [
    (("Мобильные роботы", "AMR", "brs"), "amr_transport"),
    (("Мобильные роботы", "AMR", "brs"), "goods_to_person"),
    (("Мобильные роботы", "Робот-уборщик", "brs"), "cleaning_robot"),
    ((None, None, "bas"), "uav"),
    ((None, "Самолет", "bas"), "uav"),
]


def test_solution_type_from_the_most_specific_unanimous_classification() -> None:
    assert infer_solution_type(("Мобильные роботы", "Робот-уборщик", "brs"), KNOWN) == "cleaning_robot"
    # Subtype alone decides when the category is new.
    assert infer_solution_type(("Сервисные роботы", "Робот-уборщик", "brs"), KNOWN) == "cleaning_robot"
    assert infer_solution_type((None, None, "bas"), KNOWN) == "uav"


def test_ambiguous_or_unseen_classification_is_left_to_the_admin() -> None:
    assert infer_solution_type(("Мобильные роботы", "AMR", "brs"), KNOWN) is None
    assert infer_solution_type(("Подводные роботы", "ТНПА", "marine"), KNOWN) is None


def test_field_changes_in_card_order_without_echoing_text() -> None:
    current = {"name": "AMR", "price_from_rub": 2_700_000.0, "description": "old", "offers": frozenset({1})}
    planned = {
        "name": "AMR",
        "price_from_rub": 2_900_000.0,
        "description": "new",
        "offers": frozenset({1, 2}),
    }
    changes = field_changes(current, planned)
    assert [c.field for c in changes] == ["price_from_rub", "offers", "description"]
    assert (changes[0].before, changes[0].after) == (2_700_000.0, 2_900_000.0)
    assert (changes[1].before, changes[1].after) == (1.0, 2.0)
    assert (changes[2].before, changes[2].after) == (None, None)
    assert field_changes(current, dict(current)) == []
    repriced = field_changes(current, {**current, "offers": frozenset({3})})
    assert [(c.field, c.before, c.after) for c in repriced] == [("offers", None, None)]
