# Incidente: hueco en el log de auditoría financiera (`op_finance_audit_log`)

- **Estado:** hueco CERRADO para las correcciones retroactivas de asistencia desde el 2026-09-30 08:23 UTC; el incidente sigue ABIERTO por las comprobaciones pendientes (§9). El fix `822481c` está en `origin/main` desde 2026-09-29 21:18 (Dublín). La migración `00047` se aplicó en producción el 2026-09-30 a las 08:13 UTC (09:13 Dublín). La primera entrada con identidad completa se verificó con el fixture C el 2026-09-30 a las 08:23:12 UTC (§8.4).
- **Ventana afectada:** desde 2026-04-23 15:45 UTC (16:45 Europe/Dublin, UTC+1) hasta, como mínimo, 2026-09-30 08:13 UTC (aplicación de `00047`). Para las correcciones retroactivas, la escritura correcta está demostrada desde las 08:23:12 UTC. Los otros call sites de `logFinanceEvent` no se han probado uno a uno (§9).
- **Documento elaborado:** 2026-09-29, con consultas SELECT de solo lectura contra producción (proyecto `npfizqblckcwzfrqrzel`). **Revisado:** 2026-09-30 (afirmaciones no demostradas matizadas, fechas absolutas, acciones del 2026-09-30 en §8 y comprobaciones pendientes en §9).

> **AVISO IMPORTANTE**
>
> Todas las cifras de este documento están **DERIVADAS de tablas operativas** (`student_subscriptions`, `event_purchases`, `op_penalties`, `discount_rules`, `discount_claims`, `student_referrals`, `op_attendance`, `op_bookings`). **NO son registros de auditoría originales.**
>
> **No se ha rellenado (back-fill) ni fabricado ninguna entrada de auditoría.** No se ha insertado nada en `op_finance_audit_log`. Estas cifras describen el estado de los datos operativos a 2026-09-29 y no sustituyen al log perdido.
>
> El documento no incluye datos personales: solo conteos, importes y fechas agregados.

> **Alcance de las conclusiones**
>
> - Este documento **no demuestra que no haya habido cobros erróneos** en la ventana. Sin auditoría, un cobro, descuento, reembolso o consumo de crédito incorrecto puede no dejar rastro distinguible en las tablas operativas. Lo único verificado es lo que se indica explícitamente, y solo para las filas citadas (por ejemplo, las 2 correcciones retroactivas de §4.L).
> - Este documento **no demuestra que los borrados fueran legítimos**. Las filas desaparecidas (§4.K) no dejan registro de quién las borró, cuándo ni por qué.
> - Todas las cifras se refieren a filas que **seguían existiendo** en el momento de la consulta (2026-09-29, salvo que se indique otra fecha).

---

## 1. Resumen

Desde el 2026-04-23 ninguna escritura en `op_finance_audit_log` ha llegado a la base de datos. El commit `a9b66d1` (2026-04-23 16:45:50 +01:00) añadió cuatro campos al payload que construye `auditEntryToRow` (`lib/supabase/operational-persistence.ts`): `performed_by_user_id`, `performed_by_email`, `performed_by_name` y `performed_at`. La migración que crea esas columnas (`supabase/migrations/00047_finance_audit_identity.sql`) nunca se aplicó en producción. PostgREST rechaza la fila entera (PGRST204, columna desconocida) y el error se tragaba: `logFinanceEvent` persiste en modo *fire-and-forget* y `saveAuditEntryToDB` solo emite un `console.warn`.

La tabla contiene exactamente **5 filas**. La última es de **2026-04-23 14:49:31 UTC (15:49 hora de Dublín)**.

Las entradas sí se guardaban en un almacén en memoria del proceso (`globalThis.__bpm_finance_audit`), pero ese almacén se sustituye por el contenido de la BD en cada hidratación o reinicio, así que tampoco sirve como fuente.

En la ventana, las tablas operativas muestran actividad financiera que habría generado auditoría (cifras aproximadas, detalle en §4):

- 224 altas de suscripción auditables (161 autocompras, 61 asignaciones por admin y 2 drop-ins vendidos por QR).
- 22 suscripciones marcadas como pagadas por personal (17 por admin y 5 por QR, 1.277 €).
- 22 compras de evento marcadas como pagadas por admin (480 €).
- 1 reembolso Stripe (55 €).
- 2 entradas de evento gratuitas con código promocional (ambas de QA con `BPM_TEST_100`, ver §4.F).
- 8 reglas de descuento creadas.
- 1 penalización (creada y/o condonada).
- 2 correcciones retroactivas de asistencia.
- 4 claims de descuento que apuntan a suscripciones que ya no existen (borradas o nunca creadas; no se sabe quién, cuándo ni por qué, ni si fue legítimo).

Hay datos que **no se pueden reconstruir**: valores anteriores sobrescritos, actores de varias acciones, motivos que solo vivían en el metadata, ediciones múltiples colapsadas en el estado final, eventos sobre filas borradas, extensiones de caducidad y ediciones o borrados de reglas de descuento.

## 2. Cronología

| Momento (Dublín, UTC+1) | Hecho |
|---|---|
| 2026-04-17 12:40 | Primera fila de `op_finance_audit_log` |
| 2026-04-23 15:49:31 | **Última fila correcta** (`event_purchase` / `marked_paid`). El dato previo de "14:49 UTC+1" era en realidad 14:49 **UTC** |
| 2026-04-23 16:45:50 | Commit `a9b66d1` añade los campos de identidad al insert y la migración `00047` (no aplicada en prod). **Inicio del fallo** (la hora exacta del despliegue no se conoce) |
| 2026-04-23 15:49 → 16:45 | Sin actividad financiera en ese intervalo **entre las filas que siguen existiendo** (verificado), así que la hora exacta de inicio no cambia las cifras. No se puede descartar actividad sobre filas borradas después |
| 2026-05-07 17:42 | Primera actividad financiera observada tras el inicio del fallo (alta de suscripción) |
| 2026-09-29 21:18 | Fix committeado en `main` como `822481c` ("Stop silently losing finance audit entries") y subido a `origin/main`. La hora de despliegue en producción no está verificada en este documento |
| 2026-09-30 09:13 | Migración `00047` aplicada en producción (08:13 UTC). Verificadas las 4 columnas, el índice y su acceso por REST (§8) |
| 2026-09-30 09:15:56 | Código `BPM_TEST_100` desactivado (08:15:56 UTC), conservando la regla y sus usos (§8) |
| 2026-09-30 09:23:12 | Corrección retroactiva de prueba (fixture C) desde la UI: primera entrada de auditoría con identidad completa verificada (08:23:12 UTC). El fixture y su entrada se borraron después (§8.4) |

**Estado en producción a 2026-09-29 (antes de `00047`):** `op_finance_audit_log` solo tenía las columnas `id, entity_type, entity_id, action, performed_by, detail, previous_value, new_value, created_at, metadata`, y cualquier auditoría generada se perdía. **Desde el 2026-09-30 08:13 UTC** la tabla tiene además `performed_by_user_id`, `performed_by_email`, `performed_by_name` y `performed_at` (14 columnas en total).

Según su mensaje de commit, el fix `822481c` reintenta el insert sin las columnas de `00047` si faltan (entrada marcada como *degraded*). Con `00047` aplicada, ese camino no debería activarse. **Ninguna de las dos cosas está verificada en producción.** Entre el push del fix (2026-09-29 20:18 UTC) y el 2026-09-30 08:15 UTC no hubo actividad financiera en las tablas operativas y la tabla sigue con 5 filas, así que no hay evidencia ni a favor ni en contra de que la auditoría se haya reanudado.

## 3. Tipos de evento afectados y call sites

Hay 32 call sites de `logFinanceEvent` en el commit `db1a5ed`, excluyendo tests. Es la última versión anterior al fix y, en cuanto a auditoría, se comporta igual que lo desplegado desde `a9b66d1`. En el fix `822481c`, `attendance-backdate.ts` pasa a usar `logFinanceEventAwaited`. Los números de línea son los de `db1a5ed`.

| # | Tipo de evento (negocio) | Archivo:línea (`db1a5ed`) | entity_type / action |
|---|---|---|---|
| A | Alta de suscripción por autocompra (catálogo o Stripe checkout) | `lib/actions/catalog-purchase.ts:357` | subscription / `created` |
| A' | Anomalía: carrera en descuento de primera vez | `lib/actions/catalog-purchase.ts:386` | subscription / `manual_edit` (metadata.anomaly) |
| A'' | Referido pendiente registrado en la compra | `lib/actions/catalog-purchase.ts:419` | subscription / `manual_edit` |
| A''' | Anomalía: descuento de primera vez denegado | `lib/services/pricing-service.ts:226` | subscription (`student:<id>`) / `manual_edit` |
| B | Asignación de suscripción por admin (con o sin descuento manual) | `lib/actions/subscriptions.ts:334` | subscription / `created` o `manual_edit` si hay descuento manual |
| B' | Venta de drop-in por QR en recepción | `lib/actions/qr-checkin.ts:812` | subscription / `created` |
| C | Cambio de estado de pago de suscripción (marcar pagado, reembolso manual u otro cambio) | `lib/actions/subscriptions.ts:682` | subscription / `marked_paid`, `refunded` o `status_changed` |
| C' | Marcar pagado por QR (check-in, walk-in o solo pago) | `lib/actions/qr-checkin.ts:628`, `:671`, `:710` | subscription / `marked_paid` |
| D | Extensión de caducidad por admin | `lib/actions/subscriptions.ts:843` | subscription / `manual_edit` (metadata.extension) |
| E | Reembolso Stripe (suscripción o compra de evento) | `lib/actions/stripe-refund.ts:233` | subscription o event_purchase / `refunded` |
| F | Compra de evento con descuento, pendiente (alumno) | `lib/actions/event-purchase.ts:275` | event_purchase / `created` |
| F' | Entrada gratuita de invitado con código promocional | `lib/actions/event-purchase.ts:564` | event_purchase / `created` |
| F'' | Compra de evento vía Stripe con descuento (webhook) | `lib/actions/event-purchase.ts:790` | event_purchase / `created` |
| G | Compra de evento pendiente cobrada vía Stripe | `lib/actions/event-purchase.ts:847` | event_purchase / `marked_paid` |
| G' | Compra de evento marcada pagada por admin (efectivo/Revolut) | `lib/actions/event-purchase.ts:902` | event_purchase / `marked_paid` |
| G'' | Cobro en recepción durante el check-in del evento | `lib/actions/event-checkin.ts:289` | event_purchase / `marked_paid` |
| H | Reembolso manual de compra de evento | `lib/actions/event-purchase.ts:1014` | event_purchase / `refunded` |
| I | Cambio de resolución de penalización (condonar, etc.) | `lib/actions/penalties-admin.ts:47` | penalty / `waived` o `status_changed` |
| I' | Penalización creada manualmente (super-admin) | `lib/actions/penalties-admin.ts:136` | penalty / `created` |
| J | Regla de descuento: crear, editar, activar/desactivar, borrar | `lib/actions/discount-rules.ts:362`, `:427`, `:466`, `:509` | subscription (`discount_rule:<id>`) / `created`, `manual_edit`, `status_changed`, `cancelled` |
| K | Super-admin: borrado de datos de prueba | `lib/actions/finance-admin.ts:272`, `:311`, `:337` | subscription, penalty o event_purchase / `manual_edit` (new_value `deleted`) |
| K' | Super-admin: marcar o desmarcar como dato de prueba | `lib/actions/finance-admin.ts:482`, `:551`, `:640` | subscription, penalty o event_purchase / `manual_edit` |
| L | Corrección retroactiva de asistencia (consumo de crédito, anulación de penalización) | `lib/actions/attendance-backdate.ts:581` | subscription o `student:<id>` / `manual_edit` (metadata.backdatedAttendance) |

Flujos que **no se auditan ni siquiera sin el fallo**. No forman parte del hueco, pero se mencionan porque aparecen en los datos:

- Renovaciones de término (`lib/actions/term-lifecycle.ts`).
- Edición genérica de suscripción (`updateSubscriptionAction`).
- Borrado de suscripción desde la ficha del alumno (`lib/actions/students.ts`).
- Penalizaciones automáticas y borrado de penalizaciones.
- Compras de evento a precio completo.

## 4. Por tipo de evento: qué muestran los datos operativos y qué se pierde

Ventana: `>= 2026-04-23 15:45:00+00`. Importes en euros a partir de las columnas en céntimos. Los conteos solo incluyen filas **que siguen existiendo**.

### A. Altas de suscripción por autocompra (`catalog-purchase.ts:357`)

- **Datos:** 161 suscripciones (`assigned_by = student_id`, sin `renewed_from_id`), 6.353,00 € de precio congelado (`price_cents_at_purchase`). 106 son de método Stripe. 8 con descuento del motor (52,00 €). Estado a 2026-09-29: 122 pagadas (5.329,50 €), 37 pendientes y 2 reembolsadas.
- **Recuperable:** fecha y hora de alta (`created_at`), producto (`product_snapshot`), precio, descuento aplicado (`applied_discount`, `discount_amount_cents`) y método.
- **Perdido:** el texto `detail` y `new_value` original. Si el estado de pago cambió después, el estado en el momento del alta solo se infiere.

### A'/A''/A'''. Anomalías de descuento de primera vez y referidos

- **Denegaciones de primera vez (`pricing-service.ts:226`):** **no reconstruible**. Una denegación no deja ninguna fila operativa.
- **Carrera de primera vez (`catalog-purchase.ts:386`):** no reconstruida. Requeriría un análisis cruzado de `applied_discount` y `discount_claims` que queda fuera de este documento.
- **Referidos (`catalog-purchase.ts:419`):** hay 2 filas en `student_referrals` creadas en la ventana, ambas `pending`. Es una cota superior: no está verificado que ambas vengan de una compra.

### B/B'. Asignaciones por admin y drop-ins vendidos por QR

- **Asignaciones (`subscriptions.ts:334`):** 61 suscripciones (`assigned_by <> student_id`, sin renovación ni nota de QR), 5.712,00 €. 60 pagadas (5.492,00 €) y 1 complimentary. 9 con descuento del motor. Descuento total 103,00 €. **1 con descuento manual de 15,00 €**, que tiene motivo y autor en `manual_discount_reason` y `manual_discount_by`. Actor de la asignación en `assigned_by` (uuid) y `assigned_at`.
- **Drop-in por QR (`qr-checkin.ts:812`):** 2 ventas en efectivo, 30,00 € (notas "Sold via QR check-in…", `collected_by`).
- **Perdido:** el email y nombre del actor capturados en el momento (solo queda el uuid), el precio del motor frente al final dentro del metadata (parcialmente recuperable de columnas) y la marca de tiempo propia del evento, que se aproxima con `assigned_at` y `created_at`.
- *Contexto, no forma parte del hueco:* 17 renovaciones (1.788,00 €), que nunca se auditan.

### C/C'. Suscripciones marcadas como pagadas después del alta

Criterio: `paid_at` en la ventana y `paid_at > created_at + 2 min`.

- **Por admin, flujo `applyPaymentChangeAction` (`subscriptions.ts:682`):** 17 filas, 1.202,00 €. Todas tienen `collected_by` (nombre visible en texto, no uuid).
- **Por QR (`qr-checkin.ts:628/671/710`):** 5 filas, 75,00 €. No se puede distinguir cuál de las tres funciones QR las generó.
- **Stripe sin actor:** 3 filas, 255,00 € (120 € + 15 € + 120 €; 1 renovación y 2 autocompras), con `paid_at` el 2026-05-29, el 2026-06-21 y el 2026-09-14 (UTC). Todas tienen `payment_reference`, pero no `collected_by`. Una de ellas tiene `paid_at` con los segundos exactamente a `:00` (2026-05-29 17:26:00 UTC), lo que *podría* indicar una hora introducida a mano, pero no lo demuestra. **No se sabe qué flujo marcó estos pagos ni quién lo hizo, y no se ha conciliado con Stripe.** Queda como comprobación pendiente (§9).
- **Perdido:** el `previous_value` (estado anterior: pendiente, complimentary…). Tampoco se ven ciclos pagado → pendiente → pagado, porque `paid_at` no se sobrescribe si ya existía. Los cambios `status_changed` (por ejemplo, pagado → pendiente) **no son reconstruibles** porque no dejan columna. Tampoco hay uuid ni email del actor.

### C (reembolso manual) / E. Reembolsos de suscripciones

- **Reembolso Stripe (`stripe-refund.ts:233`):** 1 reembolso total de 55,00 € (2026-08-23, `refund_status = succeeded`, con `stripe_refund_id`, `refunded_by` y `refund_reason`).
- **Reembolso manual (`subscriptions.ts:682`):** 0 filas con `refunded_at` en la ventana.
- **Anomalía a revisar:** 1 suscripción (autocompra, método Stripe, 90,00 €, creada el 2026-05-28 19:40 UTC) tiene `payment_status = refunded` y `status = cancelled`, pero **no tiene** `refunded_at`, `refunded_by`, `refund_reason`, `stripe_refund_id` ni `refund_status`, y `refunded_amount_cents = 0`. Tampoco tiene `paid_at`, así que **ni siquiera está demostrado que se llegara a cobrar**. Tiene `payment_reference`. Su `updated_at` es 2026-06-05 17:53 UTC, pero eso no prueba cuándo ocurrió el cambio. Ninguno de los dos flujos auditados de reembolso deja la fila en este estado, pero no se ha determinado qué camino lo hizo. **No se sabe quién, cuándo ni por qué, ni si hubo cobro o devolución real.** Queda como comprobación pendiente (§9).
- **Perdido en reembolsos:** el metadata con la foto de descuento e IVA revertido, el importe acumulado frente al pagado y el `previous_value`.

### D. Extensiones de caducidad (`subscriptions.ts:843`)

- **Datos:** no existe columna con la caducidad anterior ni con el motivo.
- **Heurística:** entre las 137 suscripciones con `updated_at` en la ventana, se compara `valid_until` con el fin de término (productos de un solo término) o con `valid_from + duration_days`. Resultado: **0 candidatas**.
- **Esto no descarta extensiones.** La heurística usa la configuración actual de productos y términos, que puede haber cambiado, y no cubre productos de varios términos.
- **Perdido:** el `valid_until` anterior, el motivo, el actor y la fecha de cada extensión. **Irrecuperable.**

### F/F'/F''. Compras de evento con descuento

- **Entradas gratuitas con código promocional para invitados (`event-purchase.ts:564`):** 2, con 110,00 € de descuento y 0 € cobrados. Comprobado el 2026-09-30: son los **únicos** usos de `BPM_TEST_100` (código interno de QA, migración `00074`). Ambas son del 2026-09-01 (20:54 y 22:37 UTC), de invitados sin alumno vinculado, con nombre "Test Test" y "Test 2 Test" y una misma dirección de prueba genérica. Ninguna tiene check-in. Ninguna otra tabla referencia el código. Se conservan sin cambios.
- **Compras con descuento, pendientes o vía Stripe (`:275`, `:790`):** 0 filas existentes.
- *Contexto:* 151 compras a precio completo en la ventana (4.560,00 € en `paid_amount_cents`). No se auditan salvo que se marquen como pagadas.
- **Perdido:** el código promocional exacto y el metadata de descuento si no se conserva en `applied_discount`. Tampoco se ven compras pendientes con descuento que luego se borraran.

### G/G'/G''. Compras de evento marcadas como pagadas

- **Por admin (`event-purchase.ts:902`):** 22 filas, 480,00 €: 16 en efectivo (205,00 €) y 6 por Revolut (275,00 €). Entre 2026-05-27 y 2026-08-11.
- **Cobro en el check-in (`event-checkin.ts:289`):** 0.
- **Stripe pendiente → pagado (`event-purchase.ts:847`):** 0.
- **Perdido:** **el actor.** `event_purchases` no tiene columna de quién cobró; `checked_in_by` es nulo en las 22. También se pierden el estado anterior y la hora exacta del cobro frente a la del registro (solo queda `paid_at`).

### H. Reembolsos de compras de evento (`event-purchase.ts:1014`, `stripe-refund.ts:233`)

- **Datos:** 0 filas con `refunded_at` en la ventana y 0 filas en estado reembolsado sin `refunded_at`.

### I/I'. Penalizaciones

- **Datos:** 1 penalización creada en la ventana (2026-07-17): cancelación tardía de 2,00 €, ahora `waived`. Es **la única fila de toda la tabla** `op_penalties`.
- Se perdió al menos 1 evento de auditoría: `created` si fue manual, o `waived` si fue automática y condonada después.
- **Perdido:** la resolución anterior, quién condonó, cuándo lo hizo (no hay columna de resolución) y si fue creación manual o automática. Tampoco se ven penalizaciones borradas en la ventana, ya que los borrados no dejan rastro.

### J. Reglas de descuento

- **Datos:** 8 reglas creadas en la ventana (del 2026-04-29 al 2026-08-12). Son todas las reglas existentes. A 2026-09-29 las 8 estaban activas. Desde el 2026-09-30 08:15:56 UTC, `BPM_TEST_100` está inactiva, así que quedan 7 activas (§8).
- **Ediciones, activaciones y desactivaciones:** **no detectables**. `discount_rules.updated_at` no tiene trigger y el repositorio no lo actualiza al editar. La desactivación del 2026-09-30 sí actualizó `updated_at` a mano.
- **Borrados:** no dejan rastro.
- **Perdido:** códigos o valores anteriores, historial de activación, reglas borradas y los actores de todo lo anterior.

### K/K'. Borrado y marcado de datos de prueba (super-admin)

- **Datos:** a 2026-09-29, 0 filas llevaban marcadores de prueba (`[test]`, `#test`, `test:`) en suscripciones, compras de evento o penalizaciones. Esta heurística **no detecta todos los datos de prueba**: por ejemplo, las 2 compras de QA con `BPM_TEST_100` (§4.F) no llevan ningún marcador.
- **Suscripciones referenciadas que no existen:** 4 `discount_claims` de la ventana (3 `admin_manual` y 1 `stripe_checkout`) apuntan a `related_subscription_id` que **no existen** en `student_subscriptions`. Eso demuestra que esas 4 suscripciones no existían a 2026-09-29, pero **no demuestra cómo ni por qué**. Las explicaciones posibles, sin verificar, son: borrado de datos de prueba por super-admin (cuya auditoría también se perdía en esta ventana), borrado desde la ficha del alumno (no auditado), borrado directo en BD o un alta que falló después de reservar el claim. **No hay evidencia de que estos borrados fueran legítimos ni de que no lo fueran.**
- Además, 2 claims de `stripe_checkout` no tienen suscripción relacionada.
- **Perdido:** todo sobre esas filas: si llegaron a existir, importe, estado, quién las borró, cuándo y por qué.

### L. Correcciones retroactivas de asistencia (`attendance-backdate.ts:581`)

- **Datos:** 2 filas de `op_attendance` con nota "Backdated correction…", creadas el 2026-09-29 entre las 13:30 y las 13:32 (Dublín). Corresponden a clases del 2026-09-04 y del 2026-09-06, ambas sobre reservas existentes y con suscripción asociada.
- 0 reservas con `source = admin_backdated` y 0 penalizaciones `attendance_corrected`.
- **Verificado después (2026-09-29, 21:25 Dublín), solo para estas 2 correcciones:** no consumieron un crédito adicional. Ambas reservas están sobre un Drop In de 1 crédito con saldo 0 desde la reserva original, y el `updated_at` de las dos suscripciones (que sí tiene trigger) sigue en el 2026-09-01, la hora de la reserva: la corrección no modificó esas filas. Las reservas no tienen la nota "Backdated correction (was …)" que deja una reinstauración, así que no se reinstauraron. No hay penalizaciones asociadas. Esto **no dice nada** sobre otros alumnos ni sobre otros flujos de cobro en la ventana.
- Contexto: según el historial de git, a esa hora el último commit en `main` era `f3811b9` (2026-09-29 13:20 Dublín), anterior a la corrección del doble cobro en reservas `missed` (`66d2b76`, 2026-09-29 15:31 Dublín). La versión realmente desplegada a esa hora no está verificada.
- **Perdido:** el estado exacto de la reserva y de la asistencia antes de la corrección, y el motivo completo con el actor estructurado (solo queda `marked_by` en texto y el motivo en la nota de asistencia).
- **Duda:** no está verificado si estas filas se generaron desde el despliegue de producción o desde un entorno local conectado a producción. La funcionalidad se committeó el mismo día (13:20).

### Tablas revisadas sin actividad en la ventana

`payments` y `wallet_transactions` tienen 0 filas en la ventana, así que no sirven como fuente.

## 5. Lo que NO se puede reconstruir (resumen)

1. **Valores anteriores sobrescritos:** `valid_until` antes de una extensión, estado de pago anterior, resolución anterior de penalización y campos anteriores de reglas de descuento.
2. **Actor:** falta en compras de evento marcadas como pagadas (22), cambios de resolución de penalización, ediciones, activaciones y borrados de reglas, y borrados de filas. Donde existe (`collected_by`, `refunded_by`, `marked_by`), es texto libre, no uuid ni email.
3. **Motivos y metadata** que solo vivían en la auditoría: motivo de extensión, foto de descuento e IVA en reembolsos, denegaciones y carreras de primera vez, y metadata de corrección retroactiva (crédito consumido, saldos).
4. **Ediciones múltiples colapsadas:** solo se ve el estado final de cada fila. `updated_at` es la última modificación de cualquier campo y **no prueba un evento financiero**.
5. **Eventos sobre filas borradas:** hay 4 suscripciones referenciadas por claims que no existen (causa desconocida). El número real de filas borradas es desconocido.
6. **Marcas de tiempo exactas:** hay eventos sin columna de fecha propia (extensiones, resoluciones de penalización, ediciones de reglas, cambios de estado de pago distintos de pagado o reembolsado).
7. **Cambios de estado de pago `status_changed`** (por ejemplo, pagado → pendiente): no dejan rastro.

## 6. Método y consultas exactas

- Hasta el 2026-09-29, solo lectura: se usaron únicamente `SELECT` e `information_schema` / `pg_catalog`, sin DDL, sin INSERT, UPDATE ni DELETE y sin `apply_migration`. Las dos únicas escrituras posteriores (2026-09-30) se describen en §8.
- La sesión de la BD está en UTC. El inicio de la ventana es `timestamptz '2026-04-23 15:45:00+00'` (16:45 Dublín).
- Call sites: `rg -n "logFinanceEvent" --glob '!**/__tests__/**'` y `git grep -n logFinanceEvent db1a5ed -- ':!**/__tests__/**'` (versión previa al fix).

```sql
-- Q0: estado del log de auditoría
select count(*), min(created_at), max(created_at),
       string_agg(distinct entity_type||'/'||action, ', ')
from op_finance_audit_log;
select current_setting('TimeZone'), created_at,
       (created_at at time zone 'Europe/Dublin') dublin, entity_type, action,
       (performed_by is not null) has_actor, (metadata is not null) has_meta
from op_finance_audit_log order by created_at;

-- Q1: altas de suscripción por canal (A, B, B', renovaciones)
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select case when notes ilike 'Sold via QR check-in%' then 'qr_dropin'
            when renewed_from_id is not null then 'renewal'
            when assigned_by = student_id then 'self_purchase'
            when assigned_by is not null then 'admin_assigned'
            else 'no_assigned_by' end channel,
       count(*) n,
       count(*) filter (where coalesce(manual_discount_cents,0)>0) n_manual_disc,
       sum(coalesce(manual_discount_cents,0))/100.0 manual_disc_eur,
       count(*) filter (where manual_discount_cents>0 and manual_discount_reason is not null) n_md_reason,
       count(*) filter (where manual_discount_cents>0 and manual_discount_by is not null) n_md_by,
       count(*) filter (where applied_discount is not null) n_engine_disc,
       sum(coalesce(discount_amount_cents,0))/100.0 total_disc_eur,
       sum(coalesce(price_cents_at_purchase,0))/100.0 price_eur,
       count(*) filter (where payment_method='stripe') n_stripe,
       count(*) filter (where payment_status='paid') n_paid,
       sum(price_cents_at_purchase) filter (where payment_status='paid')/100.0 paid_eur,
       count(*) filter (where payment_status='pending') n_pending,
       count(*) filter (where payment_status='complimentary') n_comp,
       count(*) filter (where payment_status='refunded') n_refunded
from student_subscriptions, w where created_at >= w.s group by 1 order by 1;

-- Q2: suscripciones marcadas como pagadas después del alta (C, C')
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select case when payment_notes ilike '%via QR check-in%' then 'qr'
            when payment_method='stripe' then 'stripe'
            when collected_by is not null then 'admin_collected_by'
            else 'no_actor' end path,
       case when renewed_from_id is not null then 'renewal'
            when assigned_by = student_id then 'self_purchase'
            else 'admin_assigned' end origin,
       payment_method, count(*) n, sum(price_cents_at_purchase)/100.0 eur,
       count(*) filter (where payment_reference is not null) n_ref
from student_subscriptions, w
where paid_at >= w.s and paid_at > created_at + interval '2 minutes'
group by 1,2,3 order by 1,2,3;

-- Q3: reembolsos de suscripciones (C reembolso, E) y estados reembolsados sin refunded_at
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select payment_status, payment_method, status, refund_status,
       (stripe_refund_id is not null) has_stripe_refund, refunded_amount_cents,
       price_cents_at_purchase, (refunded_at is not null) has_refunded_at,
       (refunded_by is not null) has_refunded_by, (refund_reason is not null) has_reason,
       (created_at >= w.s) created_in_window,
       date(refunded_at at time zone 'Europe/Dublin') refunded_date,
       date(updated_at at time zone 'Europe/Dublin') updated_date
from student_subscriptions, w
where (refunded_at >= w.s)
   or (payment_status in ('refunded','partially_refunded') and (created_at >= w.s or updated_at >= w.s))
   or (coalesce(refunded_amount_cents,0) > 0 and updated_at >= w.s);

-- Q4: compras de evento: altas, pagos posteriores y reembolsos (F, G, H)
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select 'created' kind,
       case when coalesce(discount_amount_cents,0)>0
                 and coalesce(paid_amount_cents, unit_price_cents_at_purchase,1)=0
                 and student_id is null then 'free_guest_promo'
            when coalesce(discount_amount_cents,0)>0 or applied_discount is not null then 'discounted'
            else 'full_price' end sub,
       count(*) n, count(*) filter (where student_id is null) n_guest,
       count(*) filter (where payment_method::text='stripe') n_stripe,
       sum(coalesce(discount_amount_cents,0))/100.0 disc_eur,
       sum(coalesce(paid_amount_cents,0))/100.0 paid_amount_eur,
       string_agg(distinct payment_status::text, ',') statuses
from event_purchases, w where purchased_at >= w.s group by 1,2
union all
select 'marked_paid_later',
       coalesce(reception_method, case when payment_method::text='stripe' then 'stripe_no_reception' else 'none' end),
       count(*), count(*) filter (where student_id is null),
       count(*) filter (where payment_method::text='stripe'), 0,
       sum(coalesce(paid_amount_cents, unit_price_cents_at_purchase,0))/100.0,
       string_agg(distinct payment_status::text, ',')
from event_purchases, w
where paid_at >= w.s and paid_at > purchased_at + interval '2 minutes' group by 1,2
union all
select 'refund', case when stripe_refund_id is not null then 'stripe' else 'manual' end,
       count(*), count(*) filter (where student_id is null),
       count(*) filter (where payment_method::text='stripe'), 0,
       sum(coalesce(nullif(refunded_amount_cents,0), paid_amount_cents, unit_price_cents_at_purchase,0))/100.0,
       string_agg(distinct payment_status::text||'/'||coalesce(refund_status,'-'), ',')
from event_purchases, w where refunded_at >= w.s group by 1,2
union all
select 'refunded_status_no_refunded_at', payment_status::text, count(*), 0,0,0,
       sum(coalesce(paid_amount_cents,0))/100.0, ''
from event_purchases, w
where payment_status::text in ('refunded','partially_refunded') and refunded_at is null
  and purchased_at >= w.s group by 1,2
order by 1,2;

-- Q5: compras de evento pagadas después: cobro en check-in frente a marcado por admin (G', G'')
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select case when checked_in_at is not null
                 and abs(extract(epoch from (checked_in_at - paid_at))) < 120
            then 'collected_at_checkin' else 'admin_mark_paid' end path,
       reception_method, count(*) n,
       count(*) filter (where checked_in_by is not null) n_checked_in_by,
       sum(coalesce(paid_amount_cents, unit_price_cents_at_purchase,0))/100.0 eur,
       min(date(paid_at at time zone 'Europe/Dublin')) first_day,
       max(date(paid_at at time zone 'Europe/Dublin')) last_day
from event_purchases, w
where paid_at >= w.s and paid_at > purchased_at + interval '2 minutes'
group by 1,2 order by 1,2;

-- Q6: penalizaciones (I, I')
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select (db_created_at >= w.s) created_in_window, reason, resolution, count(*) n,
       sum(amount_cents)/100.0 eur, sum(coalesce(credit_deducted,0)) credits,
       count(*) filter (where notes is not null and notes <> '') n_notes,
       count(*) filter (where booking_id is null) n_no_booking,
       min(date(db_created_at at time zone 'Europe/Dublin')) first_day,
       max(date(db_created_at at time zone 'Europe/Dublin')) last_day
from op_penalties, w group by 1,2,3 order by 1 desc,2,3;

-- Q7: correcciones retroactivas, reglas de descuento y claims (L, J, A''')
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select 'bookings_admin_backdated', count(*)::text, min(created_at)::text, max(created_at)::text
  from op_bookings where source='admin_backdated'
union all select 'bookings_note_backdated', count(*)::text, min(created_at)::text, max(created_at)::text
  from op_bookings where admin_note ilike 'Backdated correction%'
union all select 'attendance_note_backdated', count(*)::text, min(created_at)::text, max(created_at)::text
  from op_attendance where notes ilike 'Backdated correction%'
union all select 'penalties_attendance_corrected', count(*)::text, null, null
  from op_penalties where resolution='attendance_corrected'
union all select 'discount_rules_created_in_window', count(*)::text, min(created_at)::text, max(created_at)::text
  from discount_rules, w where created_at >= w.s
union all select 'discount_rules_updated_in_window_not_created', count(*)::text, min(updated_at)::text, max(updated_at)::text
  from discount_rules, w where updated_at >= w.s and created_at < w.s
union all select 'discount_rules_inactive_now', count(*)::text, null, null from discount_rules where not is_active
union all select 'discount_rules_total', count(*)::text, null, null from discount_rules
union all select 'claims_in_window_'||coalesce(source,'?')||'_'||claim_type, count(*)::text, min(claimed_at)::text, max(claimed_at)::text
  from discount_claims, w where claimed_at >= w.s group by source, claim_type
union all select 'claims_released_in_window', count(*)::text, null, null
  from discount_claims, w where released_at >= w.s;

select 'att_backdated',
       status||'|'||coalesce(source,'-')||'|'||coalesce(check_in_method,'-')
       ||'|sub='||(subscription_id is not null)::text||'|booking='||(booking_id is not null)::text
       ||'|class_date='||date, count(*)
from op_attendance where notes ilike 'Backdated correction%' group by 2;

-- Q8: claims cuya suscripción relacionada ya no existe (K, filas borradas)
with w as (select timestamptz '2026-04-23 15:45:00+00' s)
select c.source, count(*) n,
       count(*) filter (where c.related_subscription_id is null) n_no_related,
       count(*) filter (where c.related_subscription_id is not null and ss.id is null) n_related_missing,
       count(*) filter (where ss.id is not null) n_related_exists
from discount_claims c
left join student_subscriptions ss on ss.id::text = c.related_subscription_id, w
where c.claimed_at >= w.s group by c.source order by 1;

-- Q9: heurística de extensiones de caducidad (D)
with w as (select timestamptz '2026-04-23 15:45:00+00' s),
x as (
  select ss.valid_from, ss.valid_until, ss.created_at, p.term_bound,
         coalesce(p.span_terms,1) span_terms, p.duration_days, t.end_date term_end
  from student_subscriptions ss
  left join products p on p.id=ss.product_id
  left join terms t on t.id=ss.term_id, w
  where ss.valid_until is not null and ss.updated_at >= w.s)
select case when term_bound and span_terms = 1 and term_end is not null then 'term_bound_single'
            when term_bound then 'term_bound_multi_or_no_term'
            when duration_days > 0 then 'duration_days' else 'other' end kind,
       count(*) n_updated_in_window,
       count(*) filter (where (term_bound and span_terms=1 and term_end is not null and valid_until > term_end)
                           or (not coalesce(term_bound,false) and duration_days > 0
                               and valid_until > valid_from + duration_days)) n_valid_until_beyond_expected
from x group by 1 order by 1;

-- Q10: marcadores de prueba, actividad entre la última fila y el inicio del fallo,
--      referidos, triggers y tablas payments / wallet_transactions
select count(*) from student_subscriptions
 where coalesce(payment_notes,'')||' '||coalesce(notes,'')||' '||coalesce(payment_reference,'')
       ||' '||coalesce(refund_reason,'') ~* '(\[test\]|#test|test:)';
select count(*) from event_purchases
 where coalesce(notes,'')||' '||coalesce(payment_reference,'')||' '||coalesce(refund_reason,'')
       ~* '(\[test\]|#test|test:)';
select count(*) from op_penalties where coalesce(notes,'') ~* '(\[test\]|#test|test:)';
select count(*) from student_subscriptions
 where created_at >= '2026-04-23 14:49:32+00' and created_at < '2026-04-23 15:45:00+00';
-- (misma forma para paid_at y refunded_at en student_subscriptions,
--  y para purchased_at, paid_at y refunded_at en event_purchases)
select status, count(*) from student_referrals where created_at >= '2026-04-23 15:45:00+00' group by status;
select status::text, count(*) from payments where created_at >= '2026-04-23 15:45:00+00' group by 1;
select tx_type::text, count(*) from wallet_transactions where created_at >= '2026-04-23 15:45:00+00' group by 1;
select c.relname, t.tgname, p.proname
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
join pg_namespace ns on ns.oid=c.relnamespace
where not t.tgisinternal and ns.nspname='public'
  and c.relname in ('student_subscriptions','event_purchases','discount_rules','op_penalties',
                    'op_bookings','op_attendance','payments','wallet_transactions','student_referrals');
```

## 7. Limitaciones

- **Cifras derivadas, no auditoría.** Reflejan el estado a 2026-09-29 de las filas que seguían existiendo. Un conteo puede sub-representar eventos (filas borradas, ediciones repetidas) o atribuir un evento a un flujo por heurística (notas, `assigned_by`, diferencias de tiempo de más de 2 minutos).
- **La clasificación por canal es heurística.** "Autocompra" se define como `assigned_by = student_id`. "Pagado después" se define como `paid_at > created_at + 2 min`. Los pagos marcados en los primeros 2 minutos tras el alta se cuentan como parte del alta.
- **Importes:** se usa `price_cents_at_purchase` para suscripciones y `paid_amount_cents` (o `unit_price_cents_at_purchase` como respaldo) para compras de evento. No se han conciliado con Stripe.
- **`updated_at`** solo tiene trigger en `student_subscriptions` y `payments`. En ningún caso prueba un evento financiero. En `discount_rules` no se mantiene al editar.
- **Hora de inicio del fallo:** se toma la hora del commit `a9b66d1`. La hora real de despliegue no se ha verificado. No afecta a las cifras porque, entre las filas que siguen existiendo, no hubo actividad entre las 15:49 y las 16:45 (Dublín) del 2026-04-23, y la siguiente actividad es del 2026-05-07.
- **Logs de la plataforma:** los mensajes `[op-persistence] saveAuditEntry:` de los logs del servidor podrían contener rastros parciales, pero no se han consultado ni se ha comprobado su retención.
- **Correcciones retroactivas:** no se ha verificado su origen (despliegue o entorno local conectado a producción). Sí está verificado que esas 2 correcciones no consumieron un crédito adicional (§4.L).
- **Reintento de auditoría de correcciones retroactivas:** el fix `822481c` añade un botón "Retry audit" que puede escribir a posteriori la entrada de auditoría de una corrección. Si se usa para las 2 correcciones del 2026-09-29, esas entradas se escribirán después del hecho y deberían distinguirse de un registro contemporáneo.
- **El documento no modifica datos.** Las únicas escrituras en producción asociadas a este incidente son las del 2026-09-30 (§8). La escritura con identidad completa quedó verificada el 2026-09-30 para las correcciones retroactivas (§8.4). El resto de flujos sigue pendiente (§9).

## 8. Acciones del 2026-09-30

Horas en UTC (Dublín = UTC+1).

1. **Comprobación previa de salud (08:13):** REST y Auth respondían `200` en 0,2–1,0 s (5 intentos cada uno). Postgres llevaba 12 h 44 min en marcha, sin consultas largas. Los 5xx en el edge entre las 08:00 y las 08:15 fueron 12 de 318 peticiones (≈3,8 %).
2. **Migración `00047` (08:13):** se ejecutó el SQL de `supabase/migrations/00047_finance_audit_identity.sql` sin cambios, dentro de una transacción con `lock_timeout = 5s`, mediante `execute_sql` del MCP de Supabase. No se registró en `supabase_migrations.schema_migrations`, que solo contiene 00001–00022 y está desincronizado. No se aplicó ninguna otra migración.
   - `information_schema.columns`: `performed_by_user_id`, `performed_by_email` y `performed_by_name` son `text` y `performed_at` es `timestamptz`, las cuatro con nulos permitidos. La tabla pasa a tener 14 columnas.
   - `pg_indexes`: `idx_finance_audit_performed_by_user` (btree sobre `performed_by_user_id`) existe, y `pg_index` lo marca como válido y listo.
   - REST (08:14:08–08:14:16): `op_finance_audit_log?select=id,performed_by_user_id,performed_by_email,performed_by_name,performed_at&limit=1` devolvió `200` tres veces (0,24–0,33 s), con las cuatro columnas a `null` en la fila existente.
   - Salud posterior: Auth, REST y `/login` de la app respondieron `200` en menos de 0,5 s. La tabla sigue con 5 filas.
   - **Esto no confirma que la auditoría funcione.** Solo confirma que el esquema ya acepta el payload (§9).
3. **Desactivación de `BPM_TEST_100` (08:15:56):** se confirmó que es exclusivamente un código de QA:
   - El nombre es "Internal QA — 100% off event ticket" y la descripción lo define como código interno de pruebas.
   - Lo crea la migración `00074_internal_test_promo_code.sql` para QA.
   - Sus 2 únicos usos son compras de invitados de prueba a 0 € (§4.F).
   - Ninguna otra tabla lo referencia.

   Se ejecutó `UPDATE discount_rules SET is_active = false, updated_at = now()` filtrando por su `id` y su `code`. La regla se conserva con sus 13 productos, `max_uses = 20` y el resto de campos intactos, y las 2 compras no se modificaron. El repositorio Supabase de reglas lee de la BD sin caché, así que la desactivación tiene efecto inmediato. Esta acción no generó entrada en `op_finance_audit_log` porque no se hizo a través de la app.
4. **Verificación de la auditoría con identidad completa (fixture C).**
   - **Preparación (08:20 UTC):** se creó un pase de prueba Beginners 1 Bachata (4/4 créditos, marcado con `metadata.qa_fixture = audit-identity-00047-fixture-c`) para la cuenta de pruebas Zaria Test. La clase elegida fue Bachata Beginners 1 del 2026-09-26, que no tenía reservas, asistencias, lista de espera ni penalizaciones. Base de partida: 5 filas de auditoría, ninguna `fal-bd-…`.
   - **Ejecución (08:23:12 UTC):** un administrador hizo la corrección una sola vez desde "Add past attendee" en la UI de producción. La UI no mostró aviso de auditoría; hizo falta recargar para ver la asistencia.
   - **Verificación en BD:**
     - **Auditoría:** apareció exactamente 1 fila nueva (6 en total). Su id es `fal-bd-…` y coincide con la codificación inyectiva de la reserva, la asistencia y `marked_at` creadas. `entity_type = subscription`, `entity_id` es el pase del fixture y `action = manual_edit`.
     - **Identidad:** `performed_by_user_id`, `performed_by_email`, `performed_by_name` y `performed_at` están rellenos. Corresponden al usuario de la tabla `users` de la cuenta de administración de la academia, y coinciden con `adminId` y `adminEmail` del metadata. `performed_at` (08:23:12.357) es posterior a la reserva (.024) y a la asistencia (.186).
     - **Sin modo degradado:** el reintento degradado omite precisamente esas cuatro columnas, y aquí están todas rellenas.
     - **Metadata:** coherente con la operación: `bookingCreated`, `attendanceCreated` y `creditConsumed` a true, saldo previo 4 y nuevo 3, `penaltiesVoided = 0`.
     - **Datos operativos:** 1 única reserva (`source = admin_backdated`, `checked_in`), 1 única asistencia (`present`, nota "Backdated correction: …") y el pase en 3/4. No hubo penalizaciones, lista de espera, notificaciones, claims, pagos ni movimientos de wallet asociados.
   - **Limpieza (después de las 10:17 Dublín):** en una sola transacción con guardas, que se revierte si algún recuento no coincide, se borraron exactamente la fila de auditoría del fixture, su asistencia, su reserva y su pase. Antes se comprobó que ninguna tabla con clave foránea hacia suscripciones (`payments`, `wallet_transactions`, `bookings`, `student_subscriptions.renewed_from_id`, `referral_rewards`) referenciaba el pase.
     - **Después del borrado:** `op_finance_audit_log` vuelve a 5 filas, sin ninguna `fal-bd-…`. La clase y Zaria Test quedan con 0 reservas y 0 asistencias. Se conservan la cuenta Zaria Test y su pase anterior (cancelado).
     - **Consecuencia:** la entrada que demostró la corrección ya no está en la tabla. La evidencia queda en este apartado.

## 9. Comprobaciones pendientes

Ninguna de estas comprobaciones ha modificado datos. No se ha ejecutado ningún reembolso.

1. **Reembolso de 90 € sin campos de reembolso** (§4.C/E). Se localiza con:
   ```sql
   select * from student_subscriptions
   where payment_status = 'refunded' and refunded_at is null
     and created_at >= '2026-04-23 15:45:00+00';
   ```
   Pendiente:
   - Buscar su `payment_reference` en Stripe para saber si hubo cargo y si existe un reembolso real (fecha, importe, autor en Stripe).
   - Si existe, decidir si se completan `refunded_at`, `refund_reason` y `stripe_refund_id`.
   - Identificar qué camino dejó la fila en `refunded` sin esos campos.
2. **3 pagos Stripe sin actor, 255,00 €** (§4.C/C'). Se localizan con:
   ```sql
   select * from student_subscriptions
   where paid_at >= '2026-04-23 15:45:00+00' and paid_at > created_at + interval '2 minutes'
     and payment_method = 'stripe' and collected_by is null
     and coalesce(payment_notes,'') not ilike '%via QR check-in%';
   ```
   Pendiente:
   - Conciliar cada `payment_reference` con Stripe (cobro real, importe y fecha).
   - Determinar si los marcó el webhook o una persona, y en ese caso quién.
3. **Reanudación de la auditoría en el resto de flujos.** Las correcciones retroactivas ya están verificadas con identidad completa (§8.4). Los otros call sites de `logFinanceEvent` (§3) escriben en segundo plano sin esperar el resultado. Con `00047` aplicada deberían persistir, pero no se han probado uno a uno. Pendiente: confirmar que la primera acción financiera real de cada tipo relevante (alta, marcar pagado, reembolso) genera su fila con identidad completa.
4. **Origen de las 2 correcciones retroactivas del 2026-09-29** (despliegue o entorno local contra producción).
5. **4 suscripciones referenciadas por claims que no existen** (§4.K): averiguar si llegaron a existir, quién las borró y si el borrado era legítimo. Es posible que no haya fuente que lo permita.
