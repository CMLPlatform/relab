"""Version of the contributor terms of service that accounts accept at signup.

Bump this whenever the terms text changes materially. The text itself lives in
``www/src/copy/terms-content.ts`` — the two are kept in step by hand, so a revision
there is only half the change until this number moves with it.

Monotonically increasing, because that is the question the release tooling asks:
"which records belong to owners who accepted version >= N".
"""

CURRENT_TERMS_VERSION = 1
