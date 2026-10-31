# Admin - Global Search / Authorized Record Discovery

- This shared utility is included separately so implemented search behavior is not omitted.
- Search indexes explicit authorized display fields. It does not search users, raw SQL, hidden fields or invented saved reports.
- Engineer/Architect equipment is read through the personal-equipment RPC; failed personal read never falls back to a broader catalog.
- Admin additionally indexes Purchases, Materials and the three real Reports views.

## Source evidence

- [js/global-search.js:9](../../../../../js/global-search.js#L9): Role-aware display-field index and exact record routes
- [js/global-search.js:64](../../../../../js/global-search.js#L64): Parallel existing repositories and no broad fallback for failed personal read
- [js/global-search.js:127](../../../../../js/global-search.js#L127): Debounced search, partial errors, result selection and retry
- [js/navigation.js:109](../../../../../js/navigation.js#L109): Navigation authorization and exact-record activation
