from fastapi.testclient import TestClient

from app.extraction.service import coerce_candidate_value
from app.resolution.service import evaluate_calculation, normalize_candidate_value
from app.templates.models import TemplateField
from app.templates.runtime import evaluate_condition


def test_repeated_primitive_coercion() -> None:
    # 1. Repeated string field
    field_str = TemplateField(
        path="tags",
        label="Tags",
        type="string",
        repeated=True,
        default_question="What tags?",
        clarification_question="Clarify tags?",
    )
    assert coerce_candidate_value(field_str, ["tag1", "tag2"]) == ["tag1", "tag2"]
    assert coerce_candidate_value(field_str, '["foo", "bar"]') == ["foo", "bar"]
    assert coerce_candidate_value(field_str, "hello, world") == ["hello", "world"]
    assert coerce_candidate_value(field_str, None) is None
    assert coerce_candidate_value(field_str, "") is None

    # 2. Repeated integer field
    field_int = TemplateField(
        path="scores",
        label="Scores",
        type="integer",
        repeated=True,
        default_question="What scores?",
        clarification_question="Clarify scores?",
    )
    assert coerce_candidate_value(field_int, [1, 2, "3"]) == [1, 2, 3]
    assert coerce_candidate_value(field_int, "10, 20, 30") == [10, 20, 30]

    # 3. Repeated enum field (Multi-Select Enums)
    field_enum = TemplateField(
        path="roles",
        label="Roles",
        type="enum",
        repeated=True,
        enum_options=["Admin", "Editor", "Viewer"],
        default_question="Select roles?",
        clarification_question="Clarify roles?",
    )
    assert coerce_candidate_value(field_enum, ["Admin", "viewer"]) == [
        "Admin",
        "Viewer",
    ]
    assert coerce_candidate_value(field_enum, "editor, Admin") == ["Editor", "Admin"]


def test_normalize_candidate_value_repeated() -> None:
    assert normalize_candidate_value("apple") == "apple"
    assert normalize_candidate_value(["apple", "banana"]) == '["apple", "banana"]'
    # Ensure sorting handles list values normalization consistently
    assert normalize_candidate_value(["banana", "apple"]) == '["apple", "banana"]'


def test_evaluate_calculation() -> None:
    schema = {
        "invoice": {
            "subtotal": 100.0,
            "tax_rate": 0.05,
            "discount": 10,
        },
        "first_name": "John",
        "last_name": "Doe",
    }

    # 1. Math calculation
    expr1 = "{invoice.subtotal} * (1 + {invoice.tax_rate}) - {invoice.discount}"
    assert evaluate_calculation(expr1, schema) == 95.0

    # 2. String concatenation calculation
    expr2 = "{first_name} + ' ' + {last_name}"
    assert evaluate_calculation(expr2, schema) == "John Doe"

    # 3. Missing variable gracefully returns None
    expr_missing = "{invoice.subtotal} * {invoice.nonexistent}"
    assert evaluate_calculation(expr_missing, schema) is None


def test_evaluate_condition_rich() -> None:
    schema = {
        "user": {
            "age": 25,
            "role": "editor",
            "active": True,
        }
    }

    # 1. Comparisons (gte, lt, in)
    assert (
        evaluate_condition({"depends_on": "user.age", "op": "gte", "value": 18}, schema)
        is True
    )
    assert (
        evaluate_condition({"depends_on": "user.age", "op": "lt", "value": 18}, schema)
        is False
    )
    assert (
        evaluate_condition(
            {"depends_on": "user.role", "op": "in", "value": ["admin", "editor"]},
            schema,
        )
        is True
    )

    # 2. Logical 'and'
    cond_and = {
        "operator": "and",
        "rules": [
            {"depends_on": "user.age", "op": "gte", "value": 18},
            {"depends_on": "user.role", "op": "equals", "value": "editor"},
        ],
    }
    assert evaluate_condition(cond_and, schema) is True

    # 3. Logical 'or'
    cond_or = {
        "operator": "or",
        "rules": [
            {"depends_on": "user.role", "op": "equals", "value": "admin"},
            {"depends_on": "user.active", "op": "equals", "value": True},
        ],
    }
    assert evaluate_condition(cond_or, schema) is True

    # 4. Logical 'not'
    cond_not = {
        "operator": "not",
        "rules": [{"depends_on": "user.role", "op": "equals", "value": "admin"}],
    }
    assert evaluate_condition(cond_not, schema) is True


def test_integration_features_via_api(client: TestClient) -> None:
    import uuid

    t_id = f"test-robust-{uuid.uuid4().hex[:8]}"

    # 1. Create a custom template with calculations, repeated lists, rich conditions, and regex
    template_payload = {
        "template_id": t_id,
        "template_version": 1,
        "name": "Robust Test Template",
        "domain": "testing",
        "description": "Integration testing template for ranks 1-5.",
        "schema": [
            {
                "path": "qty",
                "label": "Quantity",
                "type": "integer",
                "required": True,
                "default_question": "What is the quantity?",
                "clarification_question": "Could you clarify the quantity?",
            },
            {
                "path": "price",
                "label": "Price",
                "type": "number",
                "required": True,
                "default_question": "What is the price?",
                "clarification_question": "Could you clarify the price?",
            },
            {
                "path": "total",
                "label": "Total Cost",
                "type": "number",
                "required": True,
                "default_question": "",
                "clarification_question": "",
                "calculation": "{qty} * {price}",
            },
            {
                "path": "sku",
                "label": "SKU Code",
                "type": "string",
                "required": True,
                "default_question": "What is the SKU?",
                "clarification_question": "Clarify SKU?",
                "validation_refs": ["regex:^[A-Z]{3}-\\d{3}$"],
            },
            {
                "path": "special_notes",
                "label": "Special Notes",
                "type": "string",
                "required": False,
                "default_question": "Any special notes?",
                "clarification_question": "Clarify special notes?",
                "conditions": {
                    "depends_on": "total",
                    "op": "gt",
                    "value": 100.0,
                },
            },
            {
                "path": "tags",
                "label": "Item Tags",
                "type": "string",
                "repeated": True,
                "required": False,
                "default_question": "Enter tags",
                "clarification_question": "Clarify tags",
                "validation_refs": ["min_length:3"],
            },
        ],
        "field_groups": [
            {
                "group_id": "main",
                "label": "Main",
                "field_paths": [
                    "qty",
                    "price",
                    "total",
                    "sku",
                    "special_notes",
                    "tags",
                ],
            }
        ],
    }

    # Post template creation
    create_template_resp = client.post("/api/v1/templates", json=template_payload)
    assert create_template_resp.status_code == 201

    # 2. Create case using this template
    create_case_resp = client.post(
        "/api/v1/cases",
        json={"template_id": t_id, "created_by": "test-runner"},
    )
    assert create_case_resp.status_code == 201
    case_id = create_case_resp.json()["case_id"]

    # 3. Initially, total is calculated as None because dependency fields are missing
    case_detail_resp = client.get(f"/api/v1/cases/{case_id}")
    assert case_detail_resp.status_code == 200
    fields_map = {f["field_path"]: f for f in case_detail_resp.json()["field_states"]}
    assert fields_map["total"]["resolved_value"] is None
    assert fields_map["total"]["status"] == "missing"

    # special_notes should not be active since condition depends on total > 100 (and total is None)
    assert fields_map["special_notes"]["status"] == "missing"

    # 4. Fill values for qty, price, sku, and tags
    # SKU has regex rule: ^[A-Z]{3}-\d{3}$
    # Fill qty = 10, price = 15.0, sku = "ABC-123", tags = ["foo", "bar"]
    edit_qty = client.post(
        f"/api/v1/cases/{case_id}/fields/qty/edit",
        json={"value": 10, "edited_by": "tester"},
    )
    edit_price = client.post(
        f"/api/v1/cases/{case_id}/fields/price/edit",
        json={"value": 15.0, "edited_by": "tester"},
    )
    edit_sku = client.post(
        f"/api/v1/cases/{case_id}/fields/sku/edit",
        json={"value": "ABC-123", "edited_by": "tester"},
    )
    edit_tags = client.post(
        f"/api/v1/cases/{case_id}/fields/tags/edit",
        json={"value": ["foo", "bar"], "edited_by": "tester"},
    )

    assert edit_qty.status_code == 200
    assert edit_price.status_code == 200
    assert edit_sku.status_code == 200
    assert edit_tags.status_code == 200

    # 5. Check validation and calculation resolution
    # total should be qty(10) * price(15) = 150.0
    case_detail_resp2 = client.get(f"/api/v1/cases/{case_id}")
    fields_map2 = {f["field_path"]: f for f in case_detail_resp2.json()["field_states"]}
    assert fields_map2["total"]["resolved_value"] == 150.0
    assert (
        fields_map2["total"]["status"] == "proposed"
    )  # calculated fields status proposed/confirmed

    # Since total is 150.0 (> 100), special_notes is now active
    # Let's verify special_notes is active in validation
    # (it is required=False, so no issue, but active)
    # Let's check validation issues
    val_resp = client.get(f"/api/v1/cases/{case_id}/validation")
    assert val_resp.status_code == 200
    issues = val_resp.json()
    # Confirm sku with "ABC-123" is valid (no issue)
    assert not any(issue["field_path"] == "sku" for issue in issues)

    # 6. Test invalid regex SKU and invalid tag min_length
    edit_sku_bad = client.post(
        f"/api/v1/cases/{case_id}/fields/sku/edit",
        json={"value": "ABC-12", "edited_by": "tester"},
    )
    edit_tags_bad = client.post(
        f"/api/v1/cases/{case_id}/fields/tags/edit",
        json={"value": ["hi", "correct"], "edited_by": "tester"},
    )
    assert edit_sku_bad.status_code == 200
    assert edit_tags_bad.status_code == 200

    val_resp2 = client.get(f"/api/v1/cases/{case_id}/validation")
    issues2 = val_resp2.json()
    issues2_map = {issue["field_path"]: issue for issue in issues2}

    # "ABC-12" violates regex ^[A-Z]{3}-\d{3}$
    assert "sku" in issues2_map
    assert issues2_map["sku"]["rule_id"] == "regex"

    # "hi" in repeated tags is shorter than min_length=3
    assert "tags" in issues2_map
    assert issues2_map["tags"]["rule_id"] == "min_length"
