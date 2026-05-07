from uuid import UUID

from app.services.evidence_context import (
    ATTEMPT_CONTEXT_CONTROL,
    ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC,
    ATTEMPT_CONTEXT_STRICT_SIMULATION,
    resolve_attempt_context,
)


def test_initial_diagnostic_context_is_distinct_from_control() -> None:
    assert ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC != ATTEMPT_CONTEXT_CONTROL


def test_strict_simulation_context_keeps_priority() -> None:
    assert (
        resolve_attempt_context(simulation_id=UUID("00000000-0000-0000-0000-000000000001"), mode="exam")
        == ATTEMPT_CONTEXT_STRICT_SIMULATION
    )
