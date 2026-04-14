from datetime import date
from types import SimpleNamespace

from app.schemas.onboarding import FixedBlockResponse, GoalResponse


def test_fixed_block_response_serializes_date_fields():
    orm_obj = SimpleNamespace(
        id="57eff0a8-d6f1-4308-9d5f-99f943e8e5f9",
        user_id="8d7cf9a2-95af-4995-9ce1-7025ac8fb1d0",
        title="College",
        block_type="college",
        applies_to_days=[2, 3, 4, 5, 6],
        start_time="09:00",
        end_time="16:00",
        is_hard_constraint=True,
        buffer_before=0,
        buffer_after=0,
        valid_from=date(2026, 4, 1),
        valid_until=date(2026, 5, 1),
        is_seasonal=False,
        season_label=None,
    )
    response = FixedBlockResponse.model_validate(orm_obj, from_attributes=True)
    assert response.valid_from == "2026-04-01"
    assert response.valid_until == "2026-05-01"


def test_goal_response_reads_goal_metadata_alias():
    orm_obj = SimpleNamespace(
        id="57eff0a8-d6f1-4308-9d5f-99f943e8e5f9",
        user_id="8d7cf9a2-95af-4995-9ce1-7025ac8fb1d0",
        title="Goal",
        goal_type="exam",
        description=None,
        target_date=date(2026, 8, 1),
        motivation=None,
        consequence=None,
        success_metric=None,
        status="active",
        goal_metadata={"subjects": ["math"]},
    )
    response = GoalResponse.model_validate(orm_obj, from_attributes=True)
    assert response.target_date == "2026-08-01"
    assert response.metadata == {"subjects": ["math"]}
