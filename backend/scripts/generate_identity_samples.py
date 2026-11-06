"""Generate synthetic identity-document fixtures with ReportLab. No real identities."""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from textwrap import wrap
from zipfile import ZIP_DEFLATED, ZipFile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[2] / "output" / "pdf" / "indian-documents"
)
WIDTH, HEIGHT = A5
INK = colors.HexColor("#173E42")
MUTED = colors.HexColor("#536768")


@dataclass(frozen=True)
class SampleDocument:
    filename: str
    heading: str
    subtitle: str
    pages: tuple[tuple[tuple[str, str], ...], ...]


SAMPLES = (
    SampleDocument(
        "sample-aadhaar.pdf",
        "AADHAAR",
        "UIDAI / Unique Identification - synthetic fixture",
        (
            (
                ("Full name", "Kavya Sample"),
                ("Year of birth", "1994"),
                ("Gender", "Female"),
                ("Aadhaar number", "XXXX XXXX 4826"),
            ),
            (
                ("Full name", "Kavya Sample"),
                ("Aadhaar number", "XXXX XXXX 4826"),
                (
                    "Address",
                    "18 Example Lane, Sample Layout, Bengaluru, Karnataka - 560001",
                ),
            ),
        ),
    ),
    SampleDocument(
        "sample-pan.pdf",
        "PAN",
        "INCOME TAX DEPARTMENT - synthetic fixture",
        (
            (
                ("Full name", "Kavya Sample"),
                ("Father's name", "Arun Sample"),
                ("Date of birth", "12/07/1994"),
                ("Permanent Account Number", "ZZZPS1234Z"),
            ),
        ),
    ),
    SampleDocument(
        "sample-driving-licence.pdf",
        "DRIVING LICENCE",
        "TRANSPORT DEPARTMENT - synthetic fixture",
        (
            (
                ("Full name", "Kavya Sample"),
                ("Driving licence number", "KA0120240012345"),
                ("Date of birth", "12/07/1994"),
                ("Issue date", "15/01/2024"),
            ),
            (
                ("Full name", "Kavya Sample"),
                ("Driving licence number", "KA0120240012345"),
                ("Non-transport valid until", "14/01/2044"),
                ("Vehicle classes", "LMV, MCWG"),
                (
                    "Address",
                    "18 Example Lane, Sample Layout, Bengaluru, Karnataka - 560001",
                ),
            ),
        ),
    ),
)

EXPECTED = {
    "aadhaar": {
        "full_name": "Kavya Sample",
        "document_number": "XXXX XXXX 4826",
        "year_of_birth": 1994,
        "address": "18 Example Lane, Sample Layout, Bengaluru, Karnataka - 560001",
    },
    "pan": {
        "full_name": "Kavya Sample",
        "document_number": "ZZZPS1234Z",
        "date_of_birth": "1994-07-12",
    },
    "applicant": {"include_driving_licence": True},
    "driving_licence": {
        "full_name": "Kavya Sample",
        "document_number": "KA0120240012345",
        "date_of_birth": "1994-07-12",
        "expiry_date": "2044-01-14",
        "vehicle_classes": "LMV, MCWG",
        "address": "18 Example Lane, Sample Layout, Bengaluru, Karnataka - 560001",
    },
}


def draw_page(
    pdf: canvas.Canvas,
    sample: SampleDocument,
    fields: tuple[tuple[str, str], ...],
    page: int,
) -> None:
    pdf.setFillColor(colors.HexColor("#F5F7F3"))
    pdf.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(INK)
    pdf.rect(0, HEIGHT - 48, WIDTH, 48, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(30, HEIGHT - 30, "SAMPLE / NOT VALID")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(30, HEIGHT - 95, sample.heading)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(30, HEIGHT - 119, sample.subtitle)
    pdf.setStrokeColor(colors.HexColor("#C9D6CF"))
    pdf.line(30, HEIGHT - 140, WIDTH - 30, HEIGHT - 140)
    y = HEIGHT - 174
    for label, value in fields:
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(MUTED)
        pdf.drawString(30, y, label.upper())
        y -= 21
        pdf.setFont("Helvetica", 14)
        pdf.setFillColor(INK)
        for line in wrap(value, width=43):
            pdf.drawString(30, y, line)
            y -= 19
        y -= 18
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(
        30, 63, "Synthetic test data. No official seals, signatures, or QR codes."
    )
    pdf.drawString(30, 47, "For extraction testing only. Not an identity document.")
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(30, 25, f"SAMPLE / NOT VALID  |  Page {page} of {len(sample.pages)}")
    pdf.showPage()


def generate_samples(output_dir: Path = DEFAULT_OUTPUT) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for sample in SAMPLES:
        path = output_dir / sample.filename
        pdf = canvas.Canvas(str(path), pagesize=A5, invariant=1, pageCompression=1)
        pdf.setTitle(f"Sample {sample.heading} - NOT VALID")
        pdf.setAuthor("FormFoundry synthetic test fixtures")
        for page, fields in enumerate(sample.pages, start=1):
            draw_page(pdf, sample, fields, page)
        pdf.save()
        paths.append(path)
        logger.info("Generated %s", path)
    (output_dir / "expected-fields.json").write_text(
        json.dumps(EXPECTED, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "README.md").write_text(
        "# Indian document intake test fixtures\n\n"
        "All data is synthetic. Every page is marked SAMPLE / NOT VALID.\n\n"
        "1. Start a case using Indian document intake, version 1.\n"
        "2. Select Aadhaar and upload sample-aadhaar.pdf. It has two pages.\n"
        "3. Select PAN and upload sample-pan.pdf.\n"
        "4. Answer Yes to include a driving licence. Select Driving licence and upload "
        "sample-driving-licence.pdf.\n"
        "5. Review extracted fields against expected-fields.json, then confirm them.\n\n"
        "Aadhaar intentionally contains only a year of birth. Its full date of birth "
        "must remain empty.\n"
        "PAN and driving licence contain a full date. Do not copy it into Aadhaar fields.\n"
        "For a type-mismatch test, upload sample-pan.pdf while selecting Aadhaar. "
        "Expect mismatch and no form candidates from that upload.\n"
        "To test the optional path, use a fresh case, upload Aadhaar and PAN, and "
        "answer No to the driving-licence question.\n\n"
        "These files exercise OCR and basic type/format checks. They cannot test "
        "authenticity, signatures, live databases, or holder matching.\n",
        encoding="utf-8",
    )
    archive = output_dir / "sample-documents.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for path in [
            *paths,
            output_dir / "expected-fields.json",
            output_dir / "README.md",
        ]:
            bundle.write(path, arcname=path.name)
    return paths


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    generate_samples(arguments.output_dir)
