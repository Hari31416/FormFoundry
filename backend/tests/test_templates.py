from fastapi.testclient import TestClient


def test_seeded_template_is_available(client: TestClient) -> None:
    response = client.get("/api/v1/templates")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["template_id"] == "household-assistance-intake"
    assert payload[0]["supported_artifacts"] == ["fillable_pdf", "json_export"]


def test_fetch_template_by_id(client: TestClient) -> None:
    response = client.get("/api/v1/templates/household-assistance-intake")

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Household Assistance Intake Packet"
    assert any(field["path"] == "identity.ssn_last4" for field in payload["schema"])
