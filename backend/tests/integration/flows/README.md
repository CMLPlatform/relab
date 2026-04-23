Flow tests cover a small number of multi-step scenarios that cross feature boundaries.

Use this tier only when a single test needs to prove an end-to-end journey such as authenticate -> mutate -> fetch, or camera setup -> record -> persist.

Keep these tests sparse and slower than the unit and API tiers on purpose.
