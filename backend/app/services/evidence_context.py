from __future__ import annotations

from uuid import UUID


ATTEMPT_CONTEXT_FREE_TRAINING = "free_training"
ATTEMPT_CONTEXT_PLANNED_TRAINING = "planned_training"
ATTEMPT_CONTEXT_CONTROL = "control"
ATTEMPT_CONTEXT_PLANNED_CONTROL = "planned_control"
ATTEMPT_CONTEXT_REMEDIATION = "remediation"
ATTEMPT_CONTEXT_STRICT_SIMULATION = "strict_simulation"


def resolve_attempt_context(
    *,
    simulation_id: UUID | None = None,
    planned_task_id: int | None = None,
    mode: str | None = None,
    is_remediation: bool = False,
) -> str:
    if simulation_id is not None:
        return ATTEMPT_CONTEXT_STRICT_SIMULATION

    if is_remediation:
        return ATTEMPT_CONTEXT_REMEDIATION

    normalized_mode = (mode or "").strip().lower()
    is_control_mode = normalized_mode == "exam"

    if planned_task_id is not None and is_control_mode:
        return ATTEMPT_CONTEXT_PLANNED_CONTROL

    if planned_task_id is not None:
        return ATTEMPT_CONTEXT_PLANNED_TRAINING

    if is_control_mode:
        return ATTEMPT_CONTEXT_CONTROL

    return ATTEMPT_CONTEXT_FREE_TRAINING
