"""Unit tests for product export CSV rendering."""

from app.api.data_collection.presentation.product_export import _csv_safe


def test_csv_safe_neutralises_spreadsheet_formulas() -> None:
    """User text a spreadsheet would evaluate is kept as text; everything else passes through."""
    assert _csv_safe("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert _csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert _csv_safe("Kettle") == "Kettle"
    assert _csv_safe(-1.5) == -1.5
    assert _csv_safe(None) is None
