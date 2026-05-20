# Roadmap: Robust Template Model & Engine Improvements

This roadmap outlines how to address the limitations identified in the current [TemplateDefinition](../backend/app/templates/models.py#L38) model and form filling engine. The proposed improvements are sorted by a cost-benefit ratio (a combination of **Usefulness** and **Work Required**) to help pick them one-by-one or in groups.

---

## Summary of Proposals (Sorted by Usefulness vs. Effort)

| Rank | Feature | Usefulness | Effort | Description |
| :--- | :--- | :--- | :--- | :--- |
| **1** | [Dynamic Validation & Custom Regex Support](#1-dynamic-validation--custom-regex-support) | High | Easy | Implement custom regex pattern checks and dynamic validation rules directly from template configs. |
| **2** | [Activating and Handling `repeated: bool` for Primitives](#2-activating-and-handling-repeated-bool-for-primitives) | High | Easy | Fully implement lists of basic types (e.g. list of tags/emails) across LLM extraction, resolution, and validation. |
| **3** | [Multi-Select Enums](#3-multi-select-enums) | High | Medium | Add support for choosing multiple options from an enum set (e.g. multi-select checkboxes). |
| **4** | [Rich Conditional logic (`conditions`)](#4-rich-conditional-logic-conditions) | Medium | Easy | Expand field conditions to support multiple dependencies, range checks, and multi-value checks. |
| **5** | [Calculated / Computed Fields](#5-calculated--computed-fields) | Medium | Medium | Introduce fields that evaluate mathematical or string concatenation expressions using other resolved fields. |
| **6** | [Binary / Signature / Attachment Fields](#6-binary--signature--attachment-fields) | High | Hard | Connect template fields directly to evidence storage URIs, supporting photo uploads and hand-drawn signature coordinates. |
| **7** | [Nested Objects & Dynamic Lists of Objects](#7-nested-objects--dynamic-lists-of-objects) | High | Hard | Enable complex data models (e.g. lists of witnesses, each with a name, role, and phone) in templates. |
| **8** | [Cross-Field & Template-Level Validation Rules](#8-cross-field--template-level-validation-rules) | Medium | Medium | Enforce validation constraints that span multiple fields (e.g. `start_date < end_date`) using the template's `validation_rules` block. |

---

## 1. Dynamic Validation & Custom Regex Support

### Impact & Justification

Currently, only hardcoded validation references like `email` or `phone` are supported. We cannot enforce format checks for identifiers like SSN, Aadhaar number, postal codes, or vehicle registrations without writing custom Python code.

### Proposed Changes

1. **Backend Schema Update**: Keep [TemplateField.validation_refs](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/templates/models.py#L26) but add support for parameterized validation rules (e.g. `regex:^[A-Z]{5}[0-9]{4}[A-Z]$` or `custom_error:Custom Message`).
2. **Validation Service**: Update [refresh_validation_issues](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/validation/service.py#L50) to dynamically parse these expressions:

   ```python
   for rule_ref in template_field.validation_refs:
       if rule_ref.startswith("regex:"):
           pattern = rule_ref.split(":", maxsplit=1)[1]
           if value and not re.match(pattern, str(value)):
               add_issue(
                   field_path=field_path,
                   rule_id="regex",
                   message=f"Field format is invalid.",
               )
   ```

3. **Frontend UI**: Dynamically display format warnings based on these regex requirements.

---

## 2. Activating and Handling `repeated: bool` for Primitives

### Impact & Justification

The template schema contains a `repeated` boolean flag, but the backend doesn't support lists in any of the services. This makes it impossible to collect multiple values of the same primitive type (e.g., list of phone numbers, emails, or tags).

### Proposed Changes

1. **Extraction Service**: Modify [coerce_candidate_value](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/extraction/service.py#L131) and the LLM instruction prompts. If `field.repeated` is True:
   * Tell the LLM to return an array of values instead of a single scalar.
   * Parse the candidate value as a list and coerce each element individually.
2. **Resolution Service**: Update [resolve_case_fields](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/resolution/service.py#L37). When resolving a repeated field, merge high-confidence list items or prompt conflicts only if lists differ significantly in content.
3. **Validation Service**: Check that all items in the list conform to type and pattern constraints.

---

## 3. Multi-Select Enums

### Impact & Justification

intake forms frequently require checking multiple options from a static list (e.g. *"Select all symptoms: Headache, Fever, Vomiting"*).

### Proposed Changes

1. **Define a New Type or Modifier**: Define a new type `"multi_enum"` or combine `type: "enum"` with `repeated: true`.
2. **Extraction Coercion**:

   ```python
   if field.type == "enum" and field.repeated:
       return [normalize_enum_value(item, field.enum_options) for item in value if normalize_enum_value(item, field.enum_options)]
   ```

3. **Frontend Component**: Upgrade the workspace form field to render a multi-select check-list or select-multiple dropdown rather than a single-choice radio/select group.

---

## 4. Rich Conditional Logic (`conditions`)

### Impact & Justification

Dynamic forms require fields to appear or disappear based on multiple conditions (e.g. visible if `role == 'admin' AND age > 21`). The current model only checks simple equality for one dependency.

### Proposed Changes

1. **Update Schema Model**: Extend `conditions` to support complex operators (`and`, `or`, `not`, `>`, `<`, `in`):

   ```json
   "conditions": {
     "operator": "and",
     "rules": [
       { "depends_on": "patient.age", "operator": "gte", "value": 18 },
       { "depends_on": "patient.status", "operator": "in", "value": ["active", "pending"] }
     ]
   }
   ```

2. **Runtime Evaluation**: Update [is_field_active](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/templates/runtime.py#L18) to evaluate these boolean operators and comparison queries recursively.

---

## 5. Calculated / Computed Fields

### Impact & Justification

Reduces arithmetic or concatenation errors by allowing the backend/frontend to calculate dependent fields automatically instead of relying on the LLM or manual user typing.

### Proposed Changes

1. **Update Schema Model**: Add an optional `calculation` key to `TemplateField`:

   ```json
   {
     "path": "invoice.total",
     "type": "number",
     "calculation": "{invoice.subtotal} * (1 + {invoice.tax_rate})"
   }
   ```

2. **Resolution Pipeline**: After resolving fields in `resolve_case_fields`, evaluate calculations. Replace placeholders (e.g. `{invoice.subtotal}`) with resolved values. Safe arithmetic evaluations can be run via Python's AST parser or a safe expression parser library.
3. **Mark as Read-Only**: Lock computed fields in the UI detail pane so the user knows they are automated.

---

## 6. Binary / Signature / Attachment Fields

### Impact & Justification

Allows forms to collect files directly in the schema (e.g., photo of an ID, signature block) and map them to downstream output PDF locations.

### Proposed Changes

1. **Add Types**: Introduce `"file"` and `"signature"` field types to `FieldType`.
2. **Storage Binding**:
   * For `"file"`: The value is a Minio/S3 storage URI string. The frontend renders a file-upload component.
   * For `"signature"`: The value stores vector coordinate points or base64 image data of a hand-drawn signature.
3. **PDF Rendering Integration**: Update [generate_pdf_artifact](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/artifacts/service.py#L104) to support placing image blocks (extracted signatures or photos) onto specific coordinate bounds on the PDF canvas.

---

## 7. Nested Objects & Dynamic Lists of Objects

### Impact & Justification

This is the most requested advanced feature for business/governmental forms (e.g. list of previous employers, family members, or asset lists).

### Proposed Changes

1. **Introduce Complex Field Types**: Add `"object"` and `"list_of_objects"` types to `FieldType`.
2. **Nested Schema Support**: Introduce a `nested_schema` or recursive structure in `TemplateField`:

   ```json
   {
     "path": "witnesses",
     "type": "list_of_objects",
     "schema": [
       { "path": "name", "type": "string", "required": true },
       { "path": "phone", "type": "string", "required": false }
     ]
   }
   ```

3. **Extraction & Parsing**: Upgrade `extract_candidates_with_llm` to extract lists of structured objects. Use recursive JSON models in Pydantic.
4. **Interactive Completion**: Update the chat completion orchestrator ([choose_next_question](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/conversation/service.py#L172)) to ask questions for missing fields inside nested objects dynamically (e.g. *"What is the name of witness #2?"*).
5. **PDF Template Builder**: Update [ensure_pdf_template](file:///Users/hari/Desktop/sandbox/generic-form-filler/backend/app/artifacts/service.py#L45) to draw tabular layouts or multi-row repeating fields dynamically instead of flat one-dimensional form inputs.

---

## 8. Cross-Field & Template-Level Validation Rules

### Impact & Justification

Often, validation rules depend on more than one field (e.g. *"If `accused.known_to_complainant` is true, then `accused.details` must not be empty"*). We need to leverage the template's `validation_rules` block.

### Proposed Changes

1. **Activate validation_rules**: Update `refresh_validation_issues` in `validation/service.py` to iterate through the template's `validation_rules` block.
2. **Define Rule Types**: Support rules like:
   * `"comparison"`: compare field A and field B (e.g. date comparison, numeric threshold).
   * `"conditional_required"`: field B is required only if field A matches a specific condition.
3. **Format Example**:

   ```json
   "validation_rules": [
     {
       "rule_id": "accused_details_required",
       "type": "conditional_required",
       "condition": { "field": "accused.known_to_complainant", "equals": true },
       "target_field": "accused.details",
       "message": "Please specify details for the accused since they are known to the complainant."
     }
   ]
   ```
