from app.models.goal import Task


def test_task_schedule_fk_matches_migration_behavior():
    fk = next(iter(Task.__table__.c.schedule_id.foreign_keys))
    assert fk.ondelete == "SET NULL"

