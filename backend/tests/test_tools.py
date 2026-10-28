import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.sample_data import sample_transactions
from app.tools import detect_stealth_hikes, calculate_annual_leakage, generate_cancellation_script

def test_sample_contains_expected_price_hike():
    hikes = detect_stealth_hikes(sample_transactions())
    assert len(hikes) == 1
    assert hikes[0]["merchant"] == "StreamBox Premium"
    assert hikes[0]["old_amount"] == 37.69 and hikes[0]["new_amount"] == 49.0
    assert hikes[0]["change_pct"] == 30.0

def test_annual_cost():
    assert calculate_annual_leakage("StreamBox Premium", 49.0)["annual_cost"] == 588.0

def test_draft_is_not_sent():
    draft = generate_cancellation_script("StreamBox Premium", 37.69, 49.0)
    assert draft["sent"] is False and "$11.31" in draft["draft"]

def test_flat_spotify_is_not_flagged():
    spotify = [t for t in sample_transactions() if t.merchant == "Spotify"]
    assert detect_stealth_hikes(spotify) == []

def test_exact_ten_percent_is_not_flagged():
    from app.models import Transaction
    tx = [Transaction(merchant="Test", date="2026-01-01", category="Subscriptions", amount=10), Transaction(merchant="Test", date="2026-02-01", category="Subscriptions", amount=11)]
    assert detect_stealth_hikes(tx) == []

def test_negative_monthly_amount_raises():
    import pytest
    with pytest.raises(ValueError): calculate_annual_leakage("x", -1)
