"""Build a reproducible, publishable dataset release directory from the live database.

Output layout (``--out``)::

    records.parquet          in-scope records, owner identity pseudonymised
    record_materials.parquet bill-of-materials rows for those records
    images/                  image files, content-addressed names
    manifest.csv             image file -> record id, checksum, dimensions
    reference/               frozen taxonomy, categories, materials, product types, units
    README.md LICENSE.txt CITATION.cff CONTRIBUTORS.md CHANGELOG.md croissant.json
    SHA256SUMS
    review/                  human-review extracts, including every excluded record and the
                             rule that excluded it; NOT part of the published archive

Two deliberate departures from the April 2026 pipeline, which emitted a PostgreSQL dump:
tabular data plus an image tree (a ``.sql.zst`` forces a reuser to stand up Postgres
before they can look at anything, which is a poor front door for a computer-vision
dataset), and the reference tables are *frozen* into the release rather than dropped
(records pointing at absent material/producttype rows lose their meaning).

The tabular data is Parquet with explicitly declared column types. CSV cannot tell a null
mass from an empty string, or an integer count from a float, and for LCA numbers that
ambiguity is where a silent unit or precision error enters someone else's analysis. Types
are declared rather than inferred: a column that happens to be all-null in one release and
populated in the next would otherwise change type between versions, which is the very
reproducibility failure the frozen reference tables exist to prevent.

The verification pass at the end is not optional and fails the build rather than warning.

Scope is decided by consent: a record is in scope when its owner accepted the contributor
terms. ``--owner`` narrows within that set, never past it, and every exclusion is counted,
logged and listed in ``review/excluded-records.csv``.

Run with: python -m scripts.build_dataset_release --out <dir>
Or, to see what a release would contain without writing one:
    python -m scripts.build_dataset_release --inventory
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import csv
import hashlib
import hmac
import io
import json
import logging
import re
import shutil
import statistics
import sys
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pyarrow as pa
import pyarrow.parquet as pq
from PIL import Image as PILImage
from PIL.ExifTags import IFD
from sqlalchemy import select

from app.api.auth.models import User
from app.api.common.models.enums import Unit
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.file_storage.models import Image, MediaParentType
from app.api.reference_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
)
from app.core.database import async_session_context, close_async_engine
from app.core.env import get_secrets_dir
from app.core.images.constants import _PRESERVED_EXIF_TAGS
from app.core.logging import setup_logging

if TYPE_CHECKING:
    from collections.abc import Iterable, Iterator, Mapping, Sequence

    from sqlalchemy.ext.asyncio import AsyncSession

setup_logging()
logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).parent / "assets"
REVIEW_DIR = "review"
CHECKSUM_FILE = "SHA256SUMS"
CSV_SUFFIX = ".csv"
PARQUET_SUFFIX = ".parquet"
PARQUET_MEDIA_TYPE = "application/vnd.apache.parquet"

# Bumped when the shape of records.parquet / manifest.csv / reference/ changes.
SCHEMA_VERSION = "1"

_TIMESTAMP = pa.timestamp("us", tz="UTC")

# Every column type is declared, never inferred. Nullable numerics stay nullable so an
# absent mass reads as null rather than as zero or an empty string.
RECORDS_SCHEMA = pa.schema(
    [
        pa.field("id", pa.int64(), nullable=False),
        pa.field("parent_id", pa.int64()),
        pa.field("amount_in_parent", pa.int64()),
        pa.field("owner_pseudonym", pa.string(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("description", pa.string()),
        pa.field("brand", pa.string()),
        pa.field("model", pa.string()),
        pa.field("product_type_id", pa.int64()),
        pa.field("weight_g", pa.float64()),
        pa.field("height_cm", pa.float64()),
        pa.field("width_cm", pa.float64()),
        pa.field("depth_cm", pa.float64()),
        pa.field("volume_cm3", pa.float64()),
        # Free-form JSONB on the platform side; carried as a JSON string, since it has no
        # fixed key set to give a column type to.
        pa.field("circularity_properties", pa.string()),
        pa.field("created_at", _TIMESTAMP),
        pa.field("updated_at", _TIMESTAMP),
    ]
)

RECORD_MATERIALS_SCHEMA = pa.schema(
    [
        pa.field("product_id", pa.int64(), nullable=False),
        pa.field("material_id", pa.int64(), nullable=False),
        pa.field("quantity", pa.float64(), nullable=False),
        pa.field("unit", pa.string(), nullable=False),
    ]
)

TAXONOMIES_SCHEMA = pa.schema(
    [
        pa.field("id", pa.int64(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("version", pa.string()),
        pa.field("description", pa.string()),
        pa.field("domains", pa.list_(pa.string()), nullable=False),
        pa.field("source", pa.string()),
    ]
)

CATEGORIES_SCHEMA = pa.schema(
    [
        pa.field("id", pa.int64(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("description", pa.string()),
        pa.field("external_id", pa.string()),
        pa.field("supercategory_id", pa.int64()),
        pa.field("taxonomy_id", pa.int64(), nullable=False),
    ]
)

MATERIALS_SCHEMA = pa.schema(
    [
        pa.field("id", pa.int64(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("description", pa.string()),
        pa.field("source", pa.string()),
        pa.field("density_kg_m3", pa.float64()),
        pa.field("is_crm", pa.bool_()),
    ]
)

PRODUCT_TYPES_SCHEMA = pa.schema(
    [
        pa.field("id", pa.int64(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("description", pa.string()),
    ]
)

CATEGORY_MATERIAL_LINKS_SCHEMA = pa.schema(
    [
        pa.field("category_id", pa.int64(), nullable=False),
        pa.field("material_id", pa.int64(), nullable=False),
    ]
)

CATEGORY_PRODUCT_TYPE_LINKS_SCHEMA = pa.schema(
    [
        pa.field("category_id", pa.int64(), nullable=False),
        pa.field("product_type_id", pa.int64(), nullable=False),
    ]
)

UNITS_SCHEMA = pa.schema(
    [
        pa.field("name", pa.string(), nullable=False),
        pa.field("symbol", pa.string(), nullable=False),
    ]
)

# NOTE: manifest.csv, SHA256SUMS and review/ stay plain text on purpose. They are
# operational files a human greps while chasing a path or a checksum, not dataset tables —
# do not "helpfully" convert them to Parquet for consistency.
MANIFEST_HEADER = ("file", "record_id", "sha256", "width", "height", "bytes", "format")


### Release metadata — every generated artefact is rendered from this one object ###
@dataclass(frozen=True)
class Creator:
    """A named dataset creator."""

    family_names: str
    given_names: str
    orcid: str

    @property
    def short(self) -> str:
        """Return the ``Family, G.`` form used in the attribution string."""
        return f"{self.family_names}, {self.given_names[:1]}."


@dataclass(frozen=True)
class ReleaseMetadata:
    """Everything the archive artefacts are rendered from."""

    title: str = "Relab Teardown Dataset"
    version: str = "1.0"
    year: int = 2026
    # Placeholder until the Zenodo record exists; --doi substitutes the real one.
    doi: str = "10.5281/zenodo.XXXXXXX"
    # Names the salt generation this release's pseudonyms were built with, so a later
    # maintainer can tell whether two published releases are linkable without holding the
    # salt itself.
    pseudonym_salt_fingerprint: str = ""
    # Two DOIs, two jobs. The concept DOI always resolves to the newest software release
    # and is the right "the software lives over there" pointer. The version DOI names one
    # frozen release and is what provenance links must use, because provenance must not
    # move under a reader. Both are mirrored from the repository root CITATION.cff and are
    # held to it by tests/unit/scripts/test_build_dataset_release.py.
    software_concept_doi: str = "10.5281/zenodo.16637742"
    software_version_doi: str = "10.5281/zenodo.19703316"
    affiliation: str = "Institute of Environmental Sciences (CML), Leiden University"
    licence_name: str = "CC BY 4.0"
    licence_spdx: str = "CC-BY-4.0"
    licence_url: str = "https://creativecommons.org/licenses/by/4.0/"
    homepage: str = "https://cml-relab.org"
    repository: str = "https://github.com/CMLPlatform/relab"
    description: str = (
        "Teardown records and photographs of disassembled power tools, collected at the "
        "Institute of Environmental Sciences (CML), Leiden University, to support computer "
        "vision and life cycle assessment research on circular-economy strategies."
    )
    # Editorial: who the release is cut with, decided when it is cut. Not a platform
    # feature and not derived from any database flag — contributors at large are credited
    # collectively, as CC BY intends, and appear only as pseudonymous codes.
    named_lab_contributors: tuple[str, ...] = ("Oskar Imiolek",)
    keywords: tuple[str, ...] = (
        "circular economy",
        "computer vision",
        "life cycle assessment",
        "power tools",
        "product teardown",
    )
    creators: tuple[Creator, ...] = (
        Creator("Van Lierde", "Simon", "https://orcid.org/0009-0006-6953-909X"),
        Creator("Donati", "Franco", "https://orcid.org/0000-0002-8287-2413"),
    )

    @property
    def attribution(self) -> str:
        """Return the verbatim attribution string reusers must reproduce."""
        # ``short`` already ends in the initial's period; the join must not add a second.
        authors = " & ".join(creator.short for creator in self.creators)
        return (
            f"{self.title} v{self.version} ({self.year}). {authors} "
            f"{self.affiliation}. DOI: {self.doi}. Licensed under {self.licence_name}."
        )


@dataclass
class BuildStats:
    """Counts and ranges the README reports, filled in during the build."""

    records: int = 0
    images: int = 0
    owners: int = 0
    collection_start: datetime | None = None
    collection_end: datetime | None = None

    @property
    def collection_period(self) -> str:
        """Return the human-readable collection period, or a placeholder when empty."""
        if self.collection_start is None or self.collection_end is None:
            return "unknown"
        return f"{self.collection_start:%Y-%m-%d} to {self.collection_end:%Y-%m-%d}"


# Consent, not identity, decides what a release contains: a record is in scope when its
# owner accepted the contributor terms at this version or later.
#
# NOT CURRENT_TERMS_VERSION, and the difference is invisible until it bites: pinning to the
# current version would make every future revision of the terms silently drop every record
# until each contributor re-accepted. This number means "the terms version that first
# granted a publication licence", so it moves only if a revision changes the grant itself.
MINIMUM_RELEASE_TERMS_VERSION = 1

# Names that mark a record as scratch work rather than a real teardown.
DEFAULT_EXCLUDED_NAME_WORDS: frozenset[str] = frozenset(
    {"delete", "dummy", "example", "ignore", "sample", "temp", "test", "tmp"}
)


@dataclass(frozen=True)
class SelectionRules:
    """What a build includes, and everything it deliberately leaves out."""

    # Optional narrowing *within* the consenting set. Empty means every consenting account.
    owner_usernames: frozenset[str] = frozenset()
    excluded_owner_usernames: frozenset[str] = frozenset()
    excluded_product_ids: frozenset[int] = frozenset()
    # Empty switches the name filter off for the run.
    excluded_name_words: frozenset[str] = DEFAULT_EXCLUDED_NAME_WORDS


def has_release_consent(terms_version: object) -> bool:
    """Return whether an account's terms acceptance covers publication in a release."""
    return isinstance(terms_version, int) and terms_version >= MINIMUM_RELEASE_TERMS_VERSION


def matched_name_word(name: str, words: Iterable[str]) -> str | None:
    """Return the excluded word *name* starts or ends with, or None.

    Whole words only, at either end, case-insensitively. A substring match on "test" would
    also hit "Contest", "Testa" and "Detest", quietly dropping plausible product names from
    a published dataset.
    """
    for word in sorted(words):
        if re.search(rf"^{re.escape(word)}\b|\b{re.escape(word)}$", name, re.IGNORECASE):
            return word
    return None


def _direct_exclusion(
    record: Mapping[str, Any], owner: Mapping[str, Any], rules: SelectionRules
) -> tuple[str, str] | None:
    """Return the (rule, detail) excluding *record* on its own merits, or None to keep it."""
    username = owner.get("username") or ""
    if not has_release_consent(owner.get("terms_version")):
        return ("no-terms-acceptance", f"owner {username or record['owner_id']} has not accepted the terms")
    if username in rules.excluded_owner_usernames:
        return ("excluded-owner", username)
    if rules.owner_usernames and username not in rules.owner_usernames:
        return ("not-in-owner-selection", username)
    if record["id"] in rules.excluded_product_ids:
        return ("excluded-product", str(record["id"]))
    if word := matched_name_word(record["name"] or "", rules.excluded_name_words):
        return ("excluded-name-word", word)
    return None


def select_records(
    records: Sequence[Mapping[str, Any]], owners: Mapping[Any, Mapping[str, Any]], rules: SelectionRules
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split *records* into what a release keeps and what it drops, with a reason each.

    Exclusion runs down the tree, never up: dropping a component drops its descendants, and
    dropping a base product drops the whole tree. Keeping a component whose parent is gone
    would leave a dangling ``parent_id`` — the verification pass would catch it, but it
    should never get that far.
    """
    by_id = {record["id"]: record for record in records}
    excluded: dict[int, dict[str, Any]] = {}
    for record in records:
        owner = owners.get(record["owner_id"], {})
        if found := _direct_exclusion(record, owner, rules):
            rule, detail = found
            excluded[record["id"]] = {
                "id": record["id"],
                "name": record["name"],
                "owner": owner.get("username") or "",
                "rule": rule,
                "detail": detail,
            }

    children: dict[int, list[int]] = defaultdict(list)
    for record in records:
        if record["parent_id"] is not None:
            children[record["parent_id"]].append(record["id"])
    queue = deque(excluded)
    while queue:
        parent_id = queue.popleft()
        for child_id in children[parent_id]:
            if child_id in excluded:
                continue
            child = by_id[child_id]
            excluded[child_id] = {
                "id": child_id,
                "name": child["name"],
                "owner": owners.get(child["owner_id"], {}).get("username") or "",
                "rule": "ancestor-excluded",
                "detail": f"parent {parent_id}",
            }
            queue.append(child_id)

    kept = [dict(record) for record in records if record["id"] not in excluded]
    return kept, sorted(excluded.values(), key=lambda entry: entry["id"])


def log_exclusion_tally(exclusions: Sequence[Mapping[str, Any]]) -> None:
    """Log how many records each rule removed. Nothing is allowed to disappear quietly."""
    if not exclusions:
        logger.info("No records were excluded.")
        return
    tally = Counter(entry["rule"] for entry in exclusions)
    logger.info("Excluded %d record(s):", len(exclusions))
    for rule, count in sorted(tally.items()):
        logger.info("  %-24s %d", rule, count)


# Logins used by many different people. A shared login cannot carry a licence grant: the
# person who took a photograph owns it whichever account uploaded it, so records here belong
# to individuals who can no longer be identified, and one click-through of the terms on a
# shared account cannot bind everyone who used that login afterwards. Never releasable — and
# deliberately still shown by --inventory, because aggregate counts about records are facts
# about them, not republication of them, and the paper wants those counts. Kept as a cheap
# backstop rather than as the load-bearing rule: a shared login that never accepted the
# terms is already excluded by the consent check.
SHARED_ACCOUNTS: frozenset[str] = frozenset({"demo"})


def reject_shared_accounts(usernames: Iterable[str]) -> None:
    """Abort a real build that names a shared account."""
    shared = sorted(name for name in usernames if name in SHARED_ACCOUNTS)
    if shared:
        msg = (
            f"Refusing to build a release from shared account(s): {', '.join(shared)}. "
            "A shared workshop login was used by many different people, so records under it "
            "belong to individuals who can no longer be identified, and no terms acceptance "
            "on a shared login can bind them. Use --inventory to count these records without "
            "publishing them."
        )
        raise SystemExit(msg)


### Pseudonymisation ###
# Fingerprint of the salt every release so far has used. Empty until the first release
# pins it; fill it in from the value that build logs and commit it. This is not the salt
# and cannot be turned back into it — the salt itself belongs in a password manager and
# must never be committed.
PINNED_SALT_FINGERPRINT = ""

# Fixed, public, and versioned so the fingerprint scheme can change without being mistaken
# for a changed salt.
_SALT_FINGERPRINT_MESSAGE = b"relab-dataset-release-salt-fingerprint-v1"


def pseudonymise(owner_id: object, salt: str) -> str:
    """Return a stable pseudonymous id for *owner_id* under *salt*.

    Keyed rather than plain-hashed: user ids are UUIDs, so an unkeyed digest would let
    anyone holding a candidate id confirm participation by recomputing the hash.
    Reusing the same salt across releases keeps pseudonyms comparable between them.
    """
    digest = hmac.new(salt.encode(), str(owner_id).encode(), hashlib.sha256).hexdigest()
    return f"owner-{digest[:16]}"


def salt_fingerprint(salt: str) -> str:
    """Return a short, non-secret fingerprint identifying which salt is in use.

    An HMAC keyed by the salt over a fixed public string. It is safe to commit and safe to
    print in an error message: recovering the salt from it means breaking HMAC-SHA256.
    """
    return hmac.new(salt.encode(), _SALT_FINGERPRINT_MESSAGE, hashlib.sha256).hexdigest()[:16]


def check_salt_fingerprint(salt: str, pinned: str = PINNED_SALT_FINGERPRINT) -> str:
    """Return the salt's fingerprint, aborting if it differs from the pinned one.

    A missing salt already fails loudly. The dangerous case is a salt that is merely
    *present*: someone who cannot find the original generates a fresh one, the build
    succeeds, and release 2's pseudonyms silently stop lining up with release 1's — which
    nobody notices until a reuser's contributor-level split has been leaking across
    releases for a year.
    """
    fingerprint = salt_fingerprint(salt)
    if not pinned:
        logger.warning(
            "No salt fingerprint is pinned yet, so this is treated as the first release. "
            "Record this fingerprint in PINNED_SALT_FINGERPRINT in %s and commit it, so "
            "every later release is checked against it: %s",
            Path(__file__).name,
            fingerprint,
        )
        return fingerprint
    if fingerprint != pinned:
        msg = (
            f"Pseudonymisation salt mismatch: this salt fingerprints as {fingerprint}, but "
            f"previous releases used {pinned}. Pseudonyms built with it will not line up "
            "with the ones already published, so contributor-level splits would silently "
            "leak across releases. Either the wrong salt was supplied, or the original was "
            "lost. Recover the original salt; do not build a release with this one."
        )
        raise SystemExit(msg)
    return fingerprint


def read_pseudonym_salt(explicit: str | None) -> str:
    """Return the pseudonymisation salt from the CLI or the repo secrets convention."""
    if explicit:
        return explicit
    secrets_dir = get_secrets_dir()
    salt_file = secrets_dir / "dataset_pseudonym_salt" if secrets_dir else None
    if salt_file and salt_file.is_file():
        return salt_file.read_text(encoding="utf-8").strip()
    msg = (
        "No pseudonymisation salt. Pass --pseudonym-salt, or write one to "
        "secrets/<env>/dataset_pseudonym_salt and keep it for every future release."
    )
    raise SystemExit(msg)


### CSV helpers ###
def write_csv(path: Path, header: Sequence[str], rows: Iterable[Sequence[object]]) -> None:
    """Write *rows* to *path* with a deterministic header and newline handling."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    """Read *path* as a list of row dicts."""
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _parquet_value(value: object) -> object:
    """Coerce a database value into something the declared Arrow type accepts."""
    if isinstance(value, dict | list):
        return json.dumps(value, sort_keys=True)
    if isinstance(value, set | frozenset):
        return sorted(_parquet_value(item) for item in value)  # ty: ignore[invalid-argument-type]
    if isinstance(value, Enum):
        return value.value
    return value


def write_parquet(path: Path, schema: pa.Schema, rows: Iterable[dict[str, Any]]) -> None:
    """Write *rows* to *path* under the explicitly declared *schema*.

    The schema is passed rather than inferred: inference on an all-null column would give
    it a different type in the next release, silently breaking a reader that pinned to this
    one.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    records = [{name: _parquet_value(row.get(name)) for name in schema.names} for row in rows]
    pq.write_table(pa.Table.from_pylist(records, schema=schema), path, compression="zstd")


def read_parquet(path: Path) -> list[dict[str, Any]]:
    """Read *path* as a list of row dicts with their declared types preserved."""
    return pq.read_table(path).to_pylist()


def _key(value: object) -> str:
    """Normalise a foreign-key value for comparison; manifest.csv carries its ids as text."""
    return "" if value is None else str(value)


### Database export ###
async def load_owners(session: AsyncSession) -> dict[Any, dict[str, Any]]:
    """Map every account id to its username and terms acceptance.

    Only these three columns are read. The rest of the ``User`` row — email, auth state,
    OAuth links, the quota ledger — is never fetched into the process.
    """
    rows = (await session.execute(select(User.id, User.username, User.terms_accepted_version))).all()
    return {
        user_id: {"username": username, "terms_version": terms_version} for user_id, username, terms_version in rows
    }


def check_owner_selection(rules: SelectionRules, owners: Mapping[Any, Mapping[str, Any]]) -> None:
    """Fail loudly on a ``--owner`` that does not exist or has not accepted the terms.

    Silently returning nothing would look like a working build of an empty release.
    """
    by_username = {owner["username"]: owner for owner in owners.values() if owner["username"]}
    unknown = sorted(name for name in rules.owner_usernames if name not in by_username)
    if unknown:
        msg = f"No such account(s): {', '.join(unknown)}"
        raise SystemExit(msg)
    without_consent = sorted(
        name for name in rules.owner_usernames if not has_release_consent(by_username[name]["terms_version"])
    )
    if without_consent:
        msg = (
            f"Account(s) named with --owner have not accepted the contributor terms at "
            f"version {MINIMUM_RELEASE_TERMS_VERSION} or later: {', '.join(without_consent)}. "
            "Their records carry no publication licence and cannot be released."
        )
        raise SystemExit(msg)


async def load_records(session: AsyncSession) -> list[dict[str, Any]]:
    """Return every product row, owner id included, for the selection pass to filter.

    Columns are selected explicitly rather than loading ``Product`` instances, so the
    owner ``User`` row — which holds email, auth state and the quota ledger — is never
    fetched into the process at all.
    """
    columns = (
        Product.id,
        Product.parent_id,
        Product.amount_in_parent,
        Product.owner_id,
        Product.name,
        Product.description,
        Product.brand,
        Product.model,
        Product.product_type_id,
        Product.weight_g,
        Product.height_cm,
        Product.width_cm,
        Product.depth_cm,
        Product.circularity_properties,
        Product.created_at,
        Product.updated_at,
    )
    records = []
    for row in (await session.execute(select(*columns).order_by(Product.id))).all():
        values = dict(row._mapping)  # noqa: SLF001  # documented SQLAlchemy Row accessor
        dimensions = (values["height_cm"], values["width_cm"], values["depth_cm"])
        values["volume_cm3"] = None if None in dimensions else dimensions[0] * dimensions[1] * dimensions[2]
        records.append(values)
    return records


def pseudonymise_owners(records: Iterable[dict[str, Any]], salt: str) -> list[dict[str, Any]]:
    """Replace each record's owner id with its stable pseudonym, dropping the id itself."""
    pseudonymised = []
    for record in records:
        values = dict(record)
        values["owner_pseudonym"] = pseudonymise(values.pop("owner_id"), salt)
        pseudonymised.append(values)
    return pseudonymised


async def export_record_materials(session: AsyncSession, record_ids: set[int]) -> list[dict[str, Any]]:
    """Return bill-of-materials rows for the in-scope records."""
    statement = (
        select(
            MaterialProductLink.product_id,
            MaterialProductLink.material_id,
            MaterialProductLink.quantity,
            MaterialProductLink.unit,
        )
        .where(MaterialProductLink.product_id.in_(record_ids))
        .order_by(MaterialProductLink.product_id, MaterialProductLink.material_id)
    )
    return [dict(row._mapping) for row in (await session.execute(statement)).all()]  # noqa: SLF001


async def export_images(session: AsyncSession, record_ids: set[int], images_dir: Path) -> list[dict[str, Any]]:
    """Copy in-scope product images into *images_dir* under content-addressed names.

    Returns the manifest rows. A name collision means two records share byte-identical
    pixels, so the copy is skipped and both records point at the one file.
    """
    # NOTE: blocking filesystem IO throughout — this is a one-shot CLI, not a request
    # handler, so there is no event loop to starve.
    images_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    statement = (
        select(Image)
        .where(Image.parent_type == MediaParentType.PRODUCT, Image.parent_id.in_(record_ids))
        .order_by(Image.created_at, Image.id)
    )
    manifest: list[dict[str, Any]] = []
    for image in (await session.execute(statement)).scalars().all():
        try:
            with image.file.open() as handle:
                payload = handle.read()
        except OSError:
            logger.exception("Could not read image %s; skipping", image.id)
            continue
        digest = hashlib.sha256(payload).hexdigest()
        suffix = Path(image.filename).suffix.lower() or ".jpg"
        target = images_dir / f"{digest}{suffix}"
        if not target.exists():
            target.write_bytes(payload)
        with PILImage.open(target) as opened:
            width, height = opened.size
            image_format = opened.format or ""
        manifest.append(
            {
                "file": f"images/{target.name}",
                "record_id": image.parent_id,
                "sha256": digest,
                "width": width,
                "height": height,
                "bytes": len(payload),
                "format": image_format,
            }
        )
    return manifest


def _columns(row: object, schema: pa.Schema) -> dict[str, Any]:
    """Pull the schema's columns off an ORM row."""
    return {name: getattr(row, name) for name in schema.names}


async def export_reference_data(session: AsyncSession, reference_dir: Path) -> dict[str, set[int]]:
    """Freeze the reference tables into *reference_dir* and return their id sets."""
    reference_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240

    taxonomies = (await session.execute(select(Taxonomy).order_by(Taxonomy.id))).scalars().all()
    write_parquet(
        reference_dir / "taxonomies.parquet",
        TAXONOMIES_SCHEMA,
        (_columns(row, TAXONOMIES_SCHEMA) for row in taxonomies),
    )

    categories = (await session.execute(select(Category).order_by(Category.id))).scalars().all()
    write_parquet(
        reference_dir / "categories.parquet",
        CATEGORIES_SCHEMA,
        (_columns(row, CATEGORIES_SCHEMA) for row in categories),
    )

    materials = (await session.execute(select(Material).order_by(Material.id))).scalars().all()
    write_parquet(
        reference_dir / "materials.parquet",
        MATERIALS_SCHEMA,
        (_columns(row, MATERIALS_SCHEMA) for row in materials),
    )

    product_types = (await session.execute(select(ProductType).order_by(ProductType.id))).scalars().all()
    write_parquet(
        reference_dir / "product_types.parquet",
        PRODUCT_TYPES_SCHEMA,
        (_columns(row, PRODUCT_TYPES_SCHEMA) for row in product_types),
    )

    material_links = (
        (await session.execute(select(CategoryMaterialLink).order_by(CategoryMaterialLink.category_id))).scalars().all()
    )
    write_parquet(
        reference_dir / "category_material_links.parquet",
        CATEGORY_MATERIAL_LINKS_SCHEMA,
        (_columns(row, CATEGORY_MATERIAL_LINKS_SCHEMA) for row in material_links),
    )

    type_links = (
        (await session.execute(select(CategoryProductTypeLink).order_by(CategoryProductTypeLink.category_id)))
        .scalars()
        .all()
    )
    write_parquet(
        reference_dir / "category_product_type_links.parquet",
        CATEGORY_PRODUCT_TYPE_LINKS_SCHEMA,
        (_columns(row, CATEGORY_PRODUCT_TYPE_LINKS_SCHEMA) for row in type_links),
    )

    write_parquet(
        reference_dir / "units.parquet",
        UNITS_SCHEMA,
        ({"name": unit.name.lower(), "symbol": unit.value} for unit in Unit),
    )

    return {
        "taxonomy": {row.id for row in taxonomies},
        "category": {row.id for row in categories},
        "material": {row.id for row in materials},
        "product_type": {row.id for row in product_types},
    }


### Archive artefacts ###
def render_readme(meta: ReleaseMetadata, stats: BuildStats) -> str:
    """Render README.md."""
    return f"""# {meta.title} v{meta.version}

{meta.description}

## Scope

Release {meta.version} contains lab-authored records only: teardowns carried out in house at
CML. Records contributed through the public platform by other accounts are out of scope and
are not included.

- Records: {stats.records}
- Images: {stats.images}
- Distinct contributors: {stats.owners}
- Collection period: {stats.collection_period}
- Schema version: {SCHEMA_VERSION}
- Pseudonym salt fingerprint: `{meta.pseudonym_salt_fingerprint}`

## Contents

| Path | What it holds |
| --- | --- |
| `records.parquet` | One row per record (a product or one of its components). |
| `record_materials.parquet` | Bill-of-materials rows linking records to `reference/materials.parquet`. |
| `images/` | Photographs, named by the SHA-256 of their own bytes. |
| `manifest.csv` | Image file to record id, with checksum and pixel dimensions. |
| `reference/` | Frozen taxonomy, categories, materials, product types and units. |
| `croissant.json` | MLCommons Croissant description of this release. |
| `SHA256SUMS` | Checksums for every file above. |

## Format

The tables are Apache Parquet with explicitly declared column types, so a missing mass
reads as null rather than as zero or an empty string, and integer counts stay integers.
Read one with any Arrow-aware tool:

```python
import pyarrow.parquet as pq

records = pq.read_table("records.parquet")
```

`manifest.csv` and `SHA256SUMS` are deliberately plain text: they are operational files for
looking up a path or a checksum by hand, not dataset tables.

The reference tables are frozen into the release rather than referenced remotely: a record
that points at a material or product type which is no longer in the live database would
otherwise lose its meaning.

Owner identity is replaced by a stable pseudonym (`owner-<16 hex>`). The same person keeps
the same pseudonym across releases and cannot be re-identified from the release alone. The
salt fingerprint above identifies which salt generation produced them: two releases sharing
a fingerprint have comparable pseudonyms, and one that differs does not. It is derived from
the salt but does not reveal it.

## Known biases

- **Product class.** Power tools only. Nothing here generalises to other product categories.
- **Geography.** Collected in the Netherlands, from Dutch second-hand and waste streams.
- **Sample size.** Small n. Treat aggregate figures as indicative, not representative.
- **Capture setup.** Photographs come from a small number of teardown benches and cameras,
  so background and lighting are far more uniform than in the field.

## Licence

All records and images are licensed under {meta.licence_name} ({meta.licence_url}).
The full text is in `LICENSE.txt`.

### Trademarks are not licensed

Teardown photographs of power tools show brand marks, logos and model numbers — that is
unavoidable in the subject matter. The licence covers the images and the data. It grants no
rights in the trademarks visible in them; CC BY 4.0 says so in section 2(b)(2). Research,
analysis, model training and publication of results are unaffected. If you intend to use
the images in a way that suggests endorsement by or affiliation with a brand, that is a
trademark question and you need to consider it separately from this licence.

### Personal data is not governed by the licence

An open licence grants copyright and database rights. It says nothing about data
protection. What makes this release publishable is the sanitisation and pseudonymisation
step, not {meta.licence_name}.

The release carries no account identifiers. Contributor identity appears only as a stable
pseudonymous code, and contributors are credited collectively rather than individually.
Re-identifying contributors, or combining this release with other sources in order to do so,
falls outside both the licence and the GDPR basis on which the release was published.

## Attribution

> {meta.attribution}

## Citation

See `CITATION.cff`. This dataset record is distinct from the Relab software record
({meta.software_concept_doi}), which is licensed separately.
"""


def _cff_author(name: str, affiliation: str) -> list[str]:
    """Return CFF author lines for a plainly written personal name.

    Everything before the last space is treated as given names. Good enough for the handful
    of names a release is cut with; write the name differently if that ever gets it wrong.
    """
    given, _, family = name.rpartition(" ")
    if not given:
        return [f'  - name: "{name}"', f'    affiliation: "{affiliation}"']
    return [
        f'  - family-names: "{family}"',
        f'    given-names: "{given}"',
        f'    affiliation: "{affiliation}"',
    ]


def render_citation_cff(meta: ReleaseMetadata, stats: BuildStats) -> str:
    """Render the dataset CITATION.cff (distinct from the repository's software one)."""
    lines = [
        "cff-version: 1.2.0",
        'message: "If you use this dataset, please cite it as below."',
        "type: dataset",
        "authors:",
    ]
    for creator in meta.creators:
        lines += [
            f'  - family-names: "{creator.family_names}"',
            f'    given-names: "{creator.given_names}"',
            f'    orcid: "{creator.orcid}"',
            f'    affiliation: "{meta.affiliation}"',
        ]
    for name in meta.named_lab_contributors:
        lines += _cff_author(name, meta.affiliation)
    released = stats.collection_end or datetime.now(tz=UTC)
    lines += [
        f'title: "{meta.title}"',
        f'abstract: "{meta.description}"',
        f'version: "{meta.version}"',
        "identifiers:",
        "  - type: doi",
        f"    value: {meta.doi}",
        "    description: DOI for this dataset release",
        f"date-released: {released:%Y-%m-%d}",
        f"url: {meta.homepage}",
        f'license: "{meta.licence_spdx}"',
        "keywords:",
        *[f'  - "{keyword}"' for keyword in meta.keywords],
        "references:",
        "  - type: software",
        f'    title: "{meta.title} source platform"',
        "    authors:",
        *[f'      - family-names: "{c.family_names}"\n        given-names: "{c.given_names}"' for c in meta.creators],
        "    identifiers:",
        "      - type: doi",
        f"        value: {meta.software_concept_doi}",
        "",
    ]
    return "\n".join(lines)


def render_contributors(meta: ReleaseMetadata, record_counts: Mapping[str, int]) -> str:
    """Render CONTRIBUTORS.md: collective credit, plus the pseudonymous codes and counts."""
    creators = "\n".join(f"- {c.given_names} {c.family_names} ({c.orcid})" for c in meta.creators)
    codes = "\n".join(f"| `{pseudonym}` | {record_counts[pseudonym]} |" for pseudonym in sorted(record_counts))
    return f"""# Contributors

Contributors to this dataset are credited collectively, as {meta.licence_name} intends: a
reuser credits the release, not each person who worked on it. The attribution string in
`README.md` is the whole of what attribution requires.

## Dataset creators

{creators}

## Contributor codes

Every record carries the pseudonymous code of the account that authored it. The codes are
stable across releases, so records can be grouped by contributor — which is what a
contributor-level train/test split needs. No code resolves to a person in the released data.

| Code | Records |
| --- | --- |
{codes}
"""


def render_changelog(meta: ReleaseMetadata, stats: BuildStats) -> str:
    """Render CHANGELOG.md."""
    return f"""# Changelog

## v{meta.version} — {datetime.now(tz=UTC):%Y-%m-%d}

- First public release: {stats.records} lab-authored records and {stats.images} images,
  licensed under {meta.licence_name}.
- Tabular records plus an image tree, replacing the PostgreSQL dump
  (`RELab-pilot-dataset.sql.zst`) that shipped inside software release v0.2.0
  ({meta.software_version_doi}). That pilot file is superseded, not retracted.
- Reference tables (taxonomy, categories, materials, product types, units) are frozen into
  the release so record foreign keys stay resolvable.
- Owner identity replaced by stable pseudonyms; no account data is included.
"""


# Arrow type to Croissant data type. Croissant field types are derived from the Parquet
# schema rather than restated, so the declared column types and the published description
# cannot drift apart.
def _croissant_type(arrow_type: pa.DataType) -> str:
    """Return the Croissant data type for an Arrow column type."""
    if pa.types.is_boolean(arrow_type):
        return "sc:Boolean"
    if pa.types.is_integer(arrow_type):
        return "sc:Integer"
    if pa.types.is_floating(arrow_type):
        return "sc:Float"
    if pa.types.is_timestamp(arrow_type) or pa.types.is_date(arrow_type):
        return "sc:Date"
    return "sc:Text"


def _croissant_record_set(name: str, file_id: str, schema: pa.Schema) -> dict[str, Any]:
    """Describe one Parquet table as a Croissant record set."""
    return {
        "@type": "cr:RecordSet",
        "@id": name,
        "name": name,
        "field": [
            {
                "@type": "cr:Field",
                "@id": f"{name}/{field.name}",
                "name": field.name,
                "dataType": _croissant_type(field.type),
                "source": {"fileObject": {"@id": file_id}, "extract": {"column": field.name}},
            }
            for field in schema
        ],
    }


def render_croissant(meta: ReleaseMetadata, stats: BuildStats) -> str:
    """Render croissant.json (MLCommons Croissant JSON-LD)."""
    document = {
        "@context": {
            "@vocab": "https://schema.org/",
            "cr": "http://mlcommons.org/croissant/",
            "sc": "https://schema.org/",
            "data": {"@id": "cr:data", "@type": "@json"},
            "dataType": {"@id": "cr:dataType", "@type": "@vocab"},
            "field": "cr:field",
            "fileObject": "cr:fileObject",
            "fileSet": "cr:fileSet",
            "includes": "cr:includes",
            "recordSet": "cr:recordSet",
            "source": "cr:source",
        },
        "@type": "sc:Dataset",
        "conformsTo": "http://mlcommons.org/croissant/1.0",
        "name": meta.title,
        "description": meta.description,
        "version": meta.version,
        "license": meta.licence_url,
        "url": meta.homepage,
        "citeAs": meta.attribution,
        # schema.org/usageInfo is the standard slot for terms the licence field cannot
        # carry. Croissant inherits it through the schema.org vocabulary, so this is not an
        # invented field.
        "usageInfo": (
            f"Licensed under {meta.licence_name}. The licence covers the images and the data only. "
            "It grants no rights in trademarks, logos or model numbers visible in the photographs "
            "(CC BY 4.0 section 2(b)(2)); using the images to suggest brand endorsement or "
            "affiliation is a trademark question separate from this licence. The licence also does "
            "not govern personal data: the release carries no account identifiers, contributor "
            "identity appears only as a stable pseudonymous code, contributors are credited "
            "collectively rather than individually, and re-identifying contributors "
            "falls outside both the licence and the GDPR basis on which the release was published."
        ),
        "keywords": list(meta.keywords),
        "creator": [
            {"@type": "sc:Person", "name": f"{c.given_names} {c.family_names}", "sameAs": c.orcid}
            for c in meta.creators
        ],
        "identifier": f"https://doi.org/{meta.doi}",
        "isBasedOn": f"https://doi.org/{meta.software_version_doi}",
        "temporalCoverage": stats.collection_period,
        "distribution": [
            {
                "@type": "cr:FileObject",
                "@id": "records.parquet",
                "name": "records.parquet",
                "encodingFormat": PARQUET_MEDIA_TYPE,
                "contentUrl": "records.parquet",
            },
            {
                "@type": "cr:FileObject",
                "@id": "record_materials.parquet",
                "name": "record_materials.parquet",
                "encodingFormat": PARQUET_MEDIA_TYPE,
                "contentUrl": "record_materials.parquet",
            },
            {
                "@type": "cr:FileObject",
                "@id": "manifest.csv",
                "name": "manifest.csv",
                "encodingFormat": "text/csv",
                "contentUrl": "manifest.csv",
            },
            {
                "@type": "cr:FileSet",
                "@id": "images",
                "name": "images",
                "encodingFormat": "image/jpeg",
                "includes": "images/*",
            },
        ],
        "recordSet": [
            _croissant_record_set("records", "records.parquet", RECORDS_SCHEMA),
            _croissant_record_set("record_materials", "record_materials.parquet", RECORD_MATERIALS_SCHEMA),
        ],
    }
    return json.dumps(document, indent=2) + "\n"


def write_artefacts(out: Path, meta: ReleaseMetadata, stats: BuildStats, record_counts: Mapping[str, int]) -> None:
    """Write every archive artefact from the one metadata object."""
    (out / "README.md").write_text(render_readme(meta, stats), encoding="utf-8")
    (out / "CITATION.cff").write_text(render_citation_cff(meta, stats), encoding="utf-8")
    (out / "CONTRIBUTORS.md").write_text(render_contributors(meta, record_counts), encoding="utf-8")
    (out / "CHANGELOG.md").write_text(render_changelog(meta, stats), encoding="utf-8")
    (out / "croissant.json").write_text(render_croissant(meta, stats), encoding="utf-8")
    shutil.copyfile(ASSETS_DIR / "cc-by-4.0.txt", out / "LICENSE.txt")


### Checksums ###
def iter_archive_files(root: Path) -> Iterator[Path]:
    """Yield every published file under *root*, sorted, excluding review extracts."""
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if relative.parts[0] == REVIEW_DIR or relative.name == CHECKSUM_FILE:
            continue
        yield path


def file_sha256(path: Path) -> str:
    """Return the SHA-256 hex digest of *path*."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksums(root: Path) -> None:
    """Write SHA256SUMS in ``sha256sum`` format over the published files."""
    lines = [f"{file_sha256(path)}  {path.relative_to(root).as_posix()}\n" for path in iter_archive_files(root)]
    (root / CHECKSUM_FILE).write_text("".join(lines), encoding="utf-8")


def parse_checksums(text: str) -> dict[str, str]:
    """Parse ``sha256sum`` output into a ``{relative path: digest}`` mapping."""
    entries: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        digest, _, name = line.partition("  ")
        if not name:
            msg = f"Malformed checksum line: {line!r}"
            raise ValueError(msg)
        entries[name] = digest
    return entries


def checksum_violations(root: Path) -> list[str]:
    """Return one message per missing, extra or mismatched checksum entry."""
    expected = parse_checksums((root / CHECKSUM_FILE).read_text(encoding="utf-8"))
    actual = {path.relative_to(root).as_posix(): file_sha256(path) for path in iter_archive_files(root)}
    violations = [f"checksum: {name} is listed but absent" for name in expected.keys() - actual.keys()]
    violations += [f"checksum: {name} is present but unlisted" for name in actual.keys() - expected.keys()]
    violations += [
        f"checksum: {name} does not match" for name in expected.keys() & actual.keys() if expected[name] != actual[name]
    ]
    return sorted(violations)


### Verification pass ###
# Structural leaks are caught by name: no output may carry a column or JSON key that
# belongs to an account, an auth session, an OAuth link or the upload-quota ledger.
FORBIDDEN_COLUMNS: frozenset[str] = frozenset(
    {
        "access_token",
        "email",
        "hashed_password",
        "ip",
        "ip_address",
        "is_active",
        "is_superuser",
        "is_verified",
        "last_login_at",
        "mfa_confirmed_at",
        "mfa_enabled",
        "mfa_recovery_codes",
        "mfa_totp_secret",
        "oauth_accounts",
        "oauth_name",
        "owner_id",
        "password",
        "preferences",
        "profile_stats",
        "profile_stats_computed_at",
        "refresh_token",
        "upload_file_count",
        "upload_size_bytes",
        "upload_total_bytes",
        "user_id",
        "username",
    }
)

_EMAIL_RE = r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"
_IPV4_RE = r"(?<![\d.])((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])"
# Four or more colon-separated hex groups: an ISO timestamp ("12:34:56") has at most
# three, so this does not fire on every created_at column.
_IPV6_RE = r"(?<![:\w])(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}(?![:\w])"


def forbidden_column_names(header: Iterable[str]) -> list[str]:
    """Return the header names that must never appear in a published table."""
    return sorted(name for name in header if name.lower() in FORBIDDEN_COLUMNS)


def forbidden_values(text: str) -> list[str]:
    """Return email addresses and IP addresses found anywhere in *text*."""
    found = {match.group(0) for match in re.finditer(_EMAIL_RE, text)}
    found |= {match.group(0) for match in re.finditer(_IPV4_RE, text)}
    found |= {match.group(0) for match in re.finditer(_IPV6_RE, text)}
    return sorted(found)


def exif_violations(path: Path) -> list[int]:
    """Return the EXIF tag ids in *path* that are outside the preserved allowlist.

    This is the backstop for multi-frame images, which skip EXIF processing at ingest by
    design and can therefore still carry GPS coordinates and vendor MakerNote blocks.
    """
    try:
        with PILImage.open(path) as img:
            exif = img.getexif()
            tags = set(exif.keys())
            for ifd in (IFD.Exif, IFD.GPSInfo, IFD.Interop):
                # Pillow raises rather than returning empty when the sub-IFD is absent.
                with contextlib.suppress(KeyError, ValueError, OSError, TypeError):
                    tags |= set(exif.get_ifd(ifd).keys())
    except AttributeError, ValueError, OSError, TypeError:
        return []
    return sorted(tags - _PRESERVED_EXIF_TAGS)


def missing_references(rows: Iterable[dict[str, str]], column: str, allowed: set[str], label: str) -> list[str]:
    """Return one message per row whose *column* points outside *allowed*."""
    return sorted(
        {
            f"{label}: {column}={value!r} does not resolve"
            for row in rows
            if (value := _key(row.get(column))) and value not in allowed
        }
    )


def verify(root: Path) -> list[str]:
    """Run every verification check over the built directory and return the violations."""
    violations: list[str] = []

    text_suffixes = {CSV_SUFFIX, ".json", ".md", ".txt", ".cff"}
    for path in iter_archive_files(root):
        suffix = path.suffix.lower()
        if suffix in text_suffixes:
            violations += [
                f"{path.name}: leaked value {value!r}" for value in forbidden_values(path.read_text("utf-8"))
            ]
        if suffix == CSV_SUFFIX:
            header = read_csv(path)[:1]
            names = header[0].keys() if header else []
            violations += [f"{path.name}: forbidden column {name!r}" for name in forbidden_column_names(names)]
        if suffix == PARQUET_SUFFIX:
            table = pq.read_table(path)
            violations += [
                f"{path.name}: forbidden column {name!r}" for name in forbidden_column_names(table.schema.names)
            ]
            # Parquet is compressed, so scanning the file bytes would find nothing at all
            # and the leak check would pass for the wrong reason. Read the cell values.
            violations += [
                f"{path.name}: leaked value {value!r}" for value in forbidden_values(parquet_cell_text(table))
            ]

    for path in sorted((root / "images").glob("*")):
        violations += [f"{path.name}: EXIF tag 0x{tag:04X} outside the allowlist" for tag in exif_violations(path)]

    records = read_parquet(root / "records.parquet")
    manifest = read_csv(root / "manifest.csv")
    materials_used = read_parquet(root / "record_materials.parquet")
    record_ids = {_key(row["id"]) for row in records}
    image_files = {f"images/{path.name}" for path in (root / "images").glob("*")}

    violations += [f"manifest: {row['file']} is not in images/" for row in manifest if row["file"] not in image_files]
    violations += missing_references(manifest, "record_id", record_ids, "manifest")
    violations += missing_references(records, "parent_id", record_ids, "records")
    violations += missing_references(
        records, "product_type_id", _ids(root / "reference/product_types.parquet"), "records"
    )
    violations += missing_references(materials_used, "product_id", record_ids, "record_materials")
    violations += missing_references(
        materials_used, "material_id", _ids(root / "reference/materials.parquet"), "record_materials"
    )
    categories = read_parquet(root / "reference/categories.parquet")
    violations += missing_references(
        categories, "taxonomy_id", _ids(root / "reference/taxonomies.parquet"), "categories"
    )
    violations += missing_references(
        categories, "supercategory_id", _ids(root / "reference/categories.parquet"), "categories"
    )
    violations += checksum_violations(root)
    return violations


def _ids(path: Path) -> set[str]:
    """Return the ``id`` column of a reference table as a set of comparison keys."""
    return {_key(row["id"]) for row in read_parquet(path)}


def parquet_cell_text(table: pa.Table) -> str:
    """Return every non-null cell value of *table*, one per line.

    One per line so an IPv4 or IPv6 match cannot be manufactured by two adjacent cells
    running together.
    """
    return "\n".join(str(value) for column in table.columns for value in column.to_pylist() if value is not None)


### Human-review extracts (written to the build directory, excluded from the archive) ###
EXCLUSION_HEADER = ("id", "name", "owner", "rule", "detail")


def write_review_extracts(
    root: Path,
    records: Sequence[dict[str, Any]],
    manifest: Sequence[dict[str, Any]],
    exclusions: Sequence[Mapping[str, Any]] = (),
) -> None:
    """Write the extracts a human has to read before the release is published.

    The exclusion list is here rather than in the archive on purpose: a record dropped from
    a release is not part of it, but a maintainer still has to be able to see what went and
    why. A silently dropped record reads as "we never collected it".
    """
    review = root / REVIEW_DIR
    review.mkdir(parents=True, exist_ok=True)

    notes = []
    for record in records:
        notes.extend(
            f"record {record['id']}\t{field_name}\t{value}"
            for field_name in ("name", "description", "brand", "model")
            if (value := record.get(field_name))
        )
        notes.extend(
            f"record {record['id']}\tcircularity.{key}\t{value}"
            for key, value in (record.get("circularity_properties") or {}).items()
            if value
        )
    (review / "free-text-notes.tsv").write_text("".join(f"{line}\n" for line in notes), encoding="utf-8")

    rows = []
    for entry in manifest:
        reasons = provenance_flags(root / entry["file"], entry["width"], entry["height"])
        if reasons:
            rows.append((entry["file"], entry["record_id"], "; ".join(reasons)))
    write_csv(review / "provenance-candidates.csv", ("file", "record_id", "reasons"), rows)
    write_csv(
        review / "excluded-records.csv",
        EXCLUSION_HEADER,
        ([entry[name] for name in EXCLUSION_HEADER] for entry in exclusions),
    )


# Aspect ratios a hand-held or bench camera actually produces, either orientation.
_CAMERA_ASPECT_RATIOS = (4 / 3, 3 / 2, 16 / 9, 1.0)
_ASPECT_TOLERANCE = 0.02
_UNIFORM_BORDER_STDDEV = 6.0


def provenance_flags(path: Path, width: int, height: int) -> list[str]:
    """Return reasons why *path* may not be an in-house teardown photograph.

    Heuristics only, and deliberately loose: this surfaces candidates for a
    third-party-copyright read-through, it does not adjudicate any of them.
    """
    reasons = []
    ratio = max(width, height) / min(width, height) if min(width, height) else 0
    if not any(abs(ratio - candidate) <= _ASPECT_TOLERANCE for candidate in _CAMERA_ASPECT_RATIOS):
        reasons.append(f"unusual aspect ratio {ratio:.3f}")
    try:
        with PILImage.open(path) as img:
            exif = img.getexif()
            has_camera = bool(exif.get(0x010F) or exif.get(0x0110))
            border = _border_stddev(img)
    except AttributeError, ValueError, OSError, TypeError:
        return [*reasons, "unreadable image"]
    if not has_camera:
        reasons.append("no camera make/model in EXIF")
    if border is not None and border < _UNIFORM_BORDER_STDDEV:
        reasons.append(f"uniform background (border stddev {border:.1f})")
    return reasons


def _border_stddev(img: PILImage.Image) -> float | None:
    """Return the greyscale standard deviation of the image border, or None if unreadable."""
    thumb = img.convert("L").resize((64, 64))
    pixels = list(thumb.tobytes())
    border = [
        pixels[row * 64 + column] for row in range(64) for column in range(64) if row in (0, 63) or column in (0, 63)
    ]
    return statistics.pstdev(border) if border else None


### Inventory (read-only dry run) ###
INVENTORY_HEADER = (
    "username",
    "shared",
    "terms_version",
    "consenting",
    "in_scope",
    "excluded",
    "base_products",
    "components",
    "records",
    "images",
    "brand_pct",
    "model_pct",
    "description_pct",
    "component_type_pct",
    "component_mass_pct",
    "component_geometry_pct",
    "component_image_pct",
)


def _pct(count: int, total: int) -> str:
    """Return a one-decimal completeness percentage, or blank when there is nothing to divide."""
    return "" if total == 0 else f"{100 * count / total:.1f}"


def summarise_owner(
    username: str,
    terms_version: object,
    products: Sequence[dict[str, Any]],
    imaged_product_ids: set[int],
    in_scope_ids: set[int] = frozenset(),  # ty: ignore[invalid-parameter-default]
) -> dict[str, Any]:
    """Summarise one account's records: counts, what a build would take, and completeness.

    Completeness is reported over *all* the account's records, not just the releasable ones:
    aggregate counts are facts about the records rather than republication of them, so the
    paper can cite them whether or not the records themselves can be published.
    """
    base = [row for row in products if row["parent_id"] is None]
    components = [row for row in products if row["parent_id"] is not None]
    geometry = ("height_cm", "width_cm", "depth_cm")
    in_scope = sum(1 for row in products if row["id"] in in_scope_ids)
    return {
        "username": username,
        "shared": "yes" if username in SHARED_ACCOUNTS else "no",
        "terms_version": "" if terms_version is None else terms_version,
        "consenting": "yes" if has_release_consent(terms_version) else "no",
        "in_scope": in_scope,
        "excluded": len(products) - in_scope,
        "base_products": len(base),
        "components": len(components),
        "records": len(products),
        "images": sum(1 for row in products if row["id"] in imaged_product_ids),
        "brand_pct": _pct(sum(1 for row in base if row["brand"]), len(base)),
        "model_pct": _pct(sum(1 for row in base if row["model"]), len(base)),
        "description_pct": _pct(sum(1 for row in base if row["description"]), len(base)),
        "component_type_pct": _pct(sum(1 for row in components if row["product_type_id"] is not None), len(components)),
        "component_mass_pct": _pct(sum(1 for row in components if row["weight_g"] is not None), len(components)),
        "component_geometry_pct": _pct(
            sum(1 for row in components if all(row[name] is not None for name in geometry)), len(components)
        ),
        "component_image_pct": _pct(sum(1 for row in components if row["id"] in imaged_product_ids), len(components)),
    }


def render_inventory_csv(rows: Sequence[dict[str, Any]]) -> str:
    """Render inventory rows as CSV text, so one command feeds both scoping and the paper."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=INVENTORY_HEADER, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


async def collect_inventory(session: AsyncSession, rules: SelectionRules) -> list[dict[str, Any]]:
    """Return one summary row per account holding records, sorted by username.

    Every account is reported, not only the ones a build would select: the point is to show
    what is being left out as well as what is going in. The same ``select_records`` a build
    uses decides the in-scope counts, so the report cannot disagree with the build.
    """
    # NOTE: aggregates in Python over every product row. n is a few thousand; push the
    # counting into SQL if this dataset ever outgrows a single process.
    columns = (
        Product.id,
        Product.owner_id,
        Product.parent_id,
        Product.name,
        Product.brand,
        Product.model,
        Product.description,
        Product.product_type_id,
        Product.weight_g,
        Product.height_cm,
        Product.width_cm,
        Product.depth_cm,
    )
    products: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in (await session.execute(select(*columns))).all():
        values = dict(row._mapping)  # noqa: SLF001  # documented SQLAlchemy Row accessor
        # Group by owner without removing the key: select_records reads owner_id off each
        # record to apply the consent and owner-exclusion rules.
        products[values["owner_id"]].append(values)

    imaged_product_ids = {
        parent_id
        for (parent_id,) in (
            await session.execute(
                select(Image.parent_id).where(Image.parent_type == MediaParentType.PRODUCT).distinct()
            )
        ).all()
    }

    owners = await load_owners(session)
    selected, exclusions = select_records(
        [record for owner_records in products.values() for record in owner_records], owners, rules
    )
    log_exclusion_tally(exclusions)
    in_scope_ids = {record["id"] for record in selected}
    rows = [
        summarise_owner(
            owner["username"] or f"<no username: {user_id}>",
            owner["terms_version"],
            products[user_id],
            imaged_product_ids,
            in_scope_ids,
        )
        for user_id, owner in owners.items()
        if products[user_id]
    ]
    rows.sort(key=lambda row: row["username"])
    return [*rows, _inventory_total(rows)]


def _inventory_total(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Return the TOTAL row: counts summed, percentages recomputed over the pooled rows."""
    counted = ("in_scope", "excluded", "base_products", "components", "records", "images")
    total = {"username": "TOTAL", "shared": "", "terms_version": "", "consenting": ""} | {
        name: sum(row[name] for row in rows) for name in counted
    }
    for name in INVENTORY_HEADER:
        if name.endswith("_pct"):
            base = "components" if name.startswith("component_") else "base_products"
            weighted = sum(float(row[name]) * row[base] for row in rows if row[name] != "")
            total[name] = _pct(0, 0) if total[base] == 0 else f"{weighted / total[base]:.1f}"
    return total


async def _read_inventory(rules: SelectionRules) -> list[dict[str, Any]]:
    """Open a session, collect the inventory, and always dispose the engine."""
    try:
        async with async_session_context() as session:
            return await collect_inventory(session, rules)
    finally:
        await close_async_engine()


def inventory(destination: Path | None, rules: SelectionRules = SelectionRules()) -> None:  # noqa: B008
    """Report what a release would contain and exit without writing an archive.

    Read-only by construction: it needs no pseudonymisation salt, takes no owner selection,
    and writes nothing but the summary it is asked for.
    """
    report = render_inventory_csv(asyncio.run(_read_inventory(rules)))
    if destination is None:
        sys.stdout.write(report)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(report, encoding="utf-8")
    logger.info("Wrote inventory to %s.", destination)


### Build ###
async def build(out: Path, rules: SelectionRules, salt: str, meta: ReleaseMetadata) -> None:
    """Build the release directory, then verify it."""
    reject_shared_accounts(rules.owner_usernames)
    out.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    try:
        await _build(out, rules, salt, meta)
    finally:
        await close_async_engine()


async def _build(out: Path, rules: SelectionRules, salt: str, meta: ReleaseMetadata) -> None:
    """Export, render and verify; ``build`` owns the engine lifecycle around it."""
    async with async_session_context() as session:
        owners = await load_owners(session)
        check_owner_selection(rules, owners)
        selected, exclusions = select_records(await load_records(session), owners, rules)
        records = pseudonymise_owners(selected, salt)
        record_ids = {row["id"] for row in records}
        record_materials = await export_record_materials(session, record_ids)
        manifest = await export_images(session, record_ids, out / "images")
        await export_reference_data(session, out / "reference")

    log_exclusion_tally(exclusions)
    if not records:
        msg = "Every record was excluded; nothing to publish. Run --inventory to see why."
        raise SystemExit(msg)

    write_parquet(out / "records.parquet", RECORDS_SCHEMA, records)
    write_parquet(out / "record_materials.parquet", RECORD_MATERIALS_SCHEMA, record_materials)
    write_csv(out / "manifest.csv", MANIFEST_HEADER, ([row[name] for name in MANIFEST_HEADER] for row in manifest))

    created = [row["created_at"] for row in records if row["created_at"]]
    stats = BuildStats(
        records=len(records),
        images=len(manifest),
        owners=len({row["owner_pseudonym"] for row in records}),
        collection_start=min(created, default=None),
        collection_end=max(created, default=None),
    )
    write_artefacts(out, meta, stats, Counter(row["owner_pseudonym"] for row in records))
    write_review_extracts(out, records, manifest, exclusions)
    write_checksums(out)

    violations = verify(out)
    if violations:
        for violation in violations:
            logger.error("VERIFICATION FAILURE — %s", violation)
        msg = f"{len(violations)} verification failure(s); the release is not publishable."
        raise SystemExit(msg)

    logger.info("Built %d records and %d images in %s.", stats.records, stats.images, out)
    logger.info("Read %s/%s before publishing; it is excluded from the archive.", out, REVIEW_DIR)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--owner",
        action="append",
        metavar="USERNAME",
        help=(
            "narrow the release to these accounts, within the consenting set; repeat for several. "
            "Omitted, every account that accepted the contributor terms is in scope."
        ),
    )
    parser.add_argument(
        "--exclude-owner", action="append", metavar="USERNAME", default=None, help="drop this account's records"
    )
    parser.add_argument(
        "--exclude-product",
        action="append",
        type=int,
        metavar="ID",
        default=None,
        help="drop this product and everything under it",
    )
    parser.add_argument(
        "--exclude-name-word",
        action="append",
        metavar="WORD",
        default=None,
        help=(
            "also drop records whose name starts or ends with this word; repeat for several. "
            f"Defaults: {', '.join(sorted(DEFAULT_EXCLUDED_NAME_WORDS))}"
        ),
    )
    parser.add_argument("--no-name-filter", action="store_true", help="keep records whose names look like scratch work")
    parser.add_argument(
        "--inventory",
        action="store_true",
        help="report what a release would contain, for every account, and exit without writing one",
    )
    parser.add_argument(
        "--inventory-out",
        type=Path,
        default=None,
        metavar="PATH",
        help="write the --inventory report here instead of to stdout",
    )
    parser.add_argument("--out", type=Path, default=Path("dist/dataset-release"), help="output directory")
    parser.add_argument(
        "--credit",
        action="append",
        metavar="NAME",
        default=None,
        help=(
            "name a lab contributor in the dataset CITATION.cff; repeat for several. Editorial, "
            f"decided per release; replaces the default ({', '.join(ReleaseMetadata.named_lab_contributors)}). "
            'Pass --credit "" to name nobody.'
        ),
    )
    parser.add_argument("--version", default=ReleaseMetadata.version, help="dataset version")
    parser.add_argument("--doi", default=ReleaseMetadata.doi, help="DOI once the Zenodo record exists")
    parser.add_argument(
        "--pseudonym-salt",
        default=None,
        help="salt for owner pseudonyms; defaults to secrets/<env>/dataset_pseudonym_salt",
    )
    return parser.parse_args(argv)


def selection_rules(args: argparse.Namespace) -> SelectionRules:
    """Build the selection rules from parsed arguments."""
    words = (
        frozenset() if args.no_name_filter else DEFAULT_EXCLUDED_NAME_WORDS | frozenset(args.exclude_name_word or ())
    )
    return SelectionRules(
        owner_usernames=frozenset(args.owner or ()),
        excluded_owner_usernames=frozenset(args.exclude_owner or ()),
        excluded_product_ids=frozenset(args.exclude_product or ()),
        excluded_name_words=words,
    )


def main() -> None:
    """Build a dataset release from the command line."""
    args = parse_args()
    rules = selection_rules(args)
    if args.inventory:
        # No salt and no owner requirement: this path reads and reports, it never publishes.
        inventory(args.inventory_out, rules)
        return
    meta = ReleaseMetadata(version=args.version, doi=args.doi)
    if args.credit is not None:
        meta = replace(meta, named_lab_contributors=tuple(name for name in args.credit if name))
    salt = read_pseudonym_salt(args.pseudonym_salt)
    meta = replace(meta, pseudonym_salt_fingerprint=check_salt_fingerprint(salt))
    asyncio.run(build(args.out, rules, salt, meta))


if __name__ == "__main__":
    main()
