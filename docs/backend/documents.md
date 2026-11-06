# Document upload and basic checks

The document pipeline supports Indian Aadhaar, PAN, and driving licences. It assumes
uploads are genuine and checks the declared type, extracts visible information, and
checks basic field formats. It does not verify issuer records, signatures, tampering,
identity ownership, or liveness.

## Upload and results

The existing `POST /api/v1/cases/{case_id}/evidence/upload` endpoint accepts multipart:

| Field              | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `file`             | Image or PDF, required                                                                              |
| `document_type`    | Optional `aadhaar`, `pan`, or `driving_licence`. Omit for automatic detection and generic evidence. |
| `document_country` | Defaults to `IN`. Only India is supported initially.                                                |

The declared type is stored in evidence metadata, separately from classification.
The classifier receives OCR text and the document catalog, without the filename,
user declaration, or conversation history. Unknown country/type declarations return
422 before storage. Oversized uploads return 413 and empty/unsupported files return
400. Existing PDF readability and page-count limits apply.

`GET /api/v1/documents/types` returns supported country/type pairs, definition
versions, type indicators, allowed fields, and required fields. Both workspace views
load this catalog for the upload selector.

Upload responses and `GET /api/v1/cases/{case_id}/evidence` expose a typed
`document_analysis` property. The latest result is also available at
`GET /api/v1/cases/{case_id}/evidence/{evidence_id}/document-analysis`. This returns
null for unprocessed evidence, and 404 when the evidence is outside the given case.
All routes require authentication; case routes enforce case ownership and schema access.

Results are versioned and contain an analysis ID, timestamp, declared/detected kinds,
classification confidence, grounded type quote, extracted fields with their OCR
quotes and confidence, checks, and individual stage outcomes. Provider observations
are validated and discarded after grounding; unsupported fields and fabricated
quotes do not become extracted information.

| Status         | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `matched`      | Detected type matches the declaration and basic checks passed           |
| `detected`     | Supported type detected without a declaration and basic checks passed   |
| `mismatch`     | Supported detected type differs from the declaration                    |
| `needs_review` | Unknown type, weak evidence, missing/uncertain fields, or format issues |
| `error`        | An analysis stage failed, timed out, or exceeded an input limit         |

Check outcomes are `pass`, `fail`, `inconclusive`, `skipped`, or `error`, with a
machine-readable code, scope, and optional field name. Authenticity is explicitly
skipped and `authenticity_checked` is false. A type match does not establish authenticity.

Aadhaar accepts masked numbers without attempting to reconstruct them. No checksum
or authenticity check is performed. PAN has a basic number-format check. Driving
licence numbers outside the common state/RTO/year/serial format are inconclusive
because older state formats vary. Dates are checked for calendar validity when
numeric; other printed date formats need review. Missing optional back-side fields
are not invented or required.

Declared uploads populate case candidates only when the analysis is `matched`.
Other declared outcomes remain visible for review. Generic uploads retain the existing
form extraction path, even when they are not recognized as identity documents.
Schemas can bind a top-level scalar field to a document field using `document_source`.
For matched/detected uploads, those fields map directly from grounded document analysis,
with evidence ID, analysis ID, and source quote preserved. The free-form upload extractor
cannot populate bound paths, even when it suggests them. Generic unbound fields and
explicit typed answers to field questions continue through the existing extractor and review flow.

Processing runs inside the existing extraction job. With `AUTO_RUN_JOBS=false`, the
upload is queued; the existing case extraction endpoint can process it. Re-extraction
replaces the latest document analysis. There is no new background worker or document
history table. The result is persisted under `EvidenceRecord.parsed_payload`, so this
change needs no database migration. OCR failures persist an error analysis and fail
the extraction job; classification failures produce an error result without discarding
the uploaded evidence.

## Extending document processing

`app/documents/models.py` defines the API contracts. `registry.py` defines document
fields and type indicators independently of form templates. Adding a country or type
starts with a registry definition; add its format rules and frontend translations as
needed. Future non-Indian automatic classification also requires widening the current
Indian-document classifier prompt and upload-country policy.

`DocumentStage` in `pipeline.py` defines the async adapter protocol:

```python
class LayoutStage:
    name = "layout"
    version = "1"

    async def analyze(self, context, previous):
        pages = await context.pages()
        # Run a detector on the rendered pages, off the event loop.
        # Return StageResult with typed checks and normalized page regions.
```

Register stages in `get_document_stages()` in dependency order. Each stage receives
prior results plus a shared `DocumentContext` containing OCR text, the declaration,
and lazy, cached access to original file bytes and page images. A YOLO adapter can
consume `original()` or `pages()` without pretending to be an OCR provider. Model
weights and runtime dependencies are not part of this initial implementation.

The first successful observation-producing stage supplies classification and field
extraction. The current summarizer grounds those observations in OCR text. Later
layout/CV stages can add checks and page regions without changing upload/result
contracts. A future extractor that produces fields solely from images will need an
explicit visual-grounding policy in the summarizer. External verifiers can also
implement stages; enabling authenticity or holder verification requires updating the
explicit assurance contract and UI, rather than treating a type match as verification.

Stages have unique names and versions. Each stage has a timeout and sanitized errors;
a failed stage does not prevent later adapters from inspecting its outcome. Any stage
error keeps the overall result in `error`. Check failures or uncertainty require review.
Stage code must offload blocking CV inference; the async timeout cannot forcibly stop
native inference already executing in a worker thread.

## Configuration

| Variable                         | Default    | Meaning                                        |
| -------------------------------- | ---------- | ---------------------------------------------- |
| `UPLOAD_MAX_BYTES`               | `20971520` | Maximum bytes read/accepted per upload, 20 MiB |
| `DOCUMENT_STAGE_TIMEOUT_SECONDS` | `60`       | Timeout per document adapter                   |
| `DOCUMENT_TEXT_MAX_CHARS`        | `60000`    | Maximum OCR text sent to document analysis     |
| `PDF_OCR_MAX_PAGES`              | `10`       | Existing PDF page limit                        |

The first adapter uses the existing text LLM configuration after vision OCR. This adds
one structured classification/extraction call per readable upload within the text limit.
Tests mock OCR and model calls and require no external document service.

## Indian document intake example

`indian-document-intake`, version 1, collects Aadhaar and PAN details and optionally
includes a driving licence. It is seeded from
`backend/app/templates/configs/indian-document-intake_v1.json` at backend startup.
Restart the backend to load newly added seed files. Administrators see the schema;
other users need an access grant through the existing schema access controls.

Aadhaar and PAN are required sections. The driving-licence fields become active when
`applicant.include_driving_licence` is true. Each document has its own name and birth
fields so one document cannot overwrite another's printed details. Differences between
names across documents remain visible for human review; this schema does not implement
automatic cross-document identity matching. A full Aadhaar birth date is optional, so a
year-only Aadhaar does not cause the system to invent a month/day.

A field binding uses the catalog's country, type, and field identifier:

```json
{
  "path": "pan.document_number",
  "document_source": {
    "country": "IN",
    "document_type": "pan",
    "field": "document_number"
  }
}
```

Bindings are validated against the document registry. They support top-level scalar
fields, including repeated scalars, and cannot be combined with calculated values.
The JSON schema editor preserves these bindings. The visual editor preserves existing
bindings; adding/editing a binding itself currently uses the JSON editor.

Generate synthetic ReportLab fixtures from the repository root:

```bash
backend/.venv/bin/python backend/scripts/generate_identity_samples.py
```

The default output is `output/pdf/indian-documents/`. It contains a two-page Aadhaar,
one-page PAN, two-page driving licence, expected fields, test instructions, and a ZIP
bundle. All pages visibly say SAMPLE / NOT VALID. No real identity, official seal,
signature, or QR code is used. An optional `--output-dir` changes the destination.

Start a case with this schema, select the appropriate upload type, and upload each PDF
separately. Answer Yes to include a driving licence, or No to exercise its inactive path.
Compare extracted values with `expected-fields.json` before confirming them. For a type
mismatch, upload the PAN sample while declaring Aadhaar; expect `mismatch` and no mapped
fields. Aadhaar intentionally shows only `1994`; its full date must remain empty even
after PAN and DL provide `12/07/1994`. PDF and JSON exports summarize reviewed case fields;
they do not certify document authenticity.

## Upload questions and field questions

Conversation questions have two kinds: `document_upload` and `field`. Upload questions
include a `documents` array of country/type pairs. Field questions have an empty array.
Existing field-question clients can use the default `field` kind when no kind is supplied.

Before asking for individual fields, the scheduler requests the documents bound to
active required fields. Each requested type has an inline image/PDF uploader in the
question itself, in both chat and detailed views. Only the current question has active
upload controls. There is no text reply input or send action for an upload question.
The conversation and text-evidence endpoints return 409 for text while that question
is active, without recording a user reply or evidence. Required uploads also block
case approval.

Uploading one recognized document removes its type from the pending question. A type
mismatch, unrecognized document, or processing error does not fulfill the request.
A recognized document with incomplete extracted fields fulfills the upload step so
the assistant can ask field questions about missing details after other uploads arrive.
Those incomplete/uncertain fields still need review. Retries use the same inline uploader.
Conditional document requests appear only when their fields become active, so opting
out of the driving-licence section does not request a driving licence.

Question caching includes document analysis results, so processing an existing upload
can advance the question even if no case field value changes. Ordinary field questions
retain the text composer and existing attachments. Upload prompts use the existing
outgoing translation path; inline labels and status text use frontend i18n.

## User choices and upload progress

Set `allow_document_extraction` to false for fields that must come from the user's
answers, rather than an uploaded document. The Indian document schema uses this for
`applicant.include_driving_licence`. An ID cannot express that choice. Upload processing
skips these fields, so the standard identity upload has no unrelated free-form extraction
call after mapping its document fields. These fields remain available to text questions
and manual edits. A document binding cannot be combined with this setting.

The form extractor explicitly requests `{"candidates": []}` when nothing is supported.
A malformed extraction envelope receives one bounded retry with the contract restated;
a second malformed response still fails rather than masquerading as no extracted data.
Grounded candidates from successful stages are persisted and resolved even when a
later extraction stage fails. The job still reports failure for that stage.

Each inline document row retains the selected filename and shows its own state:
uploading with byte-transfer percentage when available, processing, processed, needs
review, or failed. Server processing is indeterminate; the UI does not invent an OCR
percentage. Completed rows remain visible while other requested documents are pending.
Errors stay beside the affected document and its retry input. Queued jobs show a waiting
state and update when their evidence analysis becomes available. Upload failure also
refreshes evidence and case data, since a stored file or valid mappings may already exist.

## A single document upload card

A document upload batch retains the original assistant turn and its full `documents`
list. `pending_documents` identifies the types still needed, and `question_turn_id`
identifies the persistent card. As files arrive, the server updates the same turn rather
than appending another upload prompt. Uploaded evidence stores `upload_question_turn_id`
and stays available through the evidence API without creating a separate user receipt.
When the batch is complete, its metadata becomes `completed`, its pending list is empty,
and the next field question gets a new turn.

The chat renders each document's progress and extracted information inside that original
card. Completed cards remain readable after subsequent questions and page refreshes.
The display also groups old upload receipt messages and repeated upload prompts from
existing cases, preserving their evidence associations without rewriting stored history.
Conditional document batches remain separate when activated by later field answers.
