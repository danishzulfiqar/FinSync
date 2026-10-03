"""Preference document semantics: defaults, partial merge, validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.preferences import Preferences, PreferencesUpdate


def test_defaults_fill_missing_keys_from_old_rows() -> None:
    prefs = Preferences.model_validate({})
    assert prefs.exclude_internal_transfers is False
    assert prefs.transfer_window_days == 3
    assert prefs.privacy_mode is False
    assert prefs.default_range == "all"
    assert prefs.forecast_horizon == 6


def test_unknown_keys_are_dropped_not_rejected() -> None:
    prefs = Preferences.model_validate({"legacy_flag": True, "privacy_mode": True})
    assert prefs.privacy_mode is True
    assert "legacy_flag" not in prefs.model_dump()


def test_partial_update_only_touches_supplied_keys() -> None:
    current = Preferences(exclude_internal_transfers=True, forecast_horizon=12)
    patch = PreferencesUpdate.model_validate({"privacy_mode": True})
    merged = current.model_copy(update=patch.model_dump(exclude_unset=True))
    assert merged.privacy_mode is True
    assert merged.exclude_internal_transfers is True
    assert merged.forecast_horizon == 12


@pytest.mark.parametrize(
    "payload",
    [
        {"forecast_horizon": 1},
        {"transfer_window_days": 99},
        {"default_range": "2y"},
        {"not_a_setting": 1},
    ],
)
def test_update_rejects_out_of_range_and_unknown(payload: dict) -> None:
    with pytest.raises(ValidationError):
        PreferencesUpdate.model_validate(payload)
