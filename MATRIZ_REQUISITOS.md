# Matriz de requisitos

**Todos pendientes de implementación y verificación.** Una fila se marca terminada solo cuando existe evidencia ejecutada; escribir una prueba sin correrla no cierra el requisito. B = backend; F = frontend; I = integraciones; A = análisis SQL/incidente; C = coordinador; Q = revisor. C integra y el candidato comprende lo entregado.

Ubicaciones son destinos propuestos en el repositorio futuro. Los IDs de prueba se describen en [PRUEBAS_Y_ACEPTACION.md](PRUEBAS_Y_ACEPTACION.md). Cualquier cambio de alcance se registra en README, no se borra de esta matriz.

| ID | Exigencia del PDF | Responsable | Evidencia / aceptación |
| --- | --- | --- | --- |
| R01 | Un proyecto de reservas compartido por las partes 1 y 2 | C | Árbol del repo; API y chat usan los mismos servicios |
| R02 | React, Node y TypeScript en front/back | C | Build + typecheck; sin segunda API en otro lenguaje |
| R03 | PostgreSQL y migraciones versionadas | B | M01: migrar una DB vacía y ejecutar seed |
| R04 | POST /api/quotes con sala, fecha, hora y duración | B/F | Q01–Q13; pantalla usa endpoint real |
| R05 | Tarifas pequeña 40.000, mediana 70.000, grande 120.000 COP | B | Q01, Q02 |
| R06 | Duración 1–10 h en bloques de 30 min | B | Q03; límites 60/600 y rechazos |
| R07 | Lunes–sábado 07:00–21:00; domingo cerrado | B | Q04, Q05, Q10 |
| R08 | Descuento 10 % desde 4 h; 20 % desde 8 h | B | Q06; fronteras 3,5/4/7,5/8 |
| R09 | Sábado +25 % después del descuento | B | Q07 con oráculo numérico |
| R10 | No cruzar reserva confirmada de misma sala | B | Q08; otra sala no bloquea |
| R11 | Desglose base, descuento, recargo y total | B/F | Q01/Q07 y tarjeta visible |
| R12 | Explicar por qué no se puede reservar | B/F | Q09/Q10; mensaje y reasonCode |
| R13 | Sugerir siguiente horario disponible del mismo día | B/F | Q09/Q10; misma duración y sin inventar cupo |
| R14 | Wizard de tres pasos y sala/horario prellenados | F/B | U01; datos de quote aparecen en paso 2 |
| R15 | Servicios adicionales proyector y café | F/B | Q11/U01; supuesto de precio identificado |
| R16 | Guardar cada paso y retomar tras cerrar navegador | F/B | U02; datos del servidor tras nueva sesión |
| R17 | draft → confirmed → completed o cancelled | B | B01/B02; matriz de transiciones |
| R18 | Validar transiciones en backend | B | B02 con petición HTTP directa inválida |
| R19 | Dos clientes/sala/horario: solo uno confirma | B | B03 con conexiones independientes y conteo DB |
| R20 | Repetir confirmación no duplica ni recalcula precio pactado | B | B04/B05/B08; mismo ID y snapshot |
| R21 | Explicar ambas garantías en README | C | Sección con transacción, locks y restricción + comandos |
| R22 | Admin: listado paginado | B/F | U03; más filas que pageSize y orden estable |
| R23 | Admin: filtros por estado y sala | B/F | U03; aplicar ambos a la vez |
| R24 | Admin: detalle y cancelación con motivo obligatorio | B/F | B06/U03; blanco se rechaza en servidor |
| R25 | Autenticación simple; cliente y admin sembrados | B | S01/M01; login y roles reales |
| R26 | Validación de entradas del servidor | B/I | S02; JSON manipulado, UUID, fechas, status y cantidades |
| R27 | Pruebas unitarias del cotizador | B | Suite Q; resultados numéricos esperados independientes |
| R28 | Pruebas unitarias de transiciones | B | Suite B01/B02; tabla exhaustiva 4×4 |
| R29 | Correo al pasar a confirmed, visible localmente | I/F | E01; destinatario/asunto/cuerpo en admin |
| R30 | Correo en segundo plano sin esperar envío | I/B | E02; worker detenido y confirmación exitosa |
| R31 | Hasta cinco reintentos con espera creciente | I | E03; 6 intentos máximos según supuesto documentado |
| R32 | Failed después de agotarse y visible al admin | I/F | E03/U03; intentos, error y failed |
| R33 | Un correo incluso con reintentos y confirmaciones simultáneas | I/B | E04/E05 + B03/B04; una captura y un evento |
| R34 | Chat en la app con API de IA | I/F | A01; prueba manual real, proveedor/modelo registrados |
| R35 | Preguntar faltantes y no inventar datos | I | A02/A03; no inferir hora/duración/extras desconocidos |
| R36 | Mostrar cotización y disponibilidad del cotizador | I/F | A04; valores provienen de Quote, no de prosa LLM |
| R37 | Proponer alternativa cuando no hay cupo | I/F | A05; validar aceptación antes de cambiar horario |
| R38 | Crear draft prellenado; confirmar solo con botón | I/F | A06; chat deja draft, botón llama confirm |
| R39 | El asistente nunca calcula precios/disponibilidad | I | A04/A07; salida LLM excluye esos campos |
| R40 | Nunca confirma/cancela ni ve reservas ajenas | I/B | A07/A08 + S03; sin herramientas privilegiadas |
| R41 | Ignorar instrucciones que cambien las reglas | I | A07; ataques y explicación de límites de capacidad |
| R42 | Prompt en archivo propio | I | `apps/api/src/prompts/booking-assistant.md` versionado |
| R43 | Validar salida del modelo con esquema antes de usarla | I | A09; JSON/campos desconocidos no cambian datos |
| R44 | Resolver fechas relativas en código | I | A03; reloj fijo y zona Colombia |
| R45 | Retomar conversación al recargar | I/F | A10/U02; historial, slots y draft no duplicados |
| R46 | README explica cómo se garantiza regla 4 del asistente | C/I | Sección de capacidades/validación/autorización y pruebas |
| R47 | consultas.sql; una respuesta por punto con comentarios pertinentes | A | D01–D05; archivo raíz probado con DDL original |
| R48 | SQL 1: completed vencidas >30 días con saldo y agregados por cliente | A | D01; pagos múltiples, impagada y frontera temporal |
| R49 | SQL 2: solapamientos confirmed/completed, un par por fila | A | D02; `a.id < b.id` y extremos contiguos |
| R50 | SQL 3: horas/ingresos, sala×mes, 12 meses y Colombia, ceros | A | D03; 12×n salas, cambio de mes local/UTC |
| R51 | SQL 4: total/líneas o paid/pagos, una fila y ambas causas | A | D04; evitar multiplicación por joins |
| R52 | SQL 5: índices y comprobación, máximo cinco líneas | A | D05; cinco líneas de respuesta y plan de medición |
| R53 | INCIDENTE.md, máximo dos páginas; método | A/C | I01; cuatro respuestas y render final comprobado |
| R54 | Incidente: hipótesis y consultas/logs para validarla | A | I01; reloj de expiración vs ventana horaria como hipótesis |
| R55 | Recuperar afectados sin duplicar, sin confirmados y en horario | A | I02; dedup, revalidación y ventana al momento de enviar |
| R56 | Prueba antes de producción y responsables de aprobación | A | I02; dry-run, ensayo, canario y aprobación explícita |
| R57 | Cambio de fondo y detección temprana | A | I03; next_eligible_at, TTL efectivo y alertas segmentadas |
| R58 | Mensaje de cuatro líneas para equipo comercial | A | I04; cuatro líneas y ninguna promesa no comprobada |
| R59 | Repositorio GitHub con proyecto y acceso al evaluador | C/candidato | Entrega: URL y acceso comprobados cuando se autorice publicar |
| R60 | README: correr local, decisiones y omisiones justificadas | C | M01 + lista de alcance real; comandos ejecutados |
| R61 | Sección Uso de IA con herramienta, partes y corrección real | C/candidato | Bitácora auténtica; no inventar un error para cumplir |
| R62 | Incluir archivo de instrucciones si se usa | C | `AGENTS.md` (instrucciones Codex) y versionado en el repo final |
| R63 | Historial real de commits pequeños | Todos/C | Commits por hitos, con mensajes y cambios reales |
| R64 | Candidato puede explicar y modificar cada línea | C/candidato | Ensayo de 45 min y pequeño cambio con pruebas |
| R65 | Ambigüedades decididas y escritas | C | Tabla de supuestos del README derivada de este plan |
| R66 | Claves de APIs en entorno, nunca repositorio | Todos/C | S04; `.env.example` sin valores reales y revisión de historial |
| R67 | Bonus Rails opcional, hasta 5 puntos | A | X01; explicación y corrección de callback/idempotencia |

Requisitos de soporte añadidos para que la implementación sea verificable: control de versiones de drafts, claves de deduplicación, fixture de segundo cliente en pruebas, evidencia de DB real para concurrencia y revisión de instalación limpia. No se atribuyen esos mecanismos específicos al PDF; son la forma propuesta de cumplir sus resultados.
