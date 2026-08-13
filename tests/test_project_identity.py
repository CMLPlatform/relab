"""Unit tests for the project-identity merge in scripts/sync_brand_assets.py.

The rendering functions are plain string formatting and are covered by
`just assets-check`, which fails when a generated file drifts from its source.
What is worth testing here is the DOI selection, because picking the wrong one
silently repoints every citation on both public sites.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
import sync_brand_assets
import yaml

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    Loader = Callable[..., dict]

CONCEPT = "10.5281/zenodo.16637742"
VERSION = "10.5281/zenodo.19703316"

PROJECT = {
    "institution": "Institute of Environmental Sciences (CML), Leiden University",
    "institutionShort": "CML",
    "department": "Department of Industrial Ecology",
    "contactEmail": "relab@cml.leidenuniv.nl",
    "dataLicence": {"name": "CC BY 4.0", "url": "https://example.invalid", "status": "planned", "docsPath": "/x/"},
    "funding": {"short": "Fund A; Fund B", "sentence": "Supported by Fund A and Fund B."},
}


def citation(identifiers: list[dict], authors: list[dict] | None = None) -> dict:
    """Build a minimal CITATION.cff mapping."""
    return {
        "identifiers": identifiers,
        "authors": authors
        if authors is not None
        else [{"given-names": "Simon", "family-names": "van Lierde", "orcid": "https://orcid.org/x"}],
        "license": "AGPL-3.0-or-later",
        "repository-code": "https://github.com/CMLPlatform/relab",
    }


@pytest.fixture
def sources(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Loader:
    """Point the loader at temporary CITATION.cff / project.json files."""

    def write(citation_data: dict, project_data: dict | None = None) -> dict:
        cff = tmp_path / "CITATION.cff"
        cff.write_text(yaml.safe_dump(citation_data))
        project = tmp_path / "project.json"
        project.write_text(json.dumps(project_data if project_data is not None else PROJECT))
        monkeypatch.setattr(sync_brand_assets, "CITATION_SOURCE", cff)
        monkeypatch.setattr(sync_brand_assets, "PROJECT_SOURCE", project)
        return sync_brand_assets.load_project_identity()

    return write


def test_labelled_concept_doi_wins_over_a_version_doi(sources: Loader) -> None:
    """The version DOI must never be chosen just because it is listed first."""
    identity = sources(
        citation(
            [
                {"type": "doi", "value": VERSION, "description": "Version DOI for v0.2.0"},
                {"type": "doi", "value": CONCEPT, "description": "Concept DOI for all versions"},
            ]
        )
    )
    assert identity["doi"] == CONCEPT
    assert identity["citationUrl"] == f"https://doi.org/{CONCEPT}"


def test_a_single_unlabelled_doi_is_used_as_is(sources: Loader) -> None:
    """A CITATION.cff with one DOI needs no description to be unambiguous."""
    assert sources(citation([{"type": "doi", "value": CONCEPT}]))["doi"] == CONCEPT


def test_ambiguous_dois_fail_loudly(sources: Loader) -> None:
    """Two unlabelled DOIs must fail rather than silently pick one."""
    with pytest.raises(RuntimeError, match="concept DOI"):
        sources(citation([{"type": "doi", "value": VERSION}, {"type": "doi", "value": CONCEPT}]))


def test_missing_doi_fails(sources: Loader) -> None:
    """A swid/other identifier is not a citation DOI."""
    with pytest.raises(RuntimeError, match="no DOI identifier"):
        sources(citation([{"type": "swh", "value": "swh:1:dir:abc"}]))


def test_missing_authors_fail(sources: Loader) -> None:
    """An author-less CITATION.cff would render an empty byline on both sites."""
    with pytest.raises(RuntimeError, match="no authors"):
        sources(citation([{"type": "doi", "value": CONCEPT}], authors=[]))


def test_multiple_authors_read_as_a_sentence(sources: Loader) -> None:
    """Bylines join with 'and', not the raw list repr."""
    identity = sources(
        citation(
            [{"type": "doi", "value": CONCEPT}],
            authors=[
                {"given-names": "Simon", "family-names": "van Lierde"},
                {"given-names": "Franco", "family-names": "Donati"},
            ],
        )
    )
    assert identity["authors"].startswith("Simon van Lierde and Franco Donati")
    assert [p["name"] for p in identity["people"]] == ["Simon van Lierde", "Franco Donati"]


def test_licence_url_is_derived_from_the_repository(sources: Loader) -> None:
    """A trailing slash on repository-code must not produce a double slash."""
    data = citation([{"type": "doi", "value": CONCEPT}])
    data["repository-code"] = "https://github.com/CMLPlatform/relab/"
    assert sources(data)["licenceUrl"] == "https://github.com/CMLPlatform/relab/blob/main/LICENSE"


def test_committed_sources_still_load() -> None:
    """Guards the real CITATION.cff and assets/project.json against drift in shape."""
    identity = sync_brand_assets.load_project_identity()
    assert identity["doi"] == CONCEPT
    assert identity["licence"] == "AGPL-3.0-or-later"
    assert identity["institution"].startswith("Institute of Environmental Sciences")
    assert identity["funding"]["short"]
