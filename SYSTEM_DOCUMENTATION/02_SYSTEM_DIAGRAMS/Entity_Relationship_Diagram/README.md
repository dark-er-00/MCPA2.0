# Entity relationship diagram scope

Four views cover all 23 documented application entities, including the two core entities with incomplete base DDL. Solid connectors represent declared foreign keys; dashed core associations do not claim physical FK constraints. Parent-to-child connectors use 1/many endpoint symbols; nullable child fields are labeled. Unique-FK exceptions (Auth linkage, development profile and invitation profile) are described in boxes/catalog and are at most one, rather than many.

The exact complete FK/DDL catalog is in ../../03_TECHNICAL_DOCUMENTATION/Schema_Catalog.md. Some repeated actor/profile FKs are listed inside entity boxes to avoid crossings. JSON record references and Storage paths are not drawn as physical FKs. Managed auth.users is context only; managed Storage schema is not reproduced. Production schema and original equipment PK/FKs/status enum NEEDS VERIFICATION.
