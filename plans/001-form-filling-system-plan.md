# Form Filling System Plan

## Goal

Build a generalized system that can:

1. accept information from multiple input modes
2. normalize that information into a structured schema
3. use an LLM to identify missing or uncertain fields
4. ask the user follow-up questions in a conversational tone
5. validate the final data
6. generate artifacts such as filled forms, PDFs, or other export formats

This should work for more than one form type and more than one output artifact.

## Core Product Abstraction

The platform should be modeled around four core abstractions:

### 1. Template Definition

A machine-readable definition of the thing we want to produce.

It should include:

- `template_id`
- `template_version`
- `domain`
- `target_schema`
- `field metadata`
- `validation rules`
- `question prompts`
- `output renderer config`

This is the center of the system. Everything else should adapt to it.

### 2. Intake Sources

Ways the user provides information.

Examples:

- direct user entry
- conversational answers
- uploaded PDF or DOC files
- uploaded images
- pasted plain text
- imported structured JSON from another system

Every intake source should be transformed into a common intermediate representation instead of directly mutating the final schema.

### 3. Case File

A durable workspace object representing one user session or one filing job.

It should store:

- raw uploads
- extracted snippets
- normalized facts
- current schema state
- confidence scores
- unanswered questions
- validation issues
- generated artifacts
- audit trail of how fields were filled

### 4. Artifact Definition

The output the user wants.

Examples:

- filled PDF
- generated summary PDF
- JSON payload for backend submission
- DOCX export
- plain-language review sheet

The same completed case file should be able to drive more than one artifact.

## Recommended Pipeline

The system should be implemented as a staged pipeline with explicit transitions.

### Stage 1. Template Loading

Load the selected template definition and its target schema.

This stage answers:

- what fields exist
- which fields are required
- which validations apply
- which outputs are supported

### Stage 2. Multi-Modal Intake

Accept user input and uploaded files.

Each input should be converted into a standard `evidence` model such as:

- `source_type`
- `source_id`
- `raw_content`
- `parsed_content`
- `metadata`
- `page or region references`

### Stage 3. Extraction

Run extraction pipelines over evidence.

Sub-components:

- OCR for images and scanned PDFs
- document parsing for text PDFs and office docs
- chunking and classification
- entity and field candidate extraction
- source attribution per extracted value

Output should not be direct schema writes. It should be `field candidates`:

- `field_path`
- `candidate_value`
- `confidence`
- `source_refs`
- `rationale`

### Stage 4. Schema Resolution

Resolve candidates into a draft schema state.

Resolver responsibilities:

- merge duplicate evidence
- choose best candidate per field
- mark conflicts
- mark fields as missing, inferred, or confirmed
- preserve provenance

Each field should have a status such as:

- `missing`
- `proposed`
- `confirmed`
- `conflicted`
- `invalid`

### Stage 5. Conversational Completion

Use the LLM as an interviewer, not as the source of truth.

The LLM should:

- inspect unresolved fields
- ask the next best question
- explain why it is asking when useful
- confirm high-risk answers
- avoid re-asking answered questions

The conversation manager should work from template metadata rather than hardcoded flows.

### Stage 6. Validation

Run deterministic validation before artifact generation.

Validation should include:

- type checks
- required field checks
- cross-field consistency checks
- template-specific business rules
- user confirmation for sensitive fields

LLM reasoning can suggest issues, but deterministic validation should be the gate.

### Stage 7. Review and Approval

Show the completed draft to the user in a review UI.

The user should be able to:

- inspect filled values
- see missing values
- see conflicting values
- view source evidence
- edit incorrect values
- approve the final version

### Stage 8. Artifact Generation

Generate the requested output format from the approved schema state.

Artifact generation should be separate from extraction and conversation logic.

### Stage 9. Submission or Delivery

Optional final step:

- download artifact
- send to another backend
- archive case file
- create audit record

## Generalization Strategy

To keep this reusable across many forms, generalize at these layers:

### Generalize the Schema Layer

Represent every form as a structured target schema with:

- field paths
- field types
- requiredness
- enum options
- validation rules
- display labels
- question prompts

Avoid building each form as a separate custom workflow.

### Generalize the Evidence Layer

All source inputs should become evidence objects. This allows the same extraction and attribution logic to work across uploads, conversation, and pasted text.

### Generalize the Question Layer

Each field or field group should carry question metadata:

- default user-facing question
- clarification question
- help text
- sensitivity level
- answer format hints

This allows the conversation engine to be template-driven.

### Generalize the Renderer Layer

Renderers should consume approved schema data and a template-specific mapping.

Examples:

- PDF field mapper
- HTML to PDF summary generator
- JSON API payload mapper

This keeps artifact generation independent from intake logic.

## Component Breakdown

Recommended backend component split:

### 1. Template Registry

Owns template definitions, versions, and schema metadata.

### 2. Intake Service

Receives uploads, user inputs, and metadata. Stores raw assets.

### 3. Extraction Service

Runs OCR, parsing, chunking, and candidate extraction.

### 4. Resolution Engine

Builds draft schema state from extracted candidates and user answers.

### 5. Conversation Orchestrator

Determines what to ask next and updates the case file with responses.

### 6. Validation Engine

Runs deterministic checks and produces user-facing issues.

### 7. Artifact Service

Generates PDFs or other outputs from approved schema data.

### 8. Case Store

Persists case files, evidence, schema state, and audit history.

## Suggested Data Models

Minimum useful models:

- `TemplateDefinition`
- `TemplateField`
- `CaseFile`
- `Evidence`
- `FieldCandidate`
- `SchemaState`
- `FieldState`
- `ConversationTurn`
- `ValidationIssue`
- `Artifact`

## LLM Role Definition

The LLM should be constrained to these responsibilities:

- extract candidate values from unstructured inputs
- summarize evidence
- rank missing information by importance
- generate conversational follow-up questions
- explain uncertainty to the user

The LLM should not be the final authority for:

- requiredness
- validation pass or fail
- official persisted value selection without explicit resolver logic

## Trust and Safety Notes

Important safety principles:

- keep source attribution for every non-user-entered field
- separate proposed values from confirmed values
- require explicit confirmation for sensitive outputs
- log why a field value changed
- keep deterministic validation as the release gate

This matters especially when generated artifacts may be submitted externally.

## MVP Recommendation

Start with one narrow but end-to-end slice.

### MVP Scope

- one template type
- text PDF and image upload support
- conversational completion in chat UI
- deterministic validation
- one generated PDF output
- manual user review before export

### MVP Non-Goals

- no broad workflow builder yet
- no arbitrary dynamic form designer yet
- no many-template marketplace yet
- no autonomous submission to third parties yet

## Proposed Delivery Order

### Phase 1. Template and Case Model

Build the schema model, field metadata model, and case file model.

### Phase 2. Intake and Evidence Storage

Support uploads and text input. Persist evidence objects.

### Phase 3. Extraction and Candidate Generation

Build OCR and document parsing pipeline. Produce field candidates with provenance.

### Phase 4. Conversational Completion

Add next-question selection and chat-driven field completion.

### Phase 5. Validation and Review

Add deterministic validation rules and a user review surface.

### Phase 6. Artifact Generation

Generate the first PDF or export format from approved schema data.

## Open Decisions

Questions still to settle:

- how templates will be authored and versioned
- whether field validation rules are declarative only or allow code hooks
- which PDF strategy to use for artifact generation
- whether extraction runs synchronously or through jobs
- how much manual correction tooling the review UI should expose in MVP
- how we score and present confidence to the user

## Recommendation For The Next Planning Step

Before choosing infrastructure details, define the canonical `TemplateDefinition`, `FieldState`, and `Evidence` contracts. If those three contracts are clean, the rest of the system can be composed around them without rework.
