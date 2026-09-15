# Matriz de permisos Hasel (HAS-28 / HAS-25 / HAS-27)

Fuente única: `src/config/capabilities.ts` + seeds en `aox-dev-sql` (`capability` / `role_capability_default`).
Overrides por org × rol en `org_role_capability`. **No** hay override por `membership_id` en v1.

Roles base (no se borran): Admin=1, Profesional=2, Recepcionista=3.

## Decisiones conscious

1. **Sucursales:** recepción **ve** (`locations.view`) y **no edita** (`locations.manage` OFF). Se alinea la API (POST/PUT/DELETE y cierres) con la UI que ya era solo Admin. Admin puede activar manage si quiere que recepción edite sucursales.
2. **Servicios y especialidades:** recepción **ve**, no gestiona. Igual que la UI actual.
3. **Personal:** recepción **ve y gestiona** (la página no tenía modo solo lectura).
4. **Clientes:** recepción crea y edita. Profesional solo ve los suyos y puede exportar su listado. Profesional **no** crea ni edita (403).
5. **Cobros / agenda / horarios:** recepción gestiona. Profesional agenda propia; horarios solo lectura.
6. **Plan, perfil público, complementos (tienda), workspace:** solo Admin.
7. **Addons clínicos** (`addons.odontogram`, `addons.body_map`): ON para los 3 roles, pero el grant efectivo exige el complemento contratado por la org.
8. **`permissions.manage`:** siempre ON y locked para Admin (no se puede auto-bloquear).
9. Cierres de sucursal van con `locations.manage` (no hay capability aparte en v1).

## Defaults (sin override de org)

| Capability | Admin | Recepcionista | Profesional |
| --- | --- | --- | --- |
| dashboard.view | ✓ | ✓ | ✓ |
| calendar.view / calendar.manage | ✓ | ✓ | ✓ |
| customers.view | ✓ | ✓ | ✓ (onlyMe) |
| customers.create / customers.edit | ✓ | ✓ | ✗ |
| customers.export | ✓ | ✓ | ✓ |
| cobros.view / cobros.manage | ✓ | ✓ | ✗ |
| services.view | ✓ | ✓ | ✓ |
| services.manage | ✓ | ✗ | ✗ |
| locations.view | ✓ | ✓ | ✗ |
| locations.manage | ✓ | ✗ | ✗ |
| public_profile.manage | ✓ | ✗ | ✗ |
| addons.view / addons.manage | ✓ | ✗ | ✗ |
| addons.odontogram / addons.body_map | ✓ | ✓ | ✓ |
| specialties.view | ✓ | ✓ | ✗ |
| specialties.manage | ✓ | ✗ | ✗ |
| professionals.view / professionals.manage | ✓ | ✓ | ✗ |
| schedules.view | ✓ | ✓ | ✓ |
| schedules.manage | ✓ | ✓ | ✗ |
| ajustes.view | ✓ | ✓ | ✓ |
| workspace.manage | ✓ | ✗ | ✗ |
| plan.view / plan.manage | ✓ | ✗ | ✗ |
| permissions.manage | ✓ (locked) | ✗ | ✗ |

## APIs

- `GET /api/v1/permissions/me` — capabilities efectivas del JWT (org × rol + defaults + entitlements).
- `GET /api/v1/permissions/matrix` — catálogo + grants (solo `permissions.manage`).
- `PUT /api/v1/permissions/matrix` — body `{ grants: [{ role_id, code, granted }] }`.
- `POST /api/v1/permissions/reset` — borra overrides de la org.

En el BFF: `GET/PUT /api/permissions/matrix` y `POST` para reset. Tras guardar hay que **recargar** para ver menú y 403 reales.

## QA (HAS-32)

Orgs sin overrides se comportan como staging actual:

- Recepcionista entra a Sucursales en solo lectura; POST `/api/locations` → 403.
- Recepcionista crea cliente; Profesional POST `/api/customers` → 403.
- Profesional no ve Cobros ni Plan.
- Admin en Ajustes → Permisos puede apagar `customers.create` a recepción; tras refresh, menú/botón y API 403.
