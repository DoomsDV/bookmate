# Plan de pruebas: cobros, seña y reembolso

Guía para probar a mano el flujo de seña SIPAP, comprobante, mensajes y reembolso.

Las reglas de monto, plazos y transiciones las calcula Oracle. Este plan recorre lo que el frontend espera ver. Anotá el resultado real si no coincide.

---

## Cómo usar este plan

1. Trabajá en **staging** (o local apuntando a DEV), no en producción.
2. Usá **dos sesiones**: cliente (incógnito, perfil público) y comercio (`/panel`).
3. Para cada caso, creá **una reserva nueva**. No reutilices turnos ya jugados.
4. Agendá turnos **a más de 24 h** salvo los casos que pidan “dentro de 24 h”.
5. En cada caso, tildá lo que pasó y anotá inbox, WhatsApp, badge de Cobros y estado en `/r/{token}`.

### Precondiciones

- El plan de la org tiene `DEPOSIT_COLLECTION`.
- En **Ajustes → Pagos**: señas ON, datos SIPAP (banco, titular, CI/RUC, alias) y una política.
- El servicio de prueba tiene **seña** (porcentaje o monto fijo) y un precio conocido.
- Tenés un celular/email de prueba para el cliente y un alias SIPAP válido (CI, celular PY, RUC o email).
- El inbox del comercio está a la vista (campanita).

### Superficies a mirar siempre

| Dónde | Qué mirar |
|---|---|
| Reserva pública `/r/{token}` | Estado del turno, seña, alias, disputa, textos de cancelación |
| Panel **Cobros** (`/panel/cobros`) | Chip (`ui_status`), monto, acciones, badge del menú |
| Calendario → cita | Label de seña, hint, link “Gestionar reembolso / Ver cobro” |
| Inbox comercio | Notificación `PAYMENT` (y a veces `APPOINTMENT`) |
| WhatsApp / mail del cliente | Si llega algo al confirmar, rechazar, cancelar o marcar enviado |

---

## Mapa rápido (para saber qué estás probando)

```
Cliente reserva con seña
        ↓
Hold PENDING + countdown + datos SIPAP + referencia de pago
        ↓
Sube comprobante (OCR)
        ├─ MATCH  → turno confirmado (a veces sin pasar por Cobros)
        └─ revisión / mismatch → comercio aprueba o rechaza en Cobros
        ↓
Seña PAID / PAID_TRANSFER
        ↓
Cancelación
        ├─ Cliente: Oracle arma refund_preview (política + 24 h)
        └─ Comercio: si la seña está paga, el modal pide “Cancelar y reembolsar”
        ↓
AWAITING_ALIAS → (alias) → PENDING → (marcar enviado) → SENT
        ↓
Disputa opcional (48 h hábiles + prueba + confirmar / insistir)
```

### Políticas (lo que promete la UI)

| Código | Si cancela el cliente ≥ 24 h antes | Si cancela el cliente < 24 h |
|---|---|---|
| **FLEXIBLE** | 100 % de la seña | 0 % (`WITHIN_24H`) |
| **MODERATE** | 50 % de la seña | 0 % (`WITHIN_24H`) |
| **STRICT** | 0 % siempre (`POLICY_STRICT`) | 0 % |

La política se **congela** en la reserva (`policy_code_snapshot`). Cambiarla después en Ajustes no debería cambiar reservas ya hechas.

### Quién cancela cambia el juego

- **Cliente** en `/r/{token}`: usa `refund_preview` (política + horario).
- **Comercio** en el calendario, con seña **pagada**: el modal dice que hay que devolver el dinero y pedir alias. Eso es independiente de Flexible/Moderada/Estricta en el texto del modal. **Anotá el monto real** que crea Oracle: ¿siempre 100 % o respeta la política?

### Estados que vas a ver

**Pago:** `PENDING` → `PAID` / `PAID_TRANSFER` (o `EXPIRED` si se vence el hold).

**Reembolso (reserva):** `AWAITING_ALIAS` → `PENDING` → `SENT`. También `NOT_APPLICABLE` (sin devolución) y `WAIVED` (el comercio renunció).

**Cobros (chip):** `pending` · `approved` · `rejected` · `refund_awaiting_alias` · `refund_pending` · `refund_sent` · `refund_dispute` · `refund_waived` · `expired`.

---

## Notas de revisión (qué está sólido y qué vigilar)

### Sólido

- El camino seña → comprobante → Cobros → cancelar → alias → marcar enviado → disputa está cableado de punta a punta (reserva pública, Cobros, calendario).
- El cliente no puede mandar un alias inválido desde la UI: el botón queda deshabilitado hasta que `parseSipapAlias` lo acepte.
- Cobros solo deja **aprobar/rechazar** en `pending`, **marcar enviado** en `refund_pending`, y **renunciar** en `refund_pending` o `refund_awaiting_alias` (motivo ≥ 5 caracteres).
- La disputa no liquida por OCR: subir la prueba deja el caso en revisión; liquida el cliente (“Confirmé que recibí”) u Operaciones Hasel.
- El hold se congela al subir el comprobante y solo vuelve si el comercio rechaza.

### Cosas a vigilar mientras probás

1. **Cancelación del comercio vs política.** El modal siempre habla de devolver. Confirmá si Oracle crea reembolso en Estricta o dentro de 24 h cuando cancela el comercio.
2. **Límite de 24 h.** La UI dice “hasta 24 hs antes”. Probá 25 h, 24 h en punto y 23 h. Anotá el monto.
3. **Moderada al 50 %.** El texto de “sin reembolso” no tiene un motivo propio para el 50 %; solo para 0 %. El monto del modal tiene que ser la mitad.
4. **Mensajes.** Los crea Oracle (`ntype: PAYMENT`). El front solo los muestra. Anotá título, cuerpo y si llega push/WhatsApp.
5. **Turno `CONFIRMADO` con pago todavía `PENDING`.** El reconciliado del comprobante puede mostrar “confirmado” si el estado del turno se adelanta al pago. Si lo ves, anotalo.
6. **Marcar enviado sin alias.** En Cobros no aparece “marcar enviado” mientras el chip sea `Esperando alias`. Es intencional: no hay destino SIPAP.
7. **Strikes.** Si una disputa vence sin prueba, debería sumar 1 de 3 en Ajustes → Pagos. Al 3.er strike se suspenden las señas.

---

## Matriz rápida de políticas (llenala al probar)

Usá el mismo servicio/monto de seña (anotá el valor: `_______ Gs`).

| # | Política | Quién cancela | Horas hasta el turno | Monto esperado | Monto real | Estado reembolso |
|---|---|---|---|---|---|---|
| P1 | Flexible | Cliente | ≥ 25 h | 100 % | | `PENDING` o `AWAITING_ALIAS` |
| P2 | Flexible | Cliente | ≤ 23 h | 0 % | | `NOT_APPLICABLE` |
| P3 | Moderada | Cliente | ≥ 25 h | 50 % | | `PENDING` o `AWAITING_ALIAS` |
| P4 | Moderada | Cliente | ≤ 23 h | 0 % | | `NOT_APPLICABLE` |
| P5 | Estricta | Cliente | ≥ 25 h | 0 % | | `NOT_APPLICABLE` |
| P6 | Estricta | Cliente | ≤ 23 h | 0 % | | `NOT_APPLICABLE` |
| P7 | Flexible | Comercio | ≥ 25 h | ¿100 %? | | |
| P8 | Estricta | Comercio | ≥ 25 h | ¿0 o 100 %? | | |
| P9 | Flexible | Comercio | ≤ 23 h | ¿0 o 100 %? | | |

---

## A. Camino feliz: reserva con seña → comprobante → mensaje → confirmado

El caso que describiste: creás una reserva con seña, se vuelve comprobante, llega el mensaje, y después podés cancelar u otras cosas.

### A1 — Crear la reserva con seña

**Setup:** política Flexible. Servicio con seña. Turno a **más de 25 h**.

**Pasos**

1. En el perfil público, elegí servicio + horario + datos del cliente.
2. Aceptá la política de seña (checkbox).
3. Confirmá la reserva.

**Esperado**

- Toast: *“Turno reservado. Completá la transferencia SIPAP.”*
- Panel SIPAP con banco, titular, CI/RUC, alias, **concepto/referencia**, monto de seña y countdown.
- Se muestra la política Flexible (“Reembolso total cancelando hasta 24 hs antes”).
- Te dan un enlace `/r/{token}` (guardalo).
- El turno queda en hold (`PENDING`), no confirmado todavía.

**Comercio**

- Calendario: *“Seña pendiente · {monto}”* y *“El cliente todavía no pagó la seña.”*
- Inbox: ¿llegó un `PAYMENT` o `APPOINTMENT`? Anotá título y cuerpo.
- Badge de Cobros: normalmente **no** sube hasta que haya comprobante.

### A2 — Transferir y subir el comprobante

**Pasos**

1. Hacé (o simulá) la transferencia SIPAP con la **misma referencia** y el **mismo monto**.
2. Subí una foto o PDF del comprobante.
3. No hagas doble click a lo loco; si lo hacés, tiene que ser **una** transacción (idempotencia).

**Esperado**

- Primero: *“Verificando comprobante…”* / *“Enviando comprobante…”*
- Si el OCR matchea: *“Pago verificado. Tu turno quedó confirmado.”* El countdown desaparece.
- Si no matchea: *“Comprobante recibido. El comercio lo revisará.”* El hold queda congelado (el reloj no sigue corriendo).
- En `/r/{token}` ya no debería pedir otro comprobante si el pago quedó confirmado.

**Comercio**

- Inbox: mensaje de comprobante pendiente o de seña pagada. Anotá el texto.
- Cobros: aparece el ítem. Chip `Pendiente de revisión` o `Aprobado` si el OCR cerró solo.
- Badge del menú: +1 si quedó pendiente.
- Calendario: *“Pendiente de revisión”* o *“Seña pagada · {monto}”*.

### A3 — Aprobar o dejar que el OCR confirme

Si quedó pendiente:

1. Abrí Cobros → *Validar comprobante*.
2. Mirás imagen/PDF, referencia OCR y monto OCR.
3. Aprobá.

**Esperado**

- Flash *“Comprobante aprobado”* (o el mensaje de Oracle).
- Chip `Aprobado`. Badge baja.
- Calendario: *“Seña pagada”*.
- `/r/{token}`: turno confirmado, sin panel de subida.
- Cliente: ¿llega mensaje/WhatsApp de confirmación?

### A4 — Después del comprobante, ¿qué puedo hacer?

Desde `/r/{token}` con seña paga y turno a futuro:

- **Reprogramar** (caso G): la seña se mantiene, no se pide otra.
- **Cancelar** (casos B, C, D): entra la lógica de reembolso.
- El comercio puede cancelar desde el calendario (caso F).

---

## B. Cliente cancela con reembolso (Flexible, +24 h)

**Setup:** A1–A3 hechos. Política Flexible. Turno a ≥ 25 h. Seña paga.

**Pasos**

1. En `/r/{token}` tocá **Cancelar reserva**.
2. Debería abrirse *“Cancelar y pedir reembolso”* con: *“Te corresponde un reembolso de **{100 %}**. Ingresá tu alias SIPAP…”*
3. Alias inválido (`abc`, teléfono de otro país): el botón sigue disabled / toast de error. La reserva **no** se cancela.
4. Alias válido (ej. `0981xxxxxxx` o un email). Confirmá.

**Esperado**

- Turno `CANCELADO`.
- Texto: *“Tu reembolso de {monto} está pendiente: el comercio te transferirá en hasta 48 horas hábiles.”*
- Cobros: chip `Reembolso pendiente`, monto = 100 % de la seña, alias visible.
- Calendario: *“Corresponde reembolsar esta seña al cliente.”* + link a Cobros.
- Inbox comercio: ¿aviso de reembolso pendiente?

### B2 — Comercio transfiere y marca enviado

1. Transferí al alias (o simulá).
2. En Cobros → *Ver reembolso* → **Marcar reembolso como enviado**.

**Esperado**

- Chip `Reembolso enviado`.
- `/r/{token}`: *“El reembolso ya fue marcado como enviado.”*
- Aparece *“¿No recibiste tu dinero?”*
- Cliente: ¿mensaje de que el reembolso fue enviado?

---

## C. Cliente cancela sin reembolso

### C1 — Flexible o Moderada, dentro de 24 h

**Setup:** seña paga. Turno a **≤ 23 h**.

**Pasos:** Cancelar reserva.

**Esperado**

- Confirmación simple (no modal de alias).
- Texto: *“Como faltan menos de 24 horas para tu turno, según la política de seña, no corresponde reembolso.”*
- Turno cancelado. En `/r/{token}` solo *“Esta reserva se encuentra cancelada…”* (sin formulario de alias ni 48 h).
- Cobros: **no** crea `refund_pending`. El cobro original sigue `Aprobado`.
- Calendario: *“Esta seña no tiene reembolso.”*

### C2 — Política Estricta, con más de 24 h

**Setup:** Ajustes → Estricta **antes** de reservar. Seña paga. Turno a ≥ 25 h.

**Esperado**

- Confirmación: *“Según la política Estricta de seña, no corresponde reembolso.”*
- Sin alias, sin ítem de reembolso en Cobros.

### C3 — Snapshot de política

1. Reservá con Flexible, pagá la seña.
2. Cambiá la org a Estricta.
3. Cancelá esa reserva (≥ 25 h).

**Esperado:** sigue Flexible (100 %). La reserva no hereda el cambio.

---

## D. Moderada: 50 %

**Setup:** política Moderada **antes** de reservar. Seña paga. Turno ≥ 25 h. Anotá el monto de seña.

**Pasos:** Cancelar como cliente.

**Esperado**

- Modal de alias con **la mitad** de la seña (redondeo: anotá si Oracle redondea hacia arriba/abajo).
- Cobros muestra ese 50 %, no el 100 %.
- Si cancelás la misma org **dentro de 24 h** (otra reserva): 0 %, texto de `WITHIN_24H`.

---

## E. Alias después de cancelar (`AWAITING_ALIAS`)

Pasa cuando hay reembolso pero el cliente **no** cargó alias en el momento (típico si **el comercio** cancela).

**Pasos**

1. Comercio cancela una cita con seña paga (caso F) **sin** que el cliente haya puesto alias.
2. Cliente abre `/r/{token}`.

**Esperado**

- *“Tu turno fue cancelado. Para recibir el reembolso de {monto}, cargá tu alias SIPAP.”*
- Formulario de alias. Botón disabled hasta que sea válido.
- Cobros: chip `Esperando alias`. **No** hay botón “Marcar enviado”. Sí hay “Renunciar al reembolso”.
- Calendario: *“Esperamos el alias SIPAP del cliente…”*

3. Cliente envía alias válido.

**Esperado:** recarga a estado `PENDING` (texto de 48 h hábiles). Cobros pasa a `Reembolso pendiente` y aparece “Marcar enviado”.

4. Alias inválido: error, el estado sigue `AWAITING_ALIAS`.

---

## F. El comercio cancela

**Setup:** seña paga. Turno futuro.

**Pasos**

1. Calendario → cita → estado `CANCELADO` → Guardar.
2. Modal: *“Seña pagada — ¿Cancelar y reembolsar?”* con el monto y el tip de reprogramar.
3. Si tocás **Mantener reserva**: vuelve a `CONFIRMADO`, no se cancela.
4. En otra cita, **Cancelar y reembolsar**.

**Esperado**

- Cita cancelada.
- Cliente en `/r/{token}`: `AWAITING_ALIAS` o `PENDING` si ya había alias.
- Cobros: ítem de reembolso.
- Inbox: ¿el cliente recibe aviso de cancelación + reembolso?

**Variante F2 — seña todavía PENDING (sin pagar)**

- Cancelá desde el calendario.
- **No** debería pedir reembolso.
- El hold se libera. Cobros: cancelado/otro, no `refund_pending`.

**Variante F3 — comprobante subido, todavía no aprobado**

- Calendario: *“El cliente subió el comprobante. Falta validarlo en Cobros.”*
- Anotá si Oracle deja cancelar y si crea reembolso o primero hay que aprobar/rechazar.

---

## G. Reprogramar (la seña se queda)

**Setup:** seña paga. Turno ≥ 25 h.

**Pasos**

1. Cliente en `/r/{token}` → **Reprogramar reserva**.
2. Nueva fecha/hora (y sucursal si aplica). Confirmá.

**Esperado**

- Sigue `CONFIRMADO` / seña `PAID`.
- **No** pide otro comprobante.
- **No** aparece reembolso en Cobros.
- El monto de seña no cambia.
- Inbox: ¿aviso de reprogramación (tipo `APPOINTMENT`, no cobro nuevo)?

**Variante G2:** reprogramá a un horario **dentro de 24 h** y después cancelá.

- La política se mide al **cancelar**, no al reservar. Esperado: 0 % (`WITHIN_24H`).

---

## H. Comprobante rechazado y re-subida

**Setup:** A1 + comprobante subido que quede en revisión (o forzá mismatch).

**Pasos**

1. Cobros → rechazar, con motivo (ej. “El monto no coincide”).
2. Cliente abre `/r/{token}`.

**Esperado**

- Panel SIPAP otra vez, con estado de rechazo.
- Puede volver a subir.
- Al re-subir, el countdown no debería seguir gastando el tiempo del hold original (queda congelado hasta el rechazo; después de rechazar, anotá si el plazo revive o ya expiró).
- Badge de Cobros: el pendiente baja al rechazar y vuelve a subir con el nuevo comprobante.

---

## I. Hold vencido (no subió a tiempo)

**Setup:** reserva con seña. **No** subas comprobante. Esperá a que venza el countdown (o acortá el plazo en DEV si existe parámetro).

**Esperado**

- Banner: *“Se venció el tiempo para adjuntar el comprobante.”*
- No se puede enviar.
- Pago `EXPIRED`. Calendario: *“La seña no se pagó dentro del plazo; el turno se liberó.”*
- El horario vuelve a estar libre en el perfil público.
- Cobros: chip `Vencido` (filtro Expired).
- Cancelar esa reserva **no** crea reembolso.

---

## J. Disputa de reembolso

Hacé B2 primero (`SENT`), o dejá un `PENDING` más de lo razonable si el front ofrece “Abrir disputa por demora”.

### J1 — Modal de espera (48 h)

1. En `/r/{token}` tocá *“¿No recibiste tu dinero?”*
2. Modal: *“Las transferencias SIPAP pueden tardar hasta 48 horas hábiles…”*
3. *“Entendido, voy a esperar”* cierra sin abrir disputa.
4. Si el backend pide espera (`wait_modal_required`), *Abrir disputa* no debería pasar hasta que se cumpla. Anotá el comportamiento real.

### J2 — Abrir disputa

1. Últimos 4 dígitos del **teléfono de la reserva**.
2. Dígitos incorrectos: error, no abre.
3. Dígitos correctos: abre.

**Esperado**

- *“Disputa abierta. El comercio tiene 48 horas hábiles para adjuntar el comprobante de transferencia.”*
- Cobros: chip `En disputa`. Modal: *“Adjuntá la prueba… Subir una prueba no acredita el envío.”*
- Inbox comercio: aviso de disputa.

### J3 — Comercio sube la prueba

1. Foto/PDF del comprobante de **devolución**.
2. Cobros acepta JPG/PNG/PDF; otro formato falla.

**Esperado**

- Flash de “queda en revisión; el OCR no acredita”.
- Cliente ve la imagen del comprobante.
- **No** pasa solo a “liquidado”. El cliente tiene:
  - *“Confirmé que recibí el reembolso”* → caso liquidado.
  - *“Sigue sin aparecer en mi cuenta”* → abre WhatsApp Hasel y deja constancia.

### J4 — Cliente confirma recepción

- Texto: *“Confirmaste que recibiste el reembolso. El caso quedó liquidado.”*
- Cobros: *“Reembolso confirmado”*.
- No se puede reabrir.

### J5 — Cliente insiste

- WhatsApp de Hasel (`wa.me/...`).
- Texto: *“Registramos que el dinero sigue sin aparecer…”*
- El botón de insistir no se repite.

### J6 — El comercio no sube prueba a tiempo

- Estado `Disputa vencida` / *“El plazo de la disputa venció sin una prueba válida.”*
- Ajustes → Pagos: strikes `N de 3`.
- Al 3.er strike: señas suspendidas, toggle disabled, banner de enforcement.

---

## K. Renunciar al reembolso (waive)

**Setup:** reembolso `PENDING` o `AWAITING_ALIAS`.

**Pasos**

1. Cobros → Renunciar.
2. Motivo de 1–4 caracteres: el BFF responde 400 (*“Indica un motivo de al menos 5 caracteres.”*).
3. Motivo válido (≥ 5). Confirmá.

**Esperado**

- Chip `Reembolso renunciado`.
- `/r/{token}`: ya no pide alias ni muestra 48 h (queda como cancelada simple).
- Calendario: deja de guiar a “corresponde reembolsar”.
- El cliente **no** debería poder abrir disputa sobre un `WAIVED`.

---

## L. Mensajes (anotá lo que llega)

Por cada evento, marcá si llegó **inbox comercio**, **push**, **WhatsApp/SMS/mail cliente**.

| Evento | Inbox comercio | Cliente (WA/mail/push) | Texto real |
|---|---|---|---|
| Reserva con seña creada (hold) | | | |
| Comprobante subido | | | |
| OCR match / turno confirmado | | | |
| Comercio aprueba | | | |
| Comercio rechaza | | | |
| Hold vencido | | | |
| Cliente cancela con reembolso | | | |
| Cliente cancela sin reembolso | | | |
| Comercio cancela con seña paga | | | |
| Cliente carga alias | | | |
| Comercio marca reembolso enviado | | | |
| Cliente abre disputa | | | |
| Comercio sube prueba de reembolso | | | |
| Disputa liquidada / vencida | | | |

Los títulos los arma Oracle. Si un evento clave no avisa a nadie, es un bug de notificaciones, no de la UI.

---

## M. Bordes y rarezas

### M1 — Doble envío del comprobante

Subí el mismo archivo dos veces rápido. Una sola transacción en Cobros. La UI reconcilia (timeout → “Verificando…”).

### M2 — PDF como comprobante

PDF de seña y PDF de prueba de reembolso. El front los convierte a imagen antes de mandarlos.

### M3 — Reserva pasada

Turno ya ocurrido, seña paga. `/r/{token}`: *“Esta reserva ya finalizó. Ya no es posible reprogramarla ni cancelarla.”* Sin botones de cancelar.

### M4 — Cancelar dos veces

Reserva ya cancelada: el botón no está. Si llamás el API de nuevo, Oracle debería rechazar (anotá el mensaje).

### M5 — Pagopar (viejo)

`POST /api/public/payments` tiene que responder **410**. El camino vivo es solo SIPAP.

### M6 — Claim viejo

`POST /api/public/reservations/{token}/refund-claim` → **410**. El camino vivo es la disputa.

### M7 — Org sin señas

Deshabilitá señas en Ajustes. El booking público no debería pedir seña aunque el servicio la tenga configurada. Mensaje tipo *“Este negocio aún no tiene habilitado el cobro de señas.”*

### M8 — Completar cita con seña paga

Pasá la cita a `COMPLETADO`. No crea reembolso. Cobros sigue `Aprobado`.

### M9 — Filtros de Cobros

Después de generar de todo, recorré las pestañas: `Todos` · `Pendientes` · `Aprobados` · `Reembolsos` · `Vencidos`. Cada ítem tiene que caer en la pestaña correcta (un `refund_pending` no puede quedar solo en Aprobados).

### M10 — Deep link desde el calendario

El link *“Gestionar reembolso en Cobros”* abre `/panel/cobros?status=refunded&appointment={id}` y muestra **esa** cita.

---

## Orden sugerido (una tarde de prueba)

Hacé **una reserva por caso**. No recicles.

1. **A1 → A2 → A3 → A4** — camino feliz + mirar mensajes.
2. **B → B2 → J1 → J2 → J3 → J4** — reembolso completo hasta liquidar.
3. **F → E** — cancela el comercio, el cliente carga alias, después B2.
4. **C1 y C2** — sin reembolso (24 h y Estricta).
5. **D** — Moderada 50 %.
6. **G y G2** — reprogramar y después cancelar dentro de 24 h.
7. **H** — rechazo y re-subida.
8. **I** — hold vencido (si podés acortar el plazo).
9. **K** — waive.
10. **P7–P9** — ¿el comercio que cancela respeta la política?
11. **C3** — snapshot de política.
12. **M1–M10** — lo que te sobre.

---

## Checklist de cierre

Al terminar, deberías poder responder:

- [ ] Flexible ≥ 24 h devuelve 100 %; < 24 h, 0 %.
- [ ] Moderada ≥ 24 h devuelve 50 %; < 24 h, 0 %.
- [ ] Estricta nunca devuelve si cancela el **cliente**.
- [ ] Si cancela el **comercio**, el monto es: _______________
- [ ] El alias inválido no cancela ni cambia el estado.
- [ ] Sin alias no se puede “marcar enviado”.
- [ ] Reprogramar no genera un segundo cobro ni un reembolso.
- [ ] Hold vencido libera el horario y no reembolsa.
- [ ] Rechazar comprobante permite re-subir.
- [ ] Disputa: prueba ≠ liquidado; liquidado = cliente confirma u Ops.
- [ ] Los mensajes que importan llegan (tabla de la sección L).
- [ ] Cambiar la política en Ajustes no altera reservas viejas.

Si algo no cierra, anotá: **caso**, **token / id de cita**, **estado de pago**, **estado de reembolso**, **chip de Cobros**, **monto**, **hora del turno**, **quién canceló**.
