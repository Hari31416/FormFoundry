from __future__ import annotations

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.templates.models import (
    TemplateDefinition,
    TemplateDefinitionCreate,
    TemplateDefinitionRecord,
    TemplateField,
    TemplateFieldGroup,
)


def serialize_template(record: TemplateDefinitionRecord) -> TemplateDefinition:
    return TemplateDefinition(
        template_id=record.template_id,
        template_version=record.template_version,
        name=record.name,
        domain=record.domain,
        description=record.description,
        template_schema=[TemplateField.model_validate(item) for item in record.schema],
        field_groups=[
            TemplateFieldGroup.model_validate(item) for item in record.field_groups
        ],
        validation_rules=record.validation_rules,
        conversation_config=record.conversation_config,
        supported_artifacts=record.supported_artifacts,
        renderer_config=record.renderer_config,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


async def create_template(
    session: AsyncSession, payload: TemplateDefinitionCreate
) -> TemplateDefinition:
    record = TemplateDefinitionRecord(
        template_id=payload.template_id,
        template_version=payload.template_version,
        name=payload.name,
        domain=payload.domain,
        description=payload.description,
        schema=[field.model_dump(mode="json") for field in payload.template_schema],
        field_groups=[group.model_dump(mode="json") for group in payload.field_groups],
        validation_rules=payload.validation_rules,
        conversation_config=payload.conversation_config,
        supported_artifacts=payload.supported_artifacts,
        renderer_config=payload.renderer_config,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return serialize_template(record)


async def list_templates(session: AsyncSession) -> list[TemplateDefinition]:
    statement: Select[tuple[TemplateDefinitionRecord]] = select(
        TemplateDefinitionRecord
    ).order_by(
        TemplateDefinitionRecord.template_id,
        desc(TemplateDefinitionRecord.template_version),
    )
    records = (await session.execute(statement)).scalars().all()
    return [serialize_template(record) for record in records]


async def get_template(
    session: AsyncSession, template_id: str, template_version: int | None = None
) -> TemplateDefinitionRecord | None:
    statement = select(TemplateDefinitionRecord).where(
        TemplateDefinitionRecord.template_id == template_id
    )
    if template_version is not None:
        statement = statement.where(
            TemplateDefinitionRecord.template_version == template_version
        )
    else:
        statement = statement.order_by(
            desc(TemplateDefinitionRecord.template_version)
        ).limit(1)
    return (await session.execute(statement)).scalar_one_or_none()


async def get_template_definition(
    session: AsyncSession, template_id: str, template_version: int | None = None
) -> TemplateDefinition | None:
    record = await get_template(session, template_id, template_version)
    if record is None:
        return None
    return serialize_template(record)


def build_mvp_template() -> TemplateDefinitionCreate:
    return TemplateDefinitionCreate(
        template_id="household-assistance-intake",
        template_version=1,
        name="Household Assistance Intake Packet",
        domain="public-benefits",
        description=(
            "A declarative intake form that captures applicant identity, household composition, "
            "employment, and benefits request details before rendering a fillable PDF packet."
        ),
        schema=[
            TemplateField(
                path="applicant.full_name",
                label="Full legal name",
                type="string",
                required=True,
                default_question="What is the applicant's full legal name?",
                clarification_question="Please confirm the applicant's full legal name.",
                help_text="Use the name exactly as it appears on an official ID.",
                validation_refs=["required", "min_length:3"],
                render_targets=["applicant_full_name"],
            ),
            TemplateField(
                path="applicant.date_of_birth",
                label="Date of birth",
                type="date",
                required=True,
                default_question="What is the applicant's date of birth?",
                clarification_question=(
                    "Can you share the applicant's date of birth in YYYY-MM-DD format?"
                ),
                validation_refs=["required", "date"],
                render_targets=["applicant_dob"],
            ),
            TemplateField(
                path="applicant.phone",
                label="Phone number",
                type="string",
                required=True,
                default_question="What phone number should we use for the applicant?",
                clarification_question="Please confirm the best phone number for the applicant.",
                validation_refs=["required", "phone"],
                render_targets=["applicant_phone"],
            ),
            TemplateField(
                path="applicant.email",
                label="Email address",
                type="string",
                required=False,
                default_question="What email address should we use for updates?",
                clarification_question="Please confirm the applicant's email address.",
                validation_refs=["email"],
                render_targets=["applicant_email"],
            ),
            TemplateField(
                path="applicant.address.street",
                label="Street address",
                type="string",
                required=True,
                default_question="What is the applicant's street address?",
                clarification_question="Please provide the street address for the applicant.",
                validation_refs=["required"],
                render_targets=["applicant_address_street"],
            ),
            TemplateField(
                path="applicant.address.city",
                label="City",
                type="string",
                required=True,
                default_question="Which city does the applicant live in?",
                clarification_question="Please confirm the applicant's city.",
                validation_refs=["required"],
                render_targets=["applicant_address_city"],
            ),
            TemplateField(
                path="applicant.address.state",
                label="State",
                type="enum",
                required=True,
                enum_options=["CA", "NY", "TX", "WA", "IL"],
                default_question="Which state does the applicant live in?",
                clarification_question=(
                    "Please select the applicant's state from the allowed options."
                ),
                validation_refs=["required", "enum"],
                render_targets=["applicant_address_state"],
            ),
            TemplateField(
                path="applicant.address.postal_code",
                label="Postal code",
                type="string",
                required=True,
                default_question="What is the applicant's postal code?",
                clarification_question="Please confirm the applicant's five-digit postal code.",
                validation_refs=["required", "postal_code"],
                render_targets=["applicant_address_postal_code"],
            ),
            TemplateField(
                path="applicant.has_dependents",
                label="Has dependents",
                type="boolean",
                required=True,
                default_question="Does the applicant have dependents?",
                clarification_question="Please confirm whether the applicant has dependents.",
                validation_refs=["required", "boolean"],
                render_targets=["applicant_has_dependents"],
            ),
            TemplateField(
                path="applicant.dependents_count",
                label="Dependents count",
                type="integer",
                required=False,
                default_question="How many dependents does the applicant support?",
                clarification_question="Please confirm the total number of dependents.",
                validation_refs=["integer", "min:0"],
                render_targets=["applicant_dependents_count"],
                conditions={"depends_on": "applicant.has_dependents", "equals": True},
            ),
            TemplateField(
                path="employment.currently_employed",
                label="Currently employed",
                type="boolean",
                required=True,
                default_question="Is the applicant currently employed?",
                clarification_question=(
                    "Please confirm whether the applicant is currently employed."
                ),
                validation_refs=["required", "boolean"],
                render_targets=["employment_currently_employed"],
            ),
            TemplateField(
                path="employment.employer_name",
                label="Employer name",
                type="string",
                required=False,
                default_question="Who is the applicant's current employer?",
                clarification_question="Please confirm the employer's name.",
                validation_refs=["min_length:2"],
                render_targets=["employment_employer_name"],
                conditions={
                    "depends_on": "employment.currently_employed",
                    "equals": True,
                },
            ),
            TemplateField(
                path="employment.monthly_income",
                label="Monthly income",
                type="number",
                required=True,
                default_question="What is the applicant's monthly income?",
                clarification_question="Please confirm the applicant's monthly income in dollars.",
                validation_refs=["required", "number", "min:0"],
                render_targets=["employment_monthly_income"],
            ),
            TemplateField(
                path="benefits.requested_program",
                label="Requested program",
                type="enum",
                required=True,
                enum_options=["food_support", "housing_assistance", "utility_relief"],
                default_question="Which assistance program is the applicant requesting?",
                clarification_question="Please select the requested assistance program.",
                validation_refs=["required", "enum"],
                render_targets=["benefits_requested_program"],
            ),
            TemplateField(
                path="benefits.has_prior_application",
                label="Prior application on file",
                type="boolean",
                required=True,
                default_question="Has the applicant filed for this program before?",
                clarification_question="Please confirm whether there was a prior application.",
                validation_refs=["required", "boolean"],
                render_targets=["benefits_has_prior_application"],
            ),
            TemplateField(
                path="benefits.prior_application_id",
                label="Prior application ID",
                type="string",
                required=False,
                default_question="What was the prior application ID?",
                clarification_question="Please confirm the prior application identifier.",
                validation_refs=["min_length:4"],
                render_targets=["benefits_prior_application_id"],
                conditions={
                    "depends_on": "benefits.has_prior_application",
                    "equals": True,
                },
            ),
            TemplateField(
                path="identity.ssn_last4",
                label="Last four of SSN",
                type="string",
                required=True,
                default_question="What are the last four digits of the applicant's SSN?",
                clarification_question=(
                    "Please confirm the last four digits of the applicant's SSN."
                ),
                help_text="Only the final four digits should be provided.",
                sensitivity="sensitive",
                validation_refs=["required", "ssn_last4"],
                render_targets=["identity_ssn_last4"],
            ),
        ],
        field_groups=[
            TemplateFieldGroup(
                group_id="applicant",
                label="Applicant",
                description="Core identity and address details for the applicant.",
                field_paths=[
                    "applicant.full_name",
                    "applicant.date_of_birth",
                    "applicant.phone",
                    "applicant.email",
                    "applicant.address.street",
                    "applicant.address.city",
                    "applicant.address.state",
                    "applicant.address.postal_code",
                ],
            ),
            TemplateFieldGroup(
                group_id="household",
                label="Household",
                description="Household composition and dependent questions.",
                field_paths=["applicant.has_dependents", "applicant.dependents_count"],
            ),
            TemplateFieldGroup(
                group_id="employment",
                label="Employment",
                description="Current employment and income details.",
                field_paths=[
                    "employment.currently_employed",
                    "employment.employer_name",
                    "employment.monthly_income",
                ],
            ),
            TemplateFieldGroup(
                group_id="benefits",
                label="Benefits Request",
                description="Program selection and prior filing history.",
                field_paths=[
                    "benefits.requested_program",
                    "benefits.has_prior_application",
                    "benefits.prior_application_id",
                    "identity.ssn_last4",
                ],
            ),
        ],
        validation_rules=[
            {"rule_id": "required", "type": "requiredness"},
            {"rule_id": "ssn_last4", "type": "format", "pattern": r"^\d{4}$"},
            {"rule_id": "postal_code", "type": "format", "pattern": r"^\d{5}$"},
            {"rule_id": "phone", "type": "format", "pattern": r"^[0-9+()\\- ]{7,20}$"},
            {"rule_id": "email", "type": "format", "pattern": r"^[^@]+@[^@]+\.[^@]+$"},
        ],
        conversation_config={
            "tone": "clear and supportive",
            "explanation_style": "short",
            "reask_cooldown_turns": 2,
        },
        supported_artifacts=["fillable_pdf", "json_export"],
        renderer_config={
            "artifact_type": "fillable_pdf",
            "template_asset": "assets/pdfs/household_assistance_packet.pdf",
            "field_map": {
                "applicant.full_name": "applicant_full_name",
                "applicant.date_of_birth": "applicant_dob",
                "applicant.phone": "applicant_phone",
                "applicant.email": "applicant_email",
                "identity.ssn_last4": "identity_ssn_last4",
            },
        },
    )


async def ensure_seed_templates(session: AsyncSession) -> None:
    existing = await get_template(session, "household-assistance-intake", 1)
    if existing is not None:
        return
    await create_template(session, build_mvp_template())
