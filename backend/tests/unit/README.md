# Unit Tests

Use this tier for isolated fast tests only.

- No Docker or database startup
- No real app lifespan unless the behavior is fully mocked and still isolated
- Prefer local stubs, parametrization, and function-based tests
- Prefer small behavior-focused files over domain-sized catch-all modules
- Patch the owning module seam directly
  - example: patch `product_commands` or `product_tree_queries`, not a broad legacy facade
- Keep helper modules private and local to one test area when possible; avoid recreating package-level test registries
