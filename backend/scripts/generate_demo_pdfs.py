from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from textwrap import wrap

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "pdfs" / "demo"
PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN = 56
TOP_MARGIN = 64
LINE_HEIGHT = 18


@dataclass(frozen=True, slots=True)
class DemoPdf:
    filename: str
    title: str
    lines: list[str]


DEMO_PDFS: list[DemoPdf] = [
    DemoPdf(
        filename="fir_demo_theft_bengaluru.pdf",
        title="FIR Intake Evidence - Theft (Bengaluru)",
        lines=[
            "Complainant name is Priya Sharma.",
            "Complainant phone number: 9876543210",
            "Complainant email address is priya.sharma@example.com.",
            (
                "Complainant address details: street is 14 Residency Road, "
                "city is Bengaluru, state is Karnataka, zip code is 560025."
            ),
            "Incident date: 2026-04-17",
            "Incident time: 21:15",
            "Incident location: MG Road, Bengaluru",
            "Police station: Ashok Nagar Police Station",
            "Incident category: theft",
            "Incident severity level: medium",
            "Weapons used: none",
            "Incident summary: My phone was stolen from my handbag near MG Road market.",
            "Accused known to complainant: no",
            "Number of accused suspects: 1",
            "Witnesses present: no",
            "Estimated loss in INR: 62000",
            "GST/Tax rate multiplier: 0.18",
            (
                "Details of stolen/damaged property: "
                "One iPhone 15 Pro, black color, serial number Apple98765."
            ),
        ],
    ),
    DemoPdf(
        filename="fir_demo_cyber_fraud_mumbai.pdf",
        title="FIR Intake Evidence - Cyber Fraud (Mumbai)",
        lines=[
            "Complainant name is Rahul Verma.",
            "Complainant phone number: 9988776655",
            "Complainant email address is rahul.verma@example.com.",
            (
                "Complainant address details: street is 302 Seaside Apartments, Andheri West, "
                "city is Mumbai, state is Maharashtra, zip code is 400053."
            ),
            "Incident date: 19/04/2026",
            "Incident time: 11:40",
            "Incident location: Andheri West, Mumbai",
            "Police station: Amboli Police Station",
            "Incident category: cyber_fraud",
            "Incident severity level: high",
            "Weapons used: none",
            (
                "Incident summary: I was tricked into sharing OTP "
                "and INR 148500 was transferred from my savings account."
            ),
            "Accused known to complainant: unknown",
            "Number of accused suspects: 2",
            "Witnesses present: no",
            "Estimated loss in INR: 148500",
            "GST/Tax rate multiplier: 0.05",
            (
                "Details of stolen/damaged property: "
                "Bank funds transfer from State Bank of India account."
            ),
        ],
    ),
    DemoPdf(
        filename="fir_demo_harassment_hyderabad.pdf",
        title="FIR Intake Evidence - Harassment (Hyderabad)",
        lines=[
            "Complainant name is Ananya Reddy.",
            "Complainant phone number: 9123456789",
            "Complainant email address is ananya.reddy@example.com.",
            (
                "Complainant address details: street is 8 Lakeview Colony, Jubilee Hills, "
                "city is Hyderabad, state is Telangana, zip code is 500033."
            ),
            "Incident date: 2026-04-12",
            "Incident time: 19:25",
            "Incident location: Road No. 45, Jubilee Hills",
            "Police station: Jubilee Hills Police Station",
            "Incident category: harassment",
            "Incident severity level: critical",
            "Weapons used: blunt_object",
            "Incident summary: A known person repeatedly threatened me near my residence.",
            "Accused known to complainant: yes",
            "Accused details: Name is Arjun Rao, lives nearby, seen on black scooter TS09AB1122.",
            "Number of accused suspects: 1",
            "Witnesses present: yes",
            "Witnesses details: Neha Kapoor (9876500011), guard Ramesh Yadav (9811122233).",
            (
                "Witness list: "
                "Witness #1 name is Neha Kapoor, phone is 9876500011, and statement summary "
                "is 'Saw the accused holding a weapon outside the gate.' "
                "Witness #2 name is Ramesh Yadav, phone is 9811122233, and statement summary "
                "is 'Security guard who witnessed the shouting and property damage.'"
            ),
            "Estimated loss in INR: 12000",
            "GST/Tax rate multiplier: 0.12",
            (
                "Details of stolen/damaged property: "
                "Damage to main residential wooden gate and external CCTV camera."
            ),
        ],
    ),
    DemoPdf(
        filename="medical_demo_screening_delhi.pdf",
        title="Medical Screening Intake - Patient Case (Delhi)",
        lines=[
            "Patient full name is Neha Kapoor.",
            "Date of birth: 1985-06-12",
            "Gender: female",
            "Primary complaint: Severe abdominal pain and persistent nausea.",
            "Symptom duration: Started 2 days ago, progressively getting worse.",
            "Pain level: severe",
            "Chronic conditions: Hypertension (managed with Atenolol).",
            "Allergies: Penicillin, Peanuts.",
            "Current medications: Atenolol 50mg daily, Multivitamins.",
            "Body temperature: 38.5",
            "Triage priority: urgent",
        ],
    ),
]


def draw_line(pdf: canvas.Canvas, text: str, y: float) -> float:
    wrapped = wrap(text, width=95) or [""]
    for fragment in wrapped:
        pdf.drawString(LEFT_MARGIN, y, fragment)
        y -= LINE_HEIGHT
    return y


def render_demo_pdf(document: DemoPdf, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    pdf.setTitle(document.title)
    y = PAGE_HEIGHT - TOP_MARGIN

    pdf.setFont("Helvetica-Bold", 16)
    y = draw_line(pdf, document.title, y)
    y -= LINE_HEIGHT / 2
    pdf.setFont("Helvetica", 11)

    for line in document.lines:
        if y <= 72:
            pdf.showPage()
            y = PAGE_HEIGHT - TOP_MARGIN
            pdf.setFont("Helvetica", 11)
        y = draw_line(pdf, line, y)

    pdf.save()


def generate_demo_pdfs() -> list[Path]:
    created_paths: list[Path] = []
    for document in DEMO_PDFS:
        output_path = OUTPUT_DIR / document.filename
        render_demo_pdf(document, output_path)
        created_paths.append(output_path)
    return created_paths


if __name__ == "__main__":
    for path in generate_demo_pdfs():
        print(path.relative_to(Path.cwd()))
