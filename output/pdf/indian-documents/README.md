# Indian document intake test fixtures

All data is synthetic. Every page is marked SAMPLE / NOT VALID.

1. Start a case using Indian document intake, version 1.
2. Select Aadhaar and upload sample-aadhaar.pdf. It has two pages.
3. Select PAN and upload sample-pan.pdf.
4. Answer Yes to include a driving licence. Select Driving licence and upload sample-driving-licence.pdf.
5. Review extracted fields against expected-fields.json, then confirm them.

Aadhaar intentionally contains only a year of birth. Its full date of birth must remain empty.
PAN and driving licence contain a full date. Do not copy it into Aadhaar fields.
For a type-mismatch test, upload sample-pan.pdf while selecting Aadhaar. Expect mismatch and no form candidates from that upload.
To test the optional path, use a fresh case, upload Aadhaar and PAN, and answer No to the driving-licence question.

These files exercise OCR and basic type/format checks. They cannot test authenticity, signatures, live databases, or holder matching.
