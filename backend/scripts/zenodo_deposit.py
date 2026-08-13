"""Deposit a built dataset release to Zenodo as a DRAFT.

Publication is irreversible: a published Zenodo record cannot be withdrawn, only
tombstoned, and its files can never be changed. So this script creates or versions a
*draft* deposit and stops there. Publishing is a second, explicit invocation with
``--publish``, and it prompts before it sends anything.

The token is read the way the rest of the backend reads secrets: from
``secrets/<ENVIRONMENT>/zenodo_token`` (or ``/run/secrets`` in a container), with
``ZENODO_TOKEN`` as an override for a one-off run. It needs the
``deposit:write`` scope, plus ``deposit:actions`` to publish.

Typical run, after ``just release-build``::

    uv run python -m scripts.zenodo_deposit --dir dist/dataset-v1.0
    # inspect the draft in the Zenodo web UI, then:
    uv run python -m scripts.zenodo_deposit --dir dist/dataset-v1.0 --deposition 1234567 --publish
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from app.core.env import get_secrets_dir
from app.core.logging import setup_logging
from scripts.build_dataset_release import REVIEW_DIR, ReleaseMetadata, iter_archive_files

if TYPE_CHECKING:
    from collections.abc import Sequence

setup_logging()
logger = logging.getLogger(__name__)

ZENODO_API = "https://zenodo.org/api"
ZENODO_SANDBOX_API = "https://sandbox.zenodo.org/api"
TIMEOUT = httpx.Timeout(30.0, read=600.0, write=600.0)


def read_token(sandbox: bool) -> str:  # noqa: FBT001  # single flag, mirrors the CLI switch
    """Return the Zenodo API token from the environment or the repo secrets convention."""
    if token := os.environ.get("ZENODO_TOKEN"):
        return token
    secrets_dir = get_secrets_dir()
    name = "zenodo_sandbox_token" if sandbox else "zenodo_token"
    token_file = secrets_dir / name if secrets_dir else None
    if token_file and token_file.is_file() and (token := token_file.read_text(encoding="utf-8").strip()):
        return token
    msg = f"No Zenodo token. Set ZENODO_TOKEN or write one to secrets/<env>/{name}."
    raise SystemExit(msg)


def build_metadata(meta: ReleaseMetadata) -> dict[str, Any]:
    """Return the Zenodo deposition metadata for *meta*."""
    return {
        "title": f"{meta.title} v{meta.version}",
        "upload_type": "dataset",
        "description": meta.description,
        "creators": [
            {
                "name": f"{creator.family_names}, {creator.given_names}",
                "affiliation": meta.affiliation,
                "orcid": creator.orcid.rsplit("/", 1)[-1],
            }
            for creator in meta.creators
        ],
        "license": "cc-by-4.0",
        "access_right": "open",
        "version": meta.version,
        "keywords": list(meta.keywords),
        "related_identifiers": [
            {
                # isDerivedFrom is a provenance claim, so it pins the version DOI: it names the
                # release whose pilot dump this dataset supersedes, not the software in general.
                "identifier": meta.software_version_doi,
                "relation": "isDerivedFrom",
                "resource_type": "software",
                "scheme": "doi",
            }
        ],
    }


def release_files(directory: Path) -> list[Path]:
    """Return the files to upload: the published archive, never the review extracts."""
    files = [*iter_archive_files(directory), directory / "SHA256SUMS"]
    missing = [path for path in files if not path.is_file()]
    if missing:
        msg = f"Missing release files: {', '.join(str(path) for path in missing)}"
        raise SystemExit(msg)
    if (directory / REVIEW_DIR).exists():
        logger.info("Excluding %s/ from the upload; it is for human review only.", REVIEW_DIR)
    return files


def create_deposition(client: httpx.Client, base: str, parent: int | None) -> dict[str, Any]:
    """Create a fresh draft, or a new version draft of an existing published record."""
    if parent is None:
        response = client.post(f"{base}/deposit/depositions", json={})
    else:
        response = client.post(f"{base}/deposit/depositions/{parent}/actions/newversion")
        response.raise_for_status()
        draft_url = response.json()["links"]["latest_draft"]
        response = client.get(draft_url)
    response.raise_for_status()
    return response.json()


def upload_files(client: httpx.Client, bucket_url: str, directory: Path, files: Sequence[Path]) -> None:
    """Upload each file to the deposition bucket under its path relative to *directory*."""
    for path in files:
        name = path.relative_to(directory).as_posix()
        with path.open("rb") as handle:
            response = client.put(f"{bucket_url}/{name}", content=handle)
        response.raise_for_status()
        logger.info("Uploaded %s", name)


def deposit(directory: Path, meta: ReleaseMetadata, *, sandbox: bool, parent: int | None) -> dict[str, Any]:
    """Create a draft deposition, upload the release and set its metadata. Never publishes."""
    base = ZENODO_SANDBOX_API if sandbox else ZENODO_API
    files = release_files(directory)
    headers = {"Authorization": f"Bearer {read_token(sandbox)}"}
    with httpx.Client(headers=headers, timeout=TIMEOUT) as client:
        deposition = create_deposition(client, base, parent)
        deposition_id = deposition["id"]
        upload_files(client, deposition["links"]["bucket"], directory, files)
        response = client.put(
            f"{base}/deposit/depositions/{deposition_id}",
            json={"metadata": build_metadata(meta)},
        )
        response.raise_for_status()
    logger.info(
        "Draft %s ready at %s. Review it, then publish with --publish.", deposition_id, deposition["links"]["html"]
    )
    return response.json()


def publish(deposition_id: int, *, sandbox: bool) -> dict[str, Any]:
    """Publish an existing draft after an interactive confirmation. Irreversible."""
    base = ZENODO_SANDBOX_API if sandbox else ZENODO_API
    prompt = f"Publish Zenodo deposition {deposition_id}? This cannot be undone. Type the id to confirm: "
    if input(prompt).strip() != str(deposition_id):
        msg = "Aborted; nothing was published."
        raise SystemExit(msg)
    headers = {"Authorization": f"Bearer {read_token(sandbox)}"}
    with httpx.Client(headers=headers, timeout=TIMEOUT) as client:
        response = client.post(f"{base}/deposit/depositions/{deposition_id}/actions/publish")
        response.raise_for_status()
    record = response.json()
    logger.info("Published: %s", record.get("doi_url") or record.get("doi"))
    return record


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", type=Path, help="built release directory (required unless --publish)")
    parser.add_argument("--version", default=ReleaseMetadata.version, help="dataset version")
    parser.add_argument("--doi", default=ReleaseMetadata.doi, help="DOI once the record exists")
    parser.add_argument("--parent", type=int, default=None, help="published record id to add a new version to")
    parser.add_argument("--deposition", type=int, default=None, help="draft id to publish with --publish")
    parser.add_argument("--sandbox", action="store_true", help="use sandbox.zenodo.org instead of the real archive")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="publish an existing draft. Irreversible, and never implied by a plain deposit run.",
    )
    return parser.parse_args(argv)


def main() -> None:
    """Deposit or publish from the command line."""
    args = parse_args()
    if args.publish:
        if args.deposition is None:
            msg = "--publish needs --deposition <draft id>."
            raise SystemExit(msg)
        publish(args.deposition, sandbox=args.sandbox)
        return
    if args.dir is None:
        msg = "--dir is required."
        raise SystemExit(msg)
    meta = ReleaseMetadata(version=args.version, doi=args.doi)
    deposit(args.dir, meta, sandbox=args.sandbox, parent=args.parent)


if __name__ == "__main__":
    main()
