from app.services.checkin_service import _determine_day_type_from_checkin


def test_checkin_day_type_minimum_viable_when_exhausted_and_rough():
    day_type = _determine_day_type_from_checkin("exhausted", "rough", None)
    assert day_type == "minimum_viable"


def test_checkin_day_type_stretch():
    day_type = _determine_day_type_from_checkin("high", "crushed_it", "none")
    assert day_type == "stretch"

