---
name: Data model overview
description: Key schema decisions, live data, and patterns for Seelze property management
---

## Key schema decisions

- `unitType` on units table: `residential` | `garage` | `parking` (default residential)
  - Belegungsrate and all occupancy counts filter unitType = 'residential' only
- `category` on rent_payments: `rent` | `utility` | `maintenance` | `management` | `insurance` | `tax` | `other`
- Banking: ALL transactions imported (not just amount > 0); auto-match only on positive amounts
- Banking is outside OpenAPI spec — routes in banking.ts only
- Meters: two tables `meters` (propertyId + optional unitId) and `meter_readings`
  - distributionKey: direct | person | area | equal
  - meterType: electricity | gas | water_cold | water_hot | heat | other

## Gesamtmietvertrag pattern (Seelze)

- Contract 1: Stadt Seelze, 5000€/month, covers all 7 units conceptually
- Contracts 4-9: Stadt Seelze, 0€, link units 2-7 for tenant view only
- Dashboard Monatsmiete = 5100€ (5000 + 50 Garage 1 + 50 Garage 2)

## No codegen script

- lib/api-zod/src/generated/api.ts and lib/api-client-react/src/generated/ are edited by hand
- When adding new endpoints, manually add Zod schemas to api-zod and React Query hooks to api-client-react

## Seelze meters (25 total)

- 4 property-level: Kaltwasser (person), Gas (area), Strom Wärmepumpe (area), Allgemeinstrom (equal)
- 21 unit-level: Strom + Wärmemenge + Warmwasser per unit × 7 apartments (direct)
