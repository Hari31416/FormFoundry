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


def test_nested_objects_coercion_and_validation() -> None:
    # 1. Coercion of nested object
    nested_fields = [
        TemplateField(
            path="street",
            label="Street Address",
            type="string",
            required=True,
            default_question="",
            clarification_question="",
        ),
        TemplateField(
            path="zip",
            label="Zip Code",
            type="integer",
            required=True,
            default_question="",
            clarification_question="",
        ),
        TemplateField(
            path="is_primary",
            label="Is Primary",
            type="boolean",
            required=False,
            default_question="",
            clarification_question="",
        ),
    ]

    object_field = TemplateField(
        path="address",
        label="Address",
        type="object",
        schema=nested_fields,
        default_question="What is the address?",
        clarification_question="What is the address?",
    )

    # Test coercion with dict
    input_dict = {"street": "123 Main St", "zip": "10001", "is_primary": "yes"}
    expected_coerced = {"street": "123 Main St", "zip": 10001, "is_primary": True}
    assert coerce_candidate_value(object_field, input_dict) == expected_coerced

    # Test coercion with JSON string
    import json

    input_json = json.dumps(input_dict)
    assert coerce_candidate_value(object_field, input_json) == expected_coerced


def test_list_of_objects_coercion() -> None:
    # Coercion of list of objects
    nested_fields = [
        TemplateField(
            path="item_name",
            label="Item Name",
            type="string",
            required=True,
            default_question="",
            clarification_question="",
        ),
        TemplateField(
            path="quantity",
            label="Quantity",
            type="integer",
            required=True,
            default_question="",
            clarification_question="",
        ),
    ]

    list_field = TemplateField(
        path="line_items",
        label="Line Items",
        type="list_of_objects",
        schema=nested_fields,
        default_question="What are the items?",
        clarification_question="What are the items?",
    )

    input_list = [
        {"item_name": "Widget A", "quantity": "10"},
        {"item_name": "Widget B", "quantity": 5},
    ]
    expected_coerced = [
        {"item_name": "Widget A", "quantity": 10},
        {"item_name": "Widget B", "quantity": 5},
    ]
    assert coerce_candidate_value(list_field, input_list) == expected_coerced


def test_integration_nested_fields_api(client: TestClient) -> None:
    import uuid

    t_id = f"test-nested-{uuid.uuid4().hex[:8]}"

    template_payload = {
        "template_id": t_id,
        "template_version": 1,
        "name": "Nested Test Template",
        "domain": "testing",
        "description": "Integration testing template for nested fields.",
        "schema": [
            {
                "path": "billing_address",
                "label": "Billing Address",
                "type": "object",
                "required": True,
                "default_question": "Enter billing address",
                "clarification_question": "Clarify billing address",
                "schema": [
                    {
                        "path": "street",
                        "label": "Street",
                        "type": "string",
                        "required": True,
                        "default_question": "",
                        "clarification_question": "",
                    },
                    {
                        "path": "zip",
                        "label": "Zip",
                        "type": "integer",
                        "required": True,
                        "default_question": "",
                        "clarification_question": "",
                    },
                ],
            }
        ],
        "field_groups": [
            {
                "group_id": "main",
                "label": "Main",
                "field_paths": ["billing_address"],
            }
        ],
    }

    # Create custom template with nested fields
    create_resp = client.post("/api/v1/templates", json=template_payload)
    assert create_resp.status_code == 201

    # Create case
    create_case_resp = client.post(
        "/api/v1/cases",
        json={"template_id": t_id, "created_by": "test-runner"},
    )
    assert create_case_resp.status_code == 201
    case_id = create_case_resp.json()["case_id"]

    # initially missing
    case_detail_resp = client.get(f"/api/v1/cases/{case_id}")
    fields_map = {f["field_path"]: f for f in case_detail_resp.json()["field_states"]}
    assert fields_map["billing_address"]["status"] == "missing"

    # Edit with valid address
    valid_address = {"street": "456 Oak Rd", "zip": "90210"}
    edit_resp = client.post(
        f"/api/v1/cases/{case_id}/fields/billing_address/edit",
        json={"value": valid_address, "edited_by": "tester"},
    )
    assert edit_resp.status_code == 200

    # Verify coerced value inside case detail
    case_detail_resp2 = client.get(f"/api/v1/cases/{case_id}")
    fields_map2 = {f["field_path"]: f for f in case_detail_resp2.json()["field_states"]}
    assert fields_map2["billing_address"]["resolved_value"] == {
        "street": "456 Oak Rd",
        "zip": 90210,
    }

    # Check validation - should be valid
    val_resp = client.get(f"/api/v1/cases/{case_id}/validation")
    assert val_resp.status_code == 200
    assert len(val_resp.json()) == 0


def test_nested_candidates_extraction_and_grouping(monkeypatch) -> None:
    import asyncio
    from datetime import UTC, datetime

    import app.extraction.service as extraction_service
    from app.extraction.service import extract_candidates_with_llm
    from app.templates.models import TemplateDefinition, TemplateField

    # Create dummy template with a nested object and list of objects
    template = TemplateDefinition(
        template_id="test-nested-extraction",
        template_version=1,
        name="Nested Test Template",
        domain="test",
        description="",
        field_groups=[],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        template_schema=[
            TemplateField(
                path="complainant.address",
                label="Complainant Address",
                type="object",
                required=True,
                default_question="",
                clarification_question="",
                nested_schema=[
                    TemplateField(
                        path="street",
                        label="Street",
                        type="string",
                        required=True,
                        default_question="",
                        clarification_question="",
                    ),
                    TemplateField(
                        path="city",
                        label="City",
                        type="string",
                        required=True,
                        default_question="",
                        clarification_question="",
                    ),
                ],
            ),
            TemplateField(
                path="witnesses.witness_list",
                label="Witness List",
                type="list_of_objects",
                required=False,
                default_question="",
                clarification_question="",
                nested_schema=[
                    TemplateField(
                        path="full_name",
                        label="Full Name",
                        type="string",
                        required=True,
                        default_question="",
                        clarification_question="",
                    ),
                    TemplateField(
                        path="statement",
                        label="Statement",
                        type="string",
                        required=True,
                        default_question="",
                        clarification_question="",
                    ),
                ],
            ),
        ],
    )

    # 1. Test case where LLM returns dotted nested candidate paths (the bug scenario)
    fake_llm_response_dotted = {
        "candidates": [
            {
                "field_path": "complainant.address.street",
                "candidate_value": "8 Lakeview Colony",
                "confidence": 0.99,
                "rationale": "Explicitly stated street.",
                "source_quote": "street is 8 Lakeview Colony",
            },
            {
                "field_path": "complainant.address.city",
                "candidate_value": "Hyderabad",
                "confidence": 0.95,
                "rationale": "Explicitly stated city.",
                "source_quote": "city is Hyderabad",
            },
            {
                "field_path": "witnesses.witness_list.0.full_name",
                "candidate_value": "John Doe",
                "confidence": 0.90,
                "rationale": "First witness name.",
                "source_quote": "witness John Doe",
            },
            {
                "field_path": "witnesses.witness_list[0].statement",
                "candidate_value": "Saw the incident.",
                "confidence": 0.88,
                "rationale": "First witness statement.",
                "source_quote": "saw the incident",
            },
        ]
    }

    async def mock_generate_json_dotted(*args, **kwargs):
        return fake_llm_response_dotted

    monkeypatch.setattr(extraction_service, "generate_json", mock_generate_json_dotted)

    proposals = asyncio.run(extract_candidates_with_llm(template, "dummy text"))
    proposals_map = {p.field_path: p for p in proposals}

    # Verify complainant.address was successfully merged and coerced
    assert "complainant.address" in proposals_map
    addr_val = proposals_map["complainant.address"].candidate_value
    assert addr_val == {"street": "8 Lakeview Colony", "city": "Hyderabad"}
    assert (
        proposals_map["complainant.address"].confidence == 0.97
    )  # Average of 0.99 and 0.95

    # Verify witnesses.witness_list was successfully merged and coerced
    assert "witnesses.witness_list" in proposals_map
    witness_val = proposals_map["witnesses.witness_list"].candidate_value
    assert witness_val == [{"full_name": "John Doe", "statement": "Saw the incident."}]

    # 2. Test case where LLM returns fully formed objects (direct match scenario)
    fake_llm_response_direct = {
        "candidates": [
            {
                "field_path": "complainant.address",
                "candidate_value": {"street": "123 Main St", "city": "Bengaluru"},
                "confidence": 0.98,
                "rationale": "Entire address details.",
                "source_quote": "123 Main St, Bengaluru",
            }
        ]
    }

    async def mock_generate_json_direct(*args, **kwargs):
        return fake_llm_response_direct

    monkeypatch.setattr(extraction_service, "generate_json", mock_generate_json_direct)

    proposals = asyncio.run(extract_candidates_with_llm(template, "dummy text"))
    proposals_map = {p.field_path: p for p in proposals}

    assert "complainant.address" in proposals_map
    assert proposals_map["complainant.address"].candidate_value == {
        "street": "123 Main St",
        "city": "Bengaluru",
    }
    assert proposals_map["complainant.address"].confidence == 0.98
