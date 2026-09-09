"""Cross-context use cases.

A bounded context owns its own data and may depend on the shared contexts beneath it,
but a use case that spans several of them belongs above all of them rather than inside
whichever context happens to own its entry point. Erasing an account touches products,
media, cameras and quota; a public profile joins an account to its contribution stats.
Putting either inside `auth` made `auth` depend on the contexts that depend on it.

This layer may import any context. Nothing in a context may import this layer;
`tests/unit/test_context_boundaries.py` enforces both directions.
"""
