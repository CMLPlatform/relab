"""Unit tests for the pure logic of the dataset release builder."""

import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from PIL import Image as PILImage

import scripts.build_dataset_release as release
from scripts.build_dataset_release import (
    CATEGORIES_SCHEMA,
    DEFAULT_EXCLUDED_NAME_WORDS,
    EXCLUSION_HEADER,
    INVENTORY_HEADER,
    MATERIALS_SCHEMA,
    MINIMUM_RELEASE_TERMS_VERSION,
    PRODUCT_TYPES_SCHEMA,
    RECORD_MATERIALS_SCHEMA,
    RECORDS_SCHEMA,
    REVIEW_DIR,
    SHARED_ACCOUNTS,
    TAXONOMIES_SCHEMA,
    UNITS_SCHEMA,
    BuildStats,
    ReleaseMetadata,
    SelectionRules,
    build,
    check_owner_selection,
    check_salt_fingerprint,
    checksum_violations,
    exif_violations,
    file_sha256,
    forbidden_column_names,
    forbidden_values,
    has_release_consent,
    inventory,
    iter_archive_files,
    log_exclusion_tally,
    matched_name_word,
    missing_references,
    parse_args,
    parse_checksums,
    provenance_flags,
    pseudonymise,
    read_parquet,
    reject_shared_accounts,
    render_citation_cff,
    render_contributors,
    render_croissant,
    render_inventory_csv,
    render_readme,
    salt_fingerprint,
    select_records,
    selection_rules,
    summarise_owner,
    verify,
    write_artefacts,
    write_checksums,
    write_csv,
    write_parquet,
    write_review_extracts,
)

if TYPE_CHECKING:
    from typing import Any

USER_ID = "3f7b2a4e-1c8d-4a3f-9b21-8e6d5c4b3a20"
OTHER_USER_ID = "9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"


### Pseudonymisation ###
def test_pseudonym_is_stable_for_the_same_id_and_salt() -> None:
    """The same owner and salt must yield the same pseudonym on every run."""
    assert pseudonymise(USER_ID, "salt") == pseudonymise(USER_ID, "salt")


def test_pseudonym_differs_per_user() -> None:
    """Two owners must never collapse onto one pseudonym."""
    assert pseudonymise(USER_ID, "salt") != pseudonymise(OTHER_USER_ID, "salt")


def test_pseudonym_differs_per_salt() -> None:
    """Pseudonyms are keyed, so a different salt yields a different identifier."""
    assert pseudonymise(USER_ID, "salt-a") != pseudonymise(USER_ID, "salt-b")


def test_pseudonym_does_not_contain_the_source_id() -> None:
    """The user id must not survive into the published identifier."""
    pseudonym = pseudonymise(USER_ID, "salt")
    assert USER_ID not in pseudonym
    assert pseudonym.startswith("owner-")


### Verification predicates ###
@pytest.mark.parametrize(
    "column",
    ["email", "owner_id", "username", "is_superuser", "upload_total_bytes", "last_login_at", "mfa_totp_secret"],
)
def test_forbidden_column_names_flags_account_columns(column) -> None:
    """Account, auth and quota columns must never reach a published table."""
    assert forbidden_column_names(["id", "name", column]) == [column]


def test_forbidden_column_names_allows_the_published_schema() -> None:
    """The records schema itself must pass the structural leak check."""
    assert forbidden_column_names(RECORDS_SCHEMA.names) == []


def test_forbidden_values_finds_emails() -> None:
    """An email address anywhere in a text output is a leak."""
    assert forbidden_values("contact a.person@example.org please") == ["a.person@example.org"]


def test_forbidden_values_finds_ipv4_addresses() -> None:
    """An IPv4 address anywhere in a text output is a leak."""
    assert forbidden_values("seen from 192.168.10.4") == ["192.168.10.4"]


def test_forbidden_values_finds_ipv6_addresses() -> None:
    """An IPv6 address anywhere in a text output is a leak."""
    assert forbidden_values("seen from 2001:0db8:85a3:0000:0000:8a2e:0370:7334") == [
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
    ]


def test_forbidden_values_ignores_timestamps_and_dois() -> None:
    """Record timestamps and DOIs must not be mistaken for network identifiers."""
    # The bare clock time is the discriminating case: it is two colon-separated hex-looking
    # groups, which a laxer IPv6 pattern would report on every timestamp column.
    text = "2026-08-13T12:34:56+00:00, taken at 12:34:56, 10.5281/zenodo.19703316, 1.5, 20.0"
    assert forbidden_values(text) == []


def test_missing_references_reports_unresolvable_keys() -> None:
    """A foreign key pointing outside the frozen reference tables fails the build."""
    rows = [{"product_type_id": "1"}, {"product_type_id": "99"}, {"product_type_id": ""}]
    assert missing_references(rows, "product_type_id", {"1"}, "records") == [
        "records: product_type_id='99' does not resolve"
    ]


def test_missing_references_accepts_a_fully_resolvable_table() -> None:
    """Empty keys are absent, not dangling."""
    rows = [{"parent_id": ""}, {"parent_id": "7"}]
    assert missing_references(rows, "parent_id", {"7"}, "records") == []


### EXIF backstop ###
def _write_jpeg(path: Path, exif_tags: dict[int, object] | None = None, size: tuple[int, int] = (64, 48)) -> Path:
    image = PILImage.new("RGB", size, (120, 90, 60))
    exif = PILImage.Exif()
    for tag, value in (exif_tags or {}).items():
        exif[tag] = value
    image.save(path, format="JPEG", exif=exif.tobytes() if exif_tags else b"")
    return path


def test_exif_violations_flags_a_tag_outside_the_allowlist(tmp_path) -> None:
    """Any tag outside _PRESERVED_EXIF_TAGS is reported, whatever it holds."""
    # 0x013B is Artist: identifying, and deliberately absent from _PRESERVED_EXIF_TAGS.
    path = _write_jpeg(tmp_path / "artist.jpg", {0x010F: "Canon", 0x013B: "A Person"})
    assert exif_violations(path) == [0x013B]


def test_exif_violations_accepts_allowlisted_capture_parameters(tmp_path) -> None:
    """Capture parameters are kept deliberately and must not trip the check."""
    path = _write_jpeg(tmp_path / "clean.jpg", {0x010F: "Canon", 0x0110: "EOS R"})
    assert exif_violations(path) == []


def test_exif_violations_accepts_an_image_with_no_exif(tmp_path) -> None:
    """An image with no metadata at all is clean."""
    assert exif_violations(_write_jpeg(tmp_path / "bare.jpg")) == []


### Checksums ###
def _build_dir(tmp_path: Path) -> Path:
    root = tmp_path / "release"
    (root / "images").mkdir(parents=True)
    (root / REVIEW_DIR).mkdir()
    (root / "records.csv").write_text("id\n1\n", encoding="utf-8")
    (root / "images" / "a.jpg").write_bytes(b"pixels")
    (root / REVIEW_DIR / "free-text-notes.tsv").write_text("secret note\n", encoding="utf-8")
    return root


def test_iter_archive_files_excludes_review_extracts(tmp_path) -> None:
    """The human-review extracts must never be checksummed or published."""
    root = _build_dir(tmp_path)
    write_checksums(root)
    names = sorted(path.relative_to(root).as_posix() for path in iter_archive_files(root))
    assert names == ["images/a.jpg", "records.csv"]


def test_write_checksums_round_trips(tmp_path) -> None:
    """A freshly built directory verifies against its own SHA256SUMS."""
    root = _build_dir(tmp_path)
    write_checksums(root)
    entries = parse_checksums((root / "SHA256SUMS").read_text(encoding="utf-8"))
    assert entries["images/a.jpg"] == file_sha256(root / "images" / "a.jpg")
    assert checksum_violations(root) == []


def test_checksum_violations_detects_a_changed_file(tmp_path) -> None:
    """A file edited after the build fails verification."""
    root = _build_dir(tmp_path)
    write_checksums(root)
    (root / "images" / "a.jpg").write_bytes(b"different pixels")
    assert checksum_violations(root) == ["checksum: images/a.jpg does not match"]


def test_checksum_violations_detects_an_unlisted_file(tmp_path) -> None:
    """A file added after the build fails verification."""
    root = _build_dir(tmp_path)
    write_checksums(root)
    (root / "images" / "b.jpg").write_bytes(b"extra")
    assert checksum_violations(root) == ["checksum: images/b.jpg is present but unlisted"]


def test_checksum_violations_detects_a_missing_file(tmp_path) -> None:
    """A file removed after the build fails verification."""
    root = _build_dir(tmp_path)
    write_checksums(root)
    (root / "images" / "a.jpg").unlink()
    assert checksum_violations(root) == ["checksum: images/a.jpg is listed but absent"]


def test_parse_checksums_rejects_a_malformed_line() -> None:
    """A checksum file that cannot be parsed is an error, not an empty result."""
    with pytest.raises(ValueError, match="Malformed checksum line"):
        parse_checksums("deadbeef images/a.jpg\n")


### Attribution and generated metadata ###
def test_attribution_string_is_verbatim() -> None:
    """The attribution string is fixed copy; it must render exactly as agreed."""
    assert ReleaseMetadata().attribution == (
        "Relab Teardown Dataset v1.0 (2026). Van Lierde, S. & Donati, F. "
        "Institute of Environmental Sciences (CML), Leiden University. "
        "DOI: 10.5281/zenodo.XXXXXXX. Licensed under CC BY 4.0."
    )


def test_attribution_substitutes_a_real_doi() -> None:
    """The placeholder DOI is substitutable once the Zenodo record exists."""
    meta = ReleaseMetadata(doi="10.5281/zenodo.12345678")
    assert "DOI: 10.5281/zenodo.12345678." in meta.attribution
    assert "XXXXXXX" not in meta.attribution


### Croissant ###
def _croissant(**kwargs: Any) -> dict:
    return json.loads(render_croissant(ReleaseMetadata(**kwargs), BuildStats(records=3, images=9)))


def test_croissant_is_a_dataset_carrying_the_licence() -> None:
    """Croissant must declare a dataset and carry the licence URL."""
    document = _croissant()
    assert document["@type"] == "sc:Dataset"
    assert document["license"] == "https://creativecommons.org/licenses/by/4.0/"


def test_croissant_cite_as_matches_the_attribution_string() -> None:
    """Croissant and the README cite the release identically."""
    assert _croissant()["citeAs"] == ReleaseMetadata().attribution


def test_croissant_fields_are_derived_from_the_parquet_schema() -> None:
    """The Croissant record set is generated from RECORDS_SCHEMA and cannot drift from it."""
    fields = _croissant()["recordSet"][0]["field"]
    assert [entry["name"] for entry in fields] == list(RECORDS_SCHEMA.names)
    by_name = {entry["name"]: entry["dataType"] for entry in fields}
    assert by_name["id"] == "sc:Integer"
    assert by_name["weight_g"] == "sc:Float"
    assert by_name["name"] == "sc:Text"
    assert by_name["created_at"] == "sc:Date"


def test_croissant_declares_parquet_distributions() -> None:
    """The published tables must be described as Parquet, not as CSV."""
    distribution = {entry["@id"]: entry for entry in _croissant()["distribution"]}
    assert distribution["records.parquet"]["encodingFormat"] == "application/vnd.apache.parquet"
    assert distribution["record_materials.parquet"]["encodingFormat"] == "application/vnd.apache.parquet"
    # manifest.csv stays text on purpose; it is an operational file, not a dataset table.
    assert distribution["manifest.csv"]["encodingFormat"] == "text/csv"


def test_croissant_provenance_pins_the_software_version_doi() -> None:
    """A provenance link must name one frozen release, not a concept DOI that moves."""
    meta = ReleaseMetadata()
    assert _croissant()["isBasedOn"] == f"https://doi.org/{meta.software_version_doi}"
    assert meta.software_concept_doi not in _croissant()["isBasedOn"]


### Provenance heuristics ###
def test_provenance_flags_a_flat_stock_style_image(tmp_path) -> None:
    """A flat, metadata-free image is surfaced for a copyright read-through."""
    path = _write_jpeg(tmp_path / "stock.jpg", size=(100, 100))
    reasons = provenance_flags(path, 1000, 300)
    assert any("aspect ratio" in reason for reason in reasons)
    assert any("no camera make/model" in reason for reason in reasons)
    assert any("uniform background" in reason for reason in reasons)


def test_provenance_leaves_a_plausible_teardown_photo_alone(tmp_path) -> None:
    """A textured bench photo with camera EXIF is not flagged."""
    path = tmp_path / "bench.jpg"
    image = PILImage.effect_noise((640, 480), 90).convert("RGB")
    exif = PILImage.Exif()
    exif[0x010F] = "Canon"
    exif[0x0110] = "EOS R"
    image.save(path, format="JPEG", exif=exif.tobytes())
    assert provenance_flags(path, 640, 480) == []


### End-to-end verification over a synthetic release directory ###
def _record(**overrides: Any) -> dict[str, Any]:
    """Return one well-formed record row."""
    moment = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    return {
        "id": 1,
        "owner_pseudonym": "owner-abc123",
        "name": "Drill",
        "description": "A drill",
        "brand": "brandy",
        "model": "X1",
        "product_type_id": 5,
        "weight_g": 900.0,
        "height_cm": 20.0,
        "width_cm": 8.0,
        "depth_cm": 6.0,
        "volume_cm3": 960.0,
        "circularity_properties": "{}",
        "created_at": moment,
        "updated_at": moment,
    } | overrides


def _minimal_release(tmp_path: Path) -> Path:
    """Build a small but complete release directory without touching a database."""
    root = tmp_path / "release"
    root.mkdir()
    # Two rows, the second a component of the first: an integer foreign key inside Parquet
    # has to resolve against ids that manifest.csv can only carry as text.
    write_parquet(
        root / "records.parquet",
        RECORDS_SCHEMA,
        [_record(), _record(id=2, name="Motor", parent_id=1, amount_in_parent=2)],
    )
    write_parquet(
        root / "record_materials.parquet",
        RECORD_MATERIALS_SCHEMA,
        [{"product_id": 1, "material_id": 3, "quantity": 0.5, "unit": "kg"}],
    )
    (root / "images").mkdir()
    _write_jpeg(root / "images" / "abc.jpg", {0x010F: "Canon"})
    write_csv(
        root / "manifest.csv",
        ["file", "record_id", "sha256", "width", "height", "bytes", "format"],
        [["images/abc.jpg", 1, file_sha256(root / "images" / "abc.jpg"), 64, 48, 1, "JPEG"]],
    )
    reference = root / "reference"
    reference.mkdir()
    write_parquet(
        reference / "taxonomies.parquet", TAXONOMIES_SCHEMA, [{"id": 2, "name": "T", "domains": ["products"]}]
    )
    write_parquet(reference / "categories.parquet", CATEGORIES_SCHEMA, [{"id": 4, "name": "C", "taxonomy_id": 2}])
    write_parquet(reference / "materials.parquet", MATERIALS_SCHEMA, [{"id": 3, "name": "Steel"}])
    write_parquet(reference / "product_types.parquet", PRODUCT_TYPES_SCHEMA, [{"id": 5, "name": "Drill"}])
    write_parquet(reference / "units.parquet", UNITS_SCHEMA, [{"name": "kilogram", "symbol": "kg"}])
    write_artefacts(root, ReleaseMetadata(), BuildStats(records=2, images=1, owners=1), {"owner-abc123": 2})
    write_checksums(root)
    return root


def test_verify_accepts_a_clean_release(tmp_path) -> None:
    """A well-formed release, artefacts included, must produce no violations."""
    assert verify(_minimal_release(tmp_path)) == []


def test_verify_rejects_a_dangling_manifest_reference(tmp_path) -> None:
    """A manifest row pointing at a record that is not exported fails the build."""
    root = _minimal_release(tmp_path)
    (root / "manifest.csv").write_text(
        (root / "manifest.csv").read_text(encoding="utf-8").replace(",1,", ",999,"), encoding="utf-8"
    )
    write_checksums(root)
    assert "manifest: record_id='999' does not resolve" in verify(root)


def test_verify_rejects_a_leaked_email(tmp_path) -> None:
    """An email address anywhere in a published text file fails the build."""
    root = _minimal_release(tmp_path)
    (root / "README.md").write_text("contact someone@example.org", encoding="utf-8")
    write_checksums(root)
    assert verify(root) == ["README.md: leaked value 'someone@example.org'"]


### Parquet ###
def test_parquet_preserves_null_and_integer_types(tmp_path) -> None:
    """A null mass must not read back as an empty string, and counts stay integers."""
    path = tmp_path / "records.parquet"
    write_parquet(path, RECORDS_SCHEMA, [_record(weight_g=None, parent_id=None, amount_in_parent=2)])
    row = read_parquet(path)[0]
    assert row["weight_g"] is None
    assert row["parent_id"] is None
    assert row["amount_in_parent"] == 2
    assert isinstance(row["amount_in_parent"], int)
    assert isinstance(row["height_cm"], float)


def test_parquet_schema_does_not_shift_when_a_column_is_all_null(tmp_path) -> None:
    """Declared types survive a release in which a column happens to hold no values."""
    populated = tmp_path / "a.parquet"
    empty = tmp_path / "b.parquet"
    write_parquet(populated, RECORDS_SCHEMA, [_record(weight_g=900.0)])
    write_parquet(empty, RECORDS_SCHEMA, [_record(weight_g=None)])
    assert pq.read_schema(populated) == pq.read_schema(empty)


def _rows_hiding_an_email() -> list[dict[str, Any]]:
    """Return rows whose leaked address survives only inside a compressed data page.

    The address is deliberately neither the smallest nor the largest value in its column,
    so it is not copied into the uncompressed min/max statistics in the Parquet footer.
    """
    rows = [
        _record(id=index, description=f"note {index:03d} bench teardown of a cordless drill") for index in range(200)
    ]
    rows[100]["description"] = "note 100 mail me at leak@example.org about this"
    return rows


def test_verify_catches_an_email_inside_a_parquet_cell(tmp_path) -> None:
    """Parquet is compressed, so the leak scan must read cell values, not file bytes."""
    root = _minimal_release(tmp_path)
    write_parquet(root / "records.parquet", RECORDS_SCHEMA, _rows_hiding_an_email())
    write_checksums(root)
    assert "records.parquet: leaked value 'leak@example.org'" in verify(root)


def test_a_naive_byte_scan_would_not_find_that_email(tmp_path) -> None:
    """Guards the reason the previous test exists: the address is not in the raw bytes."""
    path = tmp_path / "records.parquet"
    write_parquet(path, RECORDS_SCHEMA, _rows_hiding_an_email())
    assert b"leak@example.org" not in path.read_bytes()


def test_verify_catches_a_forbidden_column_in_a_parquet_table(tmp_path) -> None:
    """An account column added to a published table fails the build."""
    root = _minimal_release(tmp_path)
    schema = RECORDS_SCHEMA.append(pa.field("email", pa.string()))
    write_parquet(root / "records.parquet", schema, [_record(email="someone@example.org")])
    write_checksums(root)
    assert "records.parquet: forbidden column 'email'" in verify(root)


### The software DOIs are mirrored from the repository root CITATION.cff ###
CITATION_PATH = Path(__file__).parents[4] / "CITATION.cff"


def _citation_dois() -> dict[str, str]:
    """Return ``{description: doi}`` for the identifiers block of the root CITATION.cff.

    Parsed with a regex rather than a YAML library: pyyaml reaches the backend only as an
    undeclared transitive dependency of uvicorn[standard], and this shape is two lines.
    """
    text = CITATION_PATH.read_text(encoding="utf-8")
    pairs = re.findall(r"^\s*value:\s*(\S+)\n\s*description:\s*(.+)$", text, flags=re.MULTILINE)
    return {description.strip(): value for value, description in pairs}


def test_citation_file_declares_both_software_dois() -> None:
    """The version DOI must have a machine-readable home, not live in a comment."""
    dois = _citation_dois()
    assert "Concept DOI for all versions of Relab" in dois
    assert "Version DOI for Relab v0.2.0" in dois


def test_software_concept_doi_matches_the_citation_file() -> None:
    """The mirrored concept DOI must not drift from CITATION.cff."""
    assert ReleaseMetadata().software_concept_doi == _citation_dois()["Concept DOI for all versions of Relab"]


def test_software_version_doi_matches_the_citation_file() -> None:
    """The mirrored version DOI must not drift from CITATION.cff."""
    assert ReleaseMetadata().software_version_doi == _citation_dois()["Version DOI for Relab v0.2.0"]


def test_the_two_software_dois_are_distinct() -> None:
    """One field doing both jobs is the defect this split exists to prevent."""
    meta = ReleaseMetadata()
    assert meta.software_concept_doi != meta.software_version_doi


### Salt fingerprint guard ###
def test_matching_salt_passes_the_fingerprint_check() -> None:
    """The salt used for previous releases must build without complaint."""
    pinned = salt_fingerprint("the-original-salt")
    assert check_salt_fingerprint("the-original-salt", pinned) == pinned


def test_a_different_salt_aborts_the_build() -> None:
    """A salt that is merely present, but not the original, must fail loudly."""
    pinned = salt_fingerprint("the-original-salt")
    with pytest.raises(SystemExit, match="salt mismatch"):
        check_salt_fingerprint("a-freshly-generated-salt", pinned)


def test_the_abort_message_names_both_fingerprints_and_offers_no_way_on() -> None:
    """The error has to say what happened, not just that something is wrong."""
    pinned = salt_fingerprint("the-original-salt")
    with pytest.raises(SystemExit) as caught:
        check_salt_fingerprint("a-freshly-generated-salt", pinned)
    message = str(caught.value)
    assert pinned in message
    assert salt_fingerprint("a-freshly-generated-salt") in message
    assert "the original was lost" in message


def test_fingerprint_does_not_reveal_the_salt() -> None:
    """The fingerprint is committed and printed, so it must not carry the salt."""
    salt = "correct-horse-battery-staple"
    fingerprint = salt_fingerprint(salt)
    assert salt not in fingerprint
    assert fingerprint != salt
    assert not any(word in fingerprint for word in salt.split("-"))


def test_fingerprint_is_stable_and_salt_specific() -> None:
    """It must identify a salt generation: same salt same value, different salt different."""
    assert salt_fingerprint("a-salt") == salt_fingerprint("a-salt")
    assert salt_fingerprint("a-salt") != salt_fingerprint("b-salt")


def test_first_release_path_reports_the_fingerprint(caplog) -> None:
    """With nothing pinned the build proceeds and tells the user what to record."""
    with caplog.at_level(logging.WARNING):
        fingerprint = check_salt_fingerprint("the-original-salt", "")
    assert fingerprint == salt_fingerprint("the-original-salt")
    assert fingerprint in caplog.text
    assert "PINNED_SALT_FINGERPRINT" in caplog.text


def test_readme_records_the_salt_fingerprint() -> None:
    """A published release has to say which salt generation produced its pseudonyms."""
    meta = ReleaseMetadata(pseudonym_salt_fingerprint="0123456789abcdef")
    assert "0123456789abcdef" in render_readme(meta, BuildStats(records=1, images=1, owners=1))


### Licence scope notes ###
def _readme() -> str:
    """Render the README as one whitespace-normalised string.

    Normalised because the generated prose is hard-wrapped: asserting on a phrase should
    not depend on where a line happens to break.
    """
    return " ".join(render_readme(ReleaseMetadata(), BuildStats(records=1, images=1, owners=1)).split())


def test_readme_says_trademarks_are_not_licensed() -> None:
    """Teardown photographs carry brand marks; the licence does not grant rights in them."""
    readme = _readme()
    assert "Trademarks are not licensed" in readme
    assert "no rights in the trademarks" in readme
    assert "2(b)(2)" in readme


def test_readme_does_not_discourage_legitimate_reuse() -> None:
    """The trademark note must stay accurate, not turn into a warning against reuse."""
    assert "Research, analysis, model training and publication of results are unaffected." in _readme()


def test_readme_says_the_licence_does_not_govern_personal_data() -> None:
    """An open licence grants copyright, not a data-protection basis."""
    readme = _readme()
    assert "Personal data is not governed by the licence" in readme
    assert "no account identifiers" in readme
    assert "stable pseudonymous code" in readme
    assert "contributors are credited collectively rather than individually" in readme
    assert "opted in" not in readme
    assert "GDPR basis" in readme


def test_licence_scope_notes_sit_next_to_the_licence_statement() -> None:
    """A reuser has to meet both notes at the licence, not buried at the end."""
    readme = _readme()
    assert readme.index("## Licence") < readme.index("Trademarks are not licensed")
    assert readme.index("Personal data is not governed by the licence") < readme.index("## Attribution")


def test_croissant_usage_info_mirrors_both_notes() -> None:
    """Machine consumers read usageInfo, so the same two limits must reach them."""
    usage_info = _croissant()["usageInfo"]
    assert "no rights in trademarks" in usage_info
    assert "2(b)(2)" in usage_info
    assert "no account identifiers" in usage_info
    assert "GDPR basis" in usage_info


### Shared accounts ###
def test_demo_is_a_known_shared_account() -> None:
    """The workshop login is named as a constant, not left as a bare string in a condition."""
    assert "demo" in SHARED_ACCOUNTS


def test_reject_shared_accounts_aborts_on_the_shared_login() -> None:
    """Records under a shared login cannot carry a licence grant, so a build must refuse."""
    with pytest.raises(SystemExit, match="shared account"):
        reject_shared_accounts(["lab", "demo"])


def test_shared_account_error_explains_why() -> None:
    """The error has to say what a shared login means for the grant, not just refuse."""
    with pytest.raises(SystemExit) as caught:
        reject_shared_accounts(["demo"])
    message = str(caught.value)
    assert "can no longer be identified" in message
    assert "bind them" in message
    assert "--inventory" in message


def test_reject_shared_accounts_allows_ordinary_accounts() -> None:
    """An individually held account is unaffected."""
    assert reject_shared_accounts(["lab", "oskar"]) is None


def test_build_refuses_a_shared_owner_before_touching_the_filesystem(tmp_path) -> None:
    """The guard sits at the build entry point, so no output directory is created either."""
    out = tmp_path / "release"
    with pytest.raises(SystemExit, match="shared account"):
        asyncio.run(build(out, SelectionRules(owner_usernames=frozenset({"demo"})), "a-salt", ReleaseMetadata()))
    assert not out.exists()


### Inventory ###
def _product(**overrides: Any) -> dict[str, Any]:
    """Return one product row as collect_inventory reads it."""
    return {
        "id": 1,
        "parent_id": None,
        "brand": "Makita",
        "model": "HR2470",
        "description": "a rotary hammer",
        "product_type_id": 5,
        "weight_g": 900.0,
        "height_cm": 20.0,
        "width_cm": 8.0,
        "depth_cm": 6.0,
    } | overrides


def test_summarise_owner_splits_base_products_from_components() -> None:
    """Record counts are reported split, because the two carry different completeness."""
    row = summarise_owner("lab", 2, [_product(id=1), _product(id=2, parent_id=1)], set())
    assert row["base_products"] == 1
    assert row["components"] == 1
    assert row["records"] == 2


def test_summarise_owner_reports_product_completeness() -> None:
    """Product-level brand, model and description presence is what the paper cites."""
    products = [_product(id=1), _product(id=2, brand=None, model=None, description=None)]
    row = summarise_owner("lab", 2, products, set())
    assert row["brand_pct"] == "50.0"
    assert row["model_pct"] == "50.0"
    assert row["description_pct"] == "50.0"


def test_summarise_owner_reports_component_completeness() -> None:
    """Component-level type, mass, geometry and direct image linkage, likewise."""
    components = [
        _product(id=2, parent_id=1),
        _product(id=3, parent_id=1, product_type_id=None, weight_g=None, depth_cm=None),
    ]
    row = summarise_owner("lab", 2, components, {2})
    assert row["component_type_pct"] == "50.0"
    assert row["component_mass_pct"] == "50.0"
    assert row["component_geometry_pct"] == "50.0"
    assert row["component_image_pct"] == "50.0"


def test_summarise_owner_marks_a_shared_account() -> None:
    """The inventory still lists demo, clearly marked, because the paper counts its records."""
    assert summarise_owner("demo", None, [_product()], set())["shared"] == "yes"
    assert summarise_owner("lab", 2, [_product()], set())["shared"] == "no"


def test_summarise_owner_reports_terms_acceptance() -> None:
    """Whether an account accepted the terms, and at which version, is part of the picture."""
    assert summarise_owner("lab", 3, [_product()], set())["terms_version"] == 3
    assert summarise_owner("demo", None, [_product()], set())["terms_version"] == ""


def test_completeness_is_blank_rather_than_zero_when_there_is_nothing_to_divide() -> None:
    """An account with no components has no component completeness, which is not 0%."""
    row = summarise_owner("lab", 2, [_product()], set())
    assert row["component_type_pct"] == ""


def test_inventory_csv_lists_a_shared_account_alongside_the_others() -> None:
    """Excluding demo from the report would defeat the point of having one."""
    rows = [summarise_owner("demo", None, [_product()], set()), summarise_owner("lab", 2, [_product(id=9)], set())]
    report = render_inventory_csv(rows)
    assert report.splitlines()[0] == ",".join(INVENTORY_HEADER)
    assert "demo,yes," in report
    assert "lab,no," in report


def test_inventory_flag_needs_no_owner_and_no_salt() -> None:
    """The report is read-only scoping: requiring a selection or a salt would defeat it."""
    args = parse_args(["--inventory"])
    assert args.inventory is True
    assert args.owner is None
    assert args.pseudonym_salt is None


def test_owner_is_optional_because_consent_decides_scope() -> None:
    """Scope comes from terms acceptance; --owner only narrows within it."""
    assert parse_args(["--out", "x"]).owner is None


def test_inventory_writes_no_archive(tmp_path, monkeypatch) -> None:
    """--inventory must produce a report and nothing else — no records, no images."""
    out = tmp_path / "release"
    destination = tmp_path / "inventory.csv"
    monkeypatch.setattr(
        "scripts.build_dataset_release._read_inventory",
        _fake_read_inventory,
    )
    inventory(destination)
    assert destination.is_file()
    assert "demo,yes," in destination.read_text(encoding="utf-8")
    assert not out.exists()
    assert list(tmp_path.iterdir()) == [destination]


async def _fake_read_inventory(_rules: SelectionRules = SelectionRules()) -> list[dict[str, Any]]:  # noqa: B008
    """Stand in for the database read so the inventory path can be exercised offline."""
    return [summarise_owner("demo", None, [_product()], set())]


### Collective contributor attribution ###
def _contributors(**overrides: Any) -> str:
    """Render CONTRIBUTORS.md with two contributor codes."""
    return render_contributors(ReleaseMetadata(**overrides), {"owner-aaa": 12, "owner-bbb": 3})


def test_contributors_states_credit_is_collective() -> None:
    """Under CC BY the reuser credits the release, not each person who worked on it."""
    contributors = " ".join(_contributors().split())
    assert "credited collectively" in contributors
    assert "a reuser credits the release, not each person who worked on it" in contributors


def test_contributors_names_no_individual_contributor() -> None:
    """A release that pseudonymises everyone must not then name one of them."""
    assert "Zemiolek" not in _contributors()


def test_contributors_promises_no_opt_in_naming() -> None:
    """The opt-in is gone from the platform; no generated text may still offer it."""
    contributors = _contributors().lower()
    assert "opt" not in contributors
    assert "on request" not in contributors


def test_contributors_lists_codes_with_record_counts() -> None:
    """The codes and counts are what a contributor-level split needs, so they stay."""
    contributors = _contributors()
    assert "| `owner-aaa` | 12 |" in contributors
    assert "| `owner-bbb` | 3 |" in contributors


def test_contributors_explains_the_codes_are_stable_and_unresolvable() -> None:
    """Both properties matter: stable enough to group by, not enough to identify."""
    contributors = " ".join(_contributors().split())
    assert "stable across releases" in contributors
    assert "No code resolves to a person in the released data." in contributors


def test_named_credit_appears_in_the_dataset_citation_file() -> None:
    """Named credit is editorial release metadata, and CITATION.cff is where it lives."""
    cff = render_citation_cff(ReleaseMetadata(), BuildStats(records=1, images=1, owners=1))
    assert 'family-names: "Zemiolek"' in cff
    assert 'given-names: "Oskar"' in cff


def test_named_credit_is_a_build_parameter_not_a_database_flag() -> None:
    """Who is named is decided when the release is cut, so it has to be overridable."""
    cff = render_citation_cff(
        ReleaseMetadata(named_lab_contributors=("Ada Lovelace",)),
        BuildStats(records=1, images=1, owners=1),
    )
    assert 'family-names: "Lovelace"' in cff
    assert "Zemiolek" not in cff


def test_naming_nobody_is_allowed() -> None:
    """A release may credit no lab contributor at all; only the dataset authors remain."""
    cff = render_citation_cff(ReleaseMetadata(named_lab_contributors=()), BuildStats(records=1, images=1, owners=1))
    assert "Zemiolek" not in cff
    assert 'family-names: "Donati"' in cff


def test_croissant_usage_info_states_collective_credit() -> None:
    """Machine consumers should read the same attribution model as human ones."""
    assert "credited collectively rather than individually" in _croissant()["usageInfo"]


### Consent decides scope ###
def _owner(username: str, terms_version: int | None = MINIMUM_RELEASE_TERMS_VERSION) -> dict[str, Any]:
    """Return one account as the selection pass reads it."""
    return {"username": username, "terms_version": terms_version}


def _rec(
    record_id: int, owner_id: str = "u1", parent_id: int | None = None, name: str = "Cordless drill"
) -> dict[str, Any]:
    """Return one product row as the selection pass reads it."""
    return {"id": record_id, "owner_id": owner_id, "parent_id": parent_id, "name": name}


def test_release_scope_never_reads_the_platforms_current_terms_version() -> None:
    """The threshold must not be derived from CURRENT_TERMS_VERSION.

    A source-level check on purpose: the two constants are equal today, so no behavioural
    test can tell them apart. The damage only appears the day the terms are revised, when a
    threshold tied to the current version would drop every record whose owner had not yet
    re-accepted — an empty release that looks like a working one.
    """
    # Comments stripped: the script explains the distinction in prose, and that mention is
    # documentation, not a dependency.
    code = re.sub(r"#.*", "", Path(release.__file__).read_text(encoding="utf-8"))
    assert "CURRENT_TERMS_VERSION" not in code
    assert "MINIMUM_RELEASE_TERMS_VERSION = 1" in code


def test_a_later_terms_acceptance_stays_in_scope() -> None:
    """The behavioural half: a contributor who accepted a revision is still included."""
    owners = {"u1": _owner("lab", MINIMUM_RELEASE_TERMS_VERSION + 3)}
    kept, excluded = select_records([_rec(1)], owners, SelectionRules())
    assert [row["id"] for row in kept] == [1]
    assert excluded == []


def test_consent_requires_the_minimum_version_or_later() -> None:
    """Acceptance of a later revision still grants the release licence."""
    assert has_release_consent(MINIMUM_RELEASE_TERMS_VERSION) is True
    assert has_release_consent(MINIMUM_RELEASE_TERMS_VERSION + 5) is True
    assert has_release_consent(MINIMUM_RELEASE_TERMS_VERSION - 1) is False
    assert has_release_consent(None) is False


def test_records_of_a_consenting_owner_are_in_scope_by_default() -> None:
    """No --owner list needed: consent is the selector."""
    kept, excluded = select_records([_rec(1)], {"u1": _owner("lab")}, SelectionRules())
    assert [row["id"] for row in kept] == [1]
    assert excluded == []


def test_records_of_a_non_consenting_owner_are_excluded() -> None:
    """A record whose owner never accepted the terms carries no publication licence."""
    kept, excluded = select_records([_rec(1)], {"u1": _owner("lab", None)}, SelectionRules())
    assert kept == []
    assert excluded[0]["rule"] == "no-terms-acceptance"


def test_owner_narrows_within_the_consenting_set() -> None:
    """--owner restricts; it never widens scope past consent."""
    owners = {"u1": _owner("lab"), "u2": _owner("other")}
    records = [_rec(1, "u1"), _rec(2, "u2")]
    kept, excluded = select_records(records, owners, SelectionRules(owner_usernames=frozenset({"lab"})))
    assert [row["id"] for row in kept] == [1]
    assert excluded[0]["rule"] == "not-in-owner-selection"


def test_check_owner_selection_rejects_a_non_consenting_account() -> None:
    """Naming an account that never accepted must fail, not build an empty release."""
    owners = {"u1": _owner("nope", None)}
    with pytest.raises(SystemExit, match="have not accepted the contributor terms"):
        check_owner_selection(SelectionRules(owner_usernames=frozenset({"nope"})), owners)


def test_check_owner_selection_names_the_offending_account() -> None:
    """The error has to say which account, or it is not actionable."""
    with pytest.raises(SystemExit, match="nope"):
        check_owner_selection(SelectionRules(owner_usernames=frozenset({"nope"})), {"u1": _owner("nope", None)})


def test_check_owner_selection_rejects_an_unknown_account() -> None:
    """A typo in --owner must not silently select nothing."""
    with pytest.raises(SystemExit, match="No such account"):
        check_owner_selection(SelectionRules(owner_usernames=frozenset({"ghost"})), {"u1": _owner("lab")})


def test_check_owner_selection_accepts_a_consenting_account() -> None:
    """The normal case stays quiet."""
    assert check_owner_selection(SelectionRules(owner_usernames=frozenset({"lab"})), {"u1": _owner("lab")}) is None


### Exclusion overrides ###
def test_exclude_owner_drops_that_accounts_records() -> None:
    """An explicit owner exclusion beats consent."""
    owners = {"u1": _owner("lab"), "u2": _owner("other")}
    kept, excluded = select_records(
        [_rec(1, "u1"), _rec(2, "u2")], owners, SelectionRules(excluded_owner_usernames=frozenset({"other"}))
    )
    assert [row["id"] for row in kept] == [1]
    assert excluded[0]["rule"] == "excluded-owner"


def test_exclude_product_drops_the_whole_subtree() -> None:
    """Keeping a component whose parent is gone would leave a dangling parent_id."""
    records = [_rec(1), _rec(2, parent_id=1), _rec(3, parent_id=2)]
    kept, excluded = select_records(records, {"u1": _owner("lab")}, SelectionRules(excluded_product_ids=frozenset({1})))
    assert kept == []
    assert {entry["id"]: entry["rule"] for entry in excluded} == {
        1: "excluded-product",
        2: "ancestor-excluded",
        3: "ancestor-excluded",
    }


def test_excluding_a_component_keeps_its_ancestors() -> None:
    """Exclusion runs down the tree, never up."""
    records = [_rec(1), _rec(2, parent_id=1), _rec(3, parent_id=2)]
    kept, excluded = select_records(records, {"u1": _owner("lab")}, SelectionRules(excluded_product_ids=frozenset({2})))
    assert [row["id"] for row in kept] == [1]
    assert {entry["id"] for entry in excluded} == {2, 3}


### Name filtering ###
@pytest.mark.parametrize("name", ["Test drill", "test drill", "Drill test", "TEST", "test-rig", "Dummy product"])
def test_scratch_names_are_excluded(name) -> None:
    """A configured word at either end of the name marks the record as scratch work."""
    assert matched_name_word(name, DEFAULT_EXCLUDED_NAME_WORDS) is not None


@pytest.mark.parametrize(
    "name", ["Contest winner", "Testa saw", "Detest", "Attest", "Protest banner", "Temperature probe"]
)
def test_near_miss_names_are_kept(name) -> None:
    """A substring match here would silently delete plausible products from the release."""
    assert matched_name_word(name, DEFAULT_EXCLUDED_NAME_WORDS) is None


def test_name_filter_excludes_descendants_of_a_matched_record() -> None:
    """A scratch base product takes its components with it."""
    records = [_rec(1, name="Test rig"), _rec(2, parent_id=1)]
    kept, excluded = select_records(records, {"u1": _owner("lab")}, SelectionRules())
    assert kept == []
    assert [entry["rule"] for entry in excluded] == ["excluded-name-word", "ancestor-excluded"]


def test_name_filter_can_be_switched_off() -> None:
    """A run may keep scratch-looking names deliberately."""
    kept, _ = select_records(
        [_rec(1, name="Test drill")], {"u1": _owner("lab")}, SelectionRules(excluded_name_words=frozenset())
    )
    assert [row["id"] for row in kept] == [1]


def test_extra_name_words_add_to_the_defaults() -> None:
    """--exclude-name-word extends the list rather than replacing it."""
    rules = selection_rules(parse_args(["--exclude-name-word", "prototype"]))
    assert "prototype" in rules.excluded_name_words
    assert "test" in rules.excluded_name_words


def test_no_name_filter_flag_empties_the_word_list() -> None:
    """The off switch has to actually clear the words, not just skip one of them."""
    assert selection_rules(parse_args(["--no-name-filter"])).excluded_name_words == frozenset()


def test_selection_rules_carry_every_exclusion_flag() -> None:
    """Each CLI exclusion reaches the rules object it is supposed to populate."""
    rules = selection_rules(
        parse_args(["--owner", "lab", "--exclude-owner", "bob", "--exclude-product", "7", "--exclude-product", "9"])
    )
    assert rules.owner_usernames == frozenset({"lab"})
    assert rules.excluded_owner_usernames == frozenset({"bob"})
    assert rules.excluded_product_ids == frozenset({7, 9})


### Nothing disappears silently ###
def test_every_exclusion_carries_its_rule_and_name() -> None:
    """A maintainer has to be able to see what went and why."""
    kept, excluded = select_records([_rec(1, name="Test rig")], {"u1": _owner("lab")}, SelectionRules())
    assert kept == []
    assert set(EXCLUSION_HEADER) <= set(excluded[0])
    assert excluded[0]["name"] == "Test rig"
    assert excluded[0]["detail"] == "test"


def test_exclusion_tally_is_logged_per_rule(caplog) -> None:
    """The build reports how many records each rule removed."""
    _, excluded = select_records(
        [_rec(1, name="Test rig"), _rec(2, "u2")], {"u1": _owner("lab"), "u2": _owner("other", None)}, SelectionRules()
    )
    with caplog.at_level(logging.INFO):
        log_exclusion_tally(excluded)
    assert "Excluded 2 record(s)" in caplog.text
    assert "excluded-name-word" in caplog.text
    assert "no-terms-acceptance" in caplog.text


def test_review_extract_lists_every_excluded_record(tmp_path) -> None:
    """The exclusion list lands in review/, outside the published archive."""
    root = tmp_path / "release"
    root.mkdir()
    _, excluded = select_records([_rec(1, name="Test rig")], {"u1": _owner("lab")}, SelectionRules())
    write_review_extracts(root, [], [], excluded)
    extract = root / REVIEW_DIR / "excluded-records.csv"
    assert extract.is_file()
    assert "excluded-name-word" in extract.read_text(encoding="utf-8")
    assert extract not in list(iter_archive_files(root))


def test_inventory_reports_scope_and_exclusions() -> None:
    """A filter is checkable before a build, not discoverable afterwards."""
    assert "in_scope" in INVENTORY_HEADER
    assert "excluded" in INVENTORY_HEADER
    assert "consenting" in INVENTORY_HEADER


def test_inventory_counts_match_the_selection() -> None:
    """The inventory's in-scope count is the same decision the build makes."""
    products = [_product(id=1), _product(id=2, name="Test rig")]
    row = summarise_owner("lab", 1, products, set(), in_scope_ids={1})
    assert row["records"] == 2
    assert row["in_scope"] == 1
    assert row["excluded"] == 1
    assert row["consenting"] == "yes"
