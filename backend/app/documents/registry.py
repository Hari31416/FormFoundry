"""Document rules are independent of form templates and processing providers."""

from app.documents.models import DocumentDefinition, DocumentKind

DEFINITIONS = (
    DocumentDefinition(
        country="IN",
        document_type="aadhaar",
        type_indicators=["aadhaar", "aadhar", "uidai", "आधार", "unique identification"],
        fields=[
            "document_number",
            "full_name",
            "date_of_birth",
            "year_of_birth",
            "gender",
            "address",
        ],
        required_fields=["document_number", "full_name"],
    ),
    DocumentDefinition(
        country="IN",
        document_type="pan",
        type_indicators=["income tax", "permanent account", "आयकर", "स्थायी खाता"],
        fields=["document_number", "full_name", "date_of_birth", "father_name"],
        required_fields=["document_number", "full_name"],
    ),
    DocumentDefinition(
        country="IN",
        document_type="driving_licence",
        type_indicators=[
            "driving licence",
            "driving license",
            "driver’s license",
            "driver's license",
            "transport department",
            "परिवहन",
            "चालन अनुज्ञप्ति",
        ],
        fields=[
            "document_number",
            "full_name",
            "date_of_birth",
            "address",
            "issue_date",
            "expiry_date",
            "vehicle_classes",
        ],
        required_fields=["document_number", "full_name"],
    ),
)


def get_definition(kind: DocumentKind) -> DocumentDefinition | None:
    return next(
        (
            item
            for item in DEFINITIONS
            if item.country == kind.country and item.document_type == kind.document_type
        ),
        None,
    )
