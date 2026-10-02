"""Unit tests for product export CSV rendering."""

from app.api.data_collection.presentation.product_export import CSV_COLUMNS, _csv_safe, render_products_csv


def test_csv_safe_neutralises_spreadsheet_formulas() -> None:
    """User text a spreadsheet would evaluate is kept as text; everything else passes through."""
    assert _csv_safe("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert _csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert _csv_safe("Kettle") == "Kettle"
    assert _csv_safe(-1.5) == -1.5
    assert _csv_safe(None) is None


def test_csv_starts_with_utf8_bom() -> None:
    """Excel reads a CSV without a BOM in the legacy code page, garbling non-ASCII names."""
    assert render_products_csv([]) == "\ufeff" + ",".join(CSV_COLUMNS) + "\r\n"
