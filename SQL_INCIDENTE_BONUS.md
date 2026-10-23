# Guía unificada de SQL, incidente y bonus

## Parte 3: método y decisiones

Crear `consultas.sql` en la raíz del repositorio final. Debe contener las cuatro consultas y, para el punto 5, una respuesta de máximo cinco líneas, por ejemplo dentro de comentarios SQL. El DDL de fixtures conserva exactamente tablas/tipos del PDF. Los datos de ejemplo prometidos por el evaluador están pendientes: usar fixtures propios ahora y volver a ejecutar cuando lleguen; no presentarlos como los oficiales.

Mantener el esquema de Parte 3 en una base separada del de la app. En SQL 1/4, preagregar pagos y líneas por reserva **antes de unirlos** para evitar multiplicar importes. `COALESCE` trata una colección sin filas como suma cero. Usar aritmética numeric y límites temporales explícitos.

| Prueba | Diseño de respuesta | Fixtures que deben probar el resultado |
| --- | --- | --- |
| D01 | Filtrar completed con `ends_at < reference_now - interval '30 days'`, calcular total−SUM(payments), conservar saldos positivos y agregar por cliente. Días desde el fin más antiguo de las reservas que cumplen. Orden por saldo DESC y desempate estable. | Reserva sin pagos; dos pagos para una reserva; reserva pagada/sobrepagada; fin exacto de 30 días que se excluye; mismo cliente con deuda vieja y reciente; excluir cancelled/confirmed. No compensar deuda con sobrepago de otra reserva. |
| D02 | Autojoin por room_id, `a.id < b.id`, ambos status elegibles; solapamiento estricto `a.starts_at < b.ends_at AND b.starts_at < a.ends_at`. | Tres reservas superpuestas; pares sin espejo; una contigua; una de otra sala; draft/cancelled excluidas. |
| D03 | Generar 12 meses locales y CROSS JOIN con rooms; LEFT JOIN a agregación de confirmed/completed. Agrupar el inicio por mes en America/Bogota; sumar duración real en horas y total de reserva; ceros para meses vacíos. | n salas da 12×n filas; sala sin reservas; hora UTC que aún es mes anterior en Colombia; reserva que cruza mes; duración fraccionaria y año bisiesto si aplica. |
| D04 | Dos agregaciones por booking_id, left joins a bookings; flags `lines_mismatch` y `paid_not_covered`; filtrar OR y emitir una fila por reserva. Solo aplicar segunda regla si payment_status='paid'. | Sin líneas/pagos; varias líneas y varios pagos; total cero; paid parcial; unpaid parcial que no falla segunda regla; ambas fallas simultáneas; sobrepago que sí cubre total. |
| D05 | Proponer índices por booking_id sobre payments y booking_lines, evaluar INCLUDE(amount) según plan y carga. Comparar EXPLAIN (ANALYZE, BUFFERS) antes/después con datos representativos y estadísticas. | Respuesta ≤5 líneas; no afirmar que índice garantiza mejora ni inventar benchmarks de cinco millones. Una agregación completa puede seguir prefiriendo scan secuencial. |

**Supuesto de D03:** “últimos 12 meses” = mes actual hasta reference_now más los once anteriores, usando límites locales convertidos a timestamptz; se excluyen inicios futuros. Se atribuye el total y las horas de una reserva al mes de su inicio. Esto evita prorratear ingresos sin una regla contable provista. Declararlo en comentario breve en consultas.sql y README. Si se confirma que se espera prorratear horas entre meses, actualizar D03 y sus fixtures antes de cerrar. No cambiarlo silenciosamente según los datos.

Índices no se aplican a producción en este ejercicio. Si se comenta una futura creación concurrente, explicar su contexto sin extender la respuesta requerida más de cinco líneas. La [documentación de EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html) permite revisar el plan real y buffers; la comprobación debe registrar las condiciones de ejecución, no solo el costo estimado.

## Parte 4: contenido de INCIDENTE.md

No implementar WhatsApp. Escribir una respuesta de máximo dos páginas orientada a método y recuperación segura. Objetivo: 700–850 palabras como límite de trabajo, pero **comprobar las páginas en un render**; el conteo de palabras no garantiza dos páginas. Fuente legible, sin reducir artificialmente el tamaño. Entregar el Markdown requerido; un PDF de revisión es opcional y no lo sustituye.

**I01 — Hipótesis y validación.** El TTL de dos horas probablemente corre también cuando el envío está prohibido. Un recordatorio creado tarde puede llegar al vencimiento durante la noche antes de la próxima ventana de 08:00. El 92 % sugiere esta explicación pero no demuestra causalidad. Además, el rango después de las 17:00 incluye casos que sí podrían enviarse antes de las 18:00: investigar elegibilidad inicial, primer intento, frecuencia real del job, errores y zona horaria.

Solicitar esquema/semántica antes de escribir SQL ejecutable. Revisar por recordatorio: created_at, scheduled/eligible_at, next_attempt_at, attempted_at, expired_at, status, booking_status, timezone, provider_message_id/dedup_key y resultado del proveedor. Comparar cohortes por hora local de creación, primer horario legal y vencimiento; revisar logs de ciclos 17:00–19:30 y 07:30–09:00. Buscar confirmaciones previas, ausencia de intentos y entregas sin ack. Las consultas del escrito pueden ser pseudocódigo si no se suministra el esquema, identificado como tal.

**I02 — Recuperación.** Preparar dry-run de candidatos: expired por este patrón, reserva todavía draft, cliente válido y sin envío confirmado de esa campaña. Antes de reintentar, reconciliar casos de entrega incierta con el proveedor; no reemitirlos ciegamente. Crear campaña de recuperación con clave única estable por reserva/tipo de recordatorio y auditoría; no resetear masivamente a pending ni borrar evidencia.

En cada despacho, volver a comprobar estado draft, dedup, consentimiento/política existente y hora actual de Colombia dentro de la ventana permitida. Resolver la carrera confirmación/envío en el punto de autorización del despacho usando bloqueo/transacción o coordinación equivalente; documentar que un WhatsApp ya aceptado por un proveedor no puede deshacerse si el cliente confirma después. Buscar la garantía operativa correcta: no autorizar envíos para reservas que ya estaban confirmadas en ese punto. Ante un estado incierto del proveedor, reconciliar antes de reintentar.

Probar con copia anonimizada/staging y reloj simulado: noche, borde 08:00/18:00, reejecución de campaña, confirmación concurrente, proveedor que falla y envío aceptado sin ack. Revisar una muestra humana, ejecutar canario en horario y definir rollback/pausa. Requiere aprobación de responsable técnico/operación y del responsable comercial/producto de la campaña antes de tocar producción o contactar clientes. No atribuir nombres reales que no se conocen.

**I03 — Cambio de fondo.** Persistir próximo horario elegible; separar espera por política de fallo de entrega. Definir con producto si el TTL cuenta desde la primera elegibilidad o acumula solo minutos hábiles; nunca consumir automáticamente todo el TTL durante una ventana prohibida. Añadir pruebas de reloj a esa política. Métricas: proporción expired por cohorte de creación, edad de pendientes elegibles, entrega exitosa y duplicados; alertas por caída de conversión/entrega y acumulación nocturna antes de esperar quejas.

**I04 — Mensaje comercial de cuatro líneas.** Usar cuatro líneas explícitas y contenido fiel al estado real. Propuesta para adaptar, sin prometer una recuperación ya ejecutada:

```text
Identificamos un posible problema con los recordatorios creados al final del día.
Estamos validando cuáles vencieron antes de poder enviarse en el horario permitido.
Prepararemos una recuperación revisada, sin repetir mensajes ni contactar reservas ya confirmadas.
Les compartiremos el alcance confirmado y el plan antes de activar los reenvíos.
```

## Bonus Rails, X01

Analizar el callback: cualquier save mientras status sea confirmed vuelve a destruir y construir factura. No depende de una transición, puede cambiar el importe pactado, perder identidad/datos de factura y producir efectos repetidos. El análisis debe distinguir persistencia de la factura, efectos externos y concurrencia.

Proponer creación única al confirmar con condición real de transición, sin destruir factura existente, índice único por booking_id y un snapshot financiero inmutable. Si hay integración de facturación externa, dispararla después de commit mediante un evento durable y una clave idempotente. No sugerir que `after_commit` o un chequeo Ruby por sí solos evitan todas las carreras. Versiones de Rails y nombres concretos de dirty tracking se verifican en documentación oficial al implementar; esta planeación no fija código Ruby no comprobado.

No construir un módulo de facturas para la app TypeScript. Una respuesta breve y defendible completa este bonus opcional.
