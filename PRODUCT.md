# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Admin / Sir / Secretary: manages system configuration, masterlists, procurement receipts, and bulk consumables.
- Engineers and Architects: field users who request tools, coordinate site-to-site transfers, and complete mandatory tool testing.
- Tool Handlers (Ma'am): monitor day-to-day tool movements and physical inventory.

Users work across active construction sites in Manila, where tools frequently move directly between sites instead of returning to a central office.

## Product Purpose

MCPA (Material & Construction Property Allocation) is BuildRight Corp.'s role-controlled inventory and asset-management system for construction operations. It replaces vulnerable spreadsheets and verbal hand-offs with traceable movements, accurate site-level inventory, and individual accountability. Success means BuildRight can explain where each asset went, who holds it, what condition it is in, and why inventory changed.

## Positioning

MCPA is built around an **INPUT FIRST -> OUT SECOND** operating rule: custody and stock movements must be recorded before assets leave. Its combination of construction-specific movement controls, image-supported tracking, audit trails, and role boundaries is designed for multi-site engineering logistics rather than generic inventory recordkeeping.

## Operating Context

- Construction sites are distributed across Manila, including Casa Buena, San Gabriel, and Metropolis.
- Assets may move from one site directly to another without passing through a central office.
- The system must prevent unexplained inventory shrinkage, such as a stock of 20 grinders falling to 6 without a trace.
- Weekly monitoring reports are required every Monday at 4:00 PM.
- Engineers use the product in field conditions on mobile phones and tablets as well as desktop devices.

## Capabilities and Constraints

- Supabase provides the database and backend operations.
- Preserve role-controlled workflows for Admin, Engineer/Architect, and Tool Handler responsibilities.
- Maintain complete audit histories for check-in, check-out, site-to-site direct transfer, pull-out, and return activities.
- Preserve the accountability chain: an active holder must pull out or return an asset before a new engineer can request it.
- Support these lifecycle states: Available, In Use, Borrowed, Transferred, For Return, For Repair, Repaired, Lost/Missing, Disposed, and Sold.
- Track bulk consumables such as cutting discs, drill bits, and pipes, including pipe length and color where applicable.
- Track scaffolding by set.
- Provide site-level automated tallies and suppress zero-quantity items in operational views.
- Support image attachments as evidence in asset tracking workflows.
- The current repository is a plain HTML, CSS, and JavaScript web application backed in part by Supabase. Existing documentation states that the prototype login and acting roles are not yet authenticated security boundaries; production requires real authentication and server-side role enforcement.

## Brand Commitments

- Product name: MCPA, meaning Material & Construction Property Allocation.
- Organization: BuildRight Corp., operating in Manila, Philippines.
- Primary interface palette: white, black, and gold.
- Default presentation: bright, clean, and professional.
- An optional night/dark mode must remain available.

## Evidence on Hand

- The repository contains working Admin and Engineer portal prototypes, including inventory, sites, consumables, requests, transfers, returns, repairs, missing assets, reports, activity, users, and settings modules.
- Supabase setup scripts and module documentation exist for Sites, Consumables, and movement workflows.
- Browser and database test suites exist for core movement, site, and consumable behavior.
- Current sample site, user, and asset records are prototype/demo content unless backed by live Supabase data; future work must not present them as verified operational evidence.
- No confirmed testimonials, performance benchmarks, customer claims, or production-security claims are available and must not be fabricated.

## Product Principles

1. Record before release: no asset leaves without a traceable input and accountable hand-off.
2. Preserve the custody chain: every movement must retain holder, site, condition, and historical context.
3. Fit construction reality: support direct site-to-site logistics, bulk materials, sets, damage, loss, repair, and recovery.
4. Make discrepancies visible early through accurate tallies, audit logs, and scheduled monitoring.
5. Keep field work fast while enforcing the controls that protect inventory integrity.

## Accessibility & Inclusion

- Prioritize fast loading and efficient operation on mobile phones and tablets used at active job sites.
- Maintain a bright default interface and an optional dark mode for changing field conditions.
- Controls and critical status information must remain legible and usable across supported screen sizes.
