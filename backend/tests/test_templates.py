from fastapi.testclient import TestClient


def test_seeded_template_is_available(client: TestClient) -> None:
    response = client.get("/api/v1/templates")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1
    fir_template = next(
        (t for t in payload if t["template_id"] == "fir-report-intake"), None
    )
    assert fir_template is not None
    assert fir_template["supported_artifacts"] == ["pdf", "json_export"]


def test_fetch_template_by_id(client: TestClient) -> None:
    response = client.get("/api/v1/templates/fir-report-intake")

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Indian FIR Report Intake"
    assert any(field["path"] == "incident.summary" for field in payload["schema"])
