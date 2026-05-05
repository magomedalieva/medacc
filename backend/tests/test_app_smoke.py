from app.main import create_application


def test_application_exposes_openapi_schema() -> None:
    application = create_application()

    payload = application.openapi()
    assert payload["info"]["title"] == "MedAcc Backend"
    assert any(path.startswith("/api/v1/") for path in payload["paths"])
