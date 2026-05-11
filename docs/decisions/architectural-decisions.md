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
