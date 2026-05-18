# Architectural Decision Records (ADRs)

This document tracks significant architectural decisions made during the development of FormFoundry.

## ADR 1: Feature-Based Module Structure

**Status**: Accepted
**Context**: Traditional layered architecture (controllers, services, repositories) can lead to tightly coupled and hard-to-navigate codebases as they scale.
**Decision**: Organize the backend and frontend by feature (e.g., `templates`, `cases`, `extraction`). Each module contains its own models, services, and routes.
**Consequences**: Better isolation, easier testing, and clearer ownership of functionality.

## ADR 2: Declarative JSON Templates

**Status**: Accepted
**Context**: We need to support diverse form types (FIR reports, insurance claims, medical records) without code changes for every new format.
**Decision**: Use a declarative JSON-based template registry. The system interprets these JSON files to generate database field states, UI forms, and extraction prompts.
**Consequences**: Rapid expansion to new domains, version control for templates, and a decoupled rendering engine.

## ADR 3: Provider-Agnostic AI Orchestration (LiteLLM)

**Status**: Accepted
**Context**: Relying on a single LLM provider (e.g., OpenAI) creates vendor lock-in and limits flexibility.
**Decision**: Use `litellm` as the unified interface for all LLM interactions.
**Consequences**: Switch between providers (OpenAI, Anthropic, Gemini, local models) with simple environment variable changes.

## ADR 4: Hybrid JSON/Relational Schema

**Status**: Accepted
**Context**: We need to store structured data for hundreds of different form types in a single database.
**Decision**: Use Postgres with traditional columns for fixed metadata (IDs, statuses, timestamps) and the `JSON` type for dynamic payloads (field states, template schemas).
**Consequences**: Excellent query performance on core metadata while maintaining high flexibility for template-specific data.

## ADR 5: Pluggable Multilingual & Speech Subsystem

**Status**: Accepted
**Context**: Reaching regional users (such as citizen intake in India) requires local language interfaces and speech accessibility. However, hardcoding external translation/speech APIs locks the platform into specific vendors and raises API costs.
**Decision**:

1. Build a decoupled multilingual subsystem with abstract base classes (`BaseTranslationProvider`, `BaseTTSProvider`, etc.) and a service registry orchestrator (`LanguageManager`).
2. Integrate high-performance, Redis-backed translation caching with SHA-256 collision-free hashing of source, target, and string contents.
3. Sync case metadata preferences so that backend-generated questions automatically translate and stream to match the active client locale.
   **Consequences**: Pluggability of localized systems (such as Bhashini or Google Cloud) with zero-key local fallbacks, significant reduction in translation API costs, and low latency for active conversation loops.

## ADR 6: Dual-Workspace UI Architecture

**Status**: Accepted
**Context**: Monolithic, multi-panel workspace pages lead to heavy initial page-load times, DOM bloat, and poor mobile accessibility. Different users require different intake interactions: end-citizens need guided, simple questionnaires, while backend agents require comprehensive side-by-side data auditing grids.
**Decision**: Split the primary case workspace component into two high-level modular sub-components:

1. **`DetailedWorkspaceView`**: A heavy, panel-based grid that splits screen real estate between raw files, field status resolution tables, and chats for auditors.
2. **`SimplifiedChatView`**: A lightweight, mobile-first guided interview workspace that embeds inline fields and strategists' reasoning directly into the chat flow for citizens.
   **Consequences**: Avoided initial load race conditions, maximized mobile accessibility, optimized frontend re-rendering performance, and provided a highly customized interface matching user roles.
