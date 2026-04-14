from app.services.onboarding_service import _derive_peak_energy


def test_derive_peak_energy_uses_user_values():
    start, end = _derive_peak_energy("early_bird", "06:00", "07:00", "09:00")
    assert (start, end) == ("07:00", "09:00")


def test_derive_peak_energy_uses_chronotype_default():
    start, end = _derive_peak_energy("intermediate", "07:00", None, None)
    assert (start, end) == ("09:00", "13:00")

