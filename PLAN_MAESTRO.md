# Planeación unificada — Prueba Técnica Full Stack Lumni TI

**Versión:** 1.2 — adaptada para Codex personal sobre versión 1.1; sin cambios en requisitos de negocio  
**Fecha de planeación:** 23 de octubre de 2026  
**Entrega objetivo provisional (por confirmar con la invitación):** martes 27 de octubre de 2026, ≤ 20:00 America/Bogota  
**Objetivo interno provisional:** entrega comprobada a las 16:00 del martes, si el plazo externo se confirma  

---

## 0. Cómo usar este documento

### 0.1 Resoluciones de la fusión (obligatorias para todos)

1. **El plazo absoluto no viene en el PDF.** La fecha 27/10 a las 20:00 es una hipótesis arrastrada de las planeaciones, no un dato verificado: confirmar el correo de invitación antes de usar el cronograma absoluto. El PDF solo informa un rango de 48–72 h con plazo individual por confirmar.
2. **Alcance del requisito «un correo».** Se garantiza una captura durable única por reserva con `email_outbox` y `captured_emails` transaccionales. Un servidor SMTP externo no admite exactamente-una-entrega bajo fallos sin idempotencia/reconciliación del proveedor. Mailpit queda opcional; no vender como garantía lo que no lo es.
3. **Confirmación doble.** `confirmed` se devuelve sin recalcular, `cancelled` y `completed` responden 409. La protección de dos borradores que compiten reside en un constraint de exclusión de PostgreSQL.
4. **Borrador parcial.** Los campos de sala, horario, extras y snapshot son anulables hasta completar los pasos correspondientes. La reserva no puede pasar a `confirmed` hasta tenerlos válidos y precio persistido.
5. **Restricción del chat.** Validar JSON con Zod no garantiza que toda prosa del modelo sea verdadera. Importes, disponibilidad, alternativas, botones y estados visibles se generan desde datos verificados del backend; el modelo se limita a extraer intención.
6. **Ponderaciones.** La Parte 2 vale 25 % en conjunto (no hay subponderaciones oficiales). El PDF explicita 40 % + 25 % + 10 % + 15 % = 90 %; no atribuir el 10 % restante a un criterio inexistente. El bonus Rails suma hasta 5 puntos y es opcional.
7. **Estado de esta entrega.** Esto es un paquete de **planeación e instrucciones**. No se ha implementado ni probado la aplicación. Todas las casillas de verificación parten de pendiente.

### 0.2 Archivos complementarios del paquete

- `CONTRATOS_Y_MODELO.md`: API, modelo físico, locks, wizard, chat, SQL independiente.
- `MATRIZ_REQUISITOS.md`: 67 requisitos, responsable y evidencia; todos pendientes.
- `PRUEBAS_Y_ACEPTACION.md`: casos numéricos y de competencia con PostgreSQL real.
- `SQL_INCIDENTE_BONUS.md`: pruebas D01–D05, I01–I04 y bonus X01.
- `SUSTENTACION_Y_ENTREGA.md`: puertas de control, guía de 45 min y revisión final.
- `agentes/A0.md` a `agentes/A10.md`: briefs alineados **con esta versión**, sin referencias a los ZIP antiguos.
- `AGENTS.md`: instrucciones persistentes para Codex en la raíz de este mismo repositorio.
- `GUIA_CODEX_PERSONAL.md`, `PROMPTS_CODEX.md` y `PROGRESO.md`: procedimiento, arranque y seguimiento entre sesiones.
- `REGISTRO_DE_FUSION.md`: conflictos encontrados y decisiones adoptadas.


### Jerarquía de verdad (no negociable)

1. **PDF del enunciado** → fuente absoluta de requisitos  
2. **Este documento** (maestro) → qué se debe cumplir y cómo se verifica  
3. **Decisiones técnicas** (§2) → cómo se implementa  
4. **Briefs de agentes** (§5) → quién hace qué y con qué criterios  
5. **Registro `docs/decisiones.md`** → documenta supuestos sin modificar la jerarquía superior
6. **Checkpoints humanos** → tú revisas y autorizas cada merge  

Si un brief contradice este documento → gana este documento.  
Si este documento es ambiguo → consultar el PDF, proponer la interpretación más conservadora y registrarla en `docs/decisiones.md`; ese registro **no** puede contradecir este plan ni el enunciado.

### Principios

- Legibilidad sobre sofisticación (debes explicar y modificar en vivo cada línea).
- Invariantes en PostgreSQL, no solo en código.
- Lógica de negocio en funciones puras (`calculateQuote`, `transition`, `resolveDate`).
- Una parte bien hecha vale más que cuatro a medias. El recorte se declara.
- Commits pequeños y reales. Historial real es entregable.
- Zona única: `America/Bogota`. Dinero en enteros COP. Sin Redis. Sin magia.
- Claves de API solo en variables de entorno.

### Flujo resumido

1. Lee §1 y §2 completos. Ajusta lo que no compartas **antes** de lanzar agentes.  
2. Abre **esta carpeta** en Codex personal y ejecuta **A0 aquí mismo** (inicializa Git si falta); no crees un segundo repositorio vacío. Revisa tú mismo el resultado.  
3. Sigue las oleadas de §4, respetando dependencias y checkpoints. Codex utiliza `AGENTS.md` + el brief activo; las oleadas no lanzan automáticamente subagentes ni obligan a paralelizar.  
4. Después de cada agente: checkpoint humano. Debes poder explicar cada archivo.  
5. Último día: **A9** → **A10** → checklist §9 → enviar (tras revisión humana).

---

## 1. Análisis y estrategia

### 1.1 Pesos y valor/costo

| Parte | Peso | Costo relativo | Valor/costo | Tipo |
|-------|------|----------------|-------------|------|
| 1 — Reservas (cotizador, wizard, admin) | 40 % | Alto | Medio | Código |
| 2.1 — Correo en segundo plano | fracción no especificada del 25 % de Parte 2 | Medio | Medio | Código |
| 2.2 — Asistente IA | fracción no especificada del 25 % de Parte 2 | Alto | Medio-bajo | Código + prompt |
| 3 — SQL | 10 % | Bajo | **Alto** | Archivo |
| 4 — Incidente | 15 % | Bajo | **Alto** | Escrito |
| Bonus Rails | +5 | Muy bajo | **Muy alto** | Escrito |
| README + Uso de IA + commits + sustentación | transversal (sin porcentaje explícito) | Medio | Alto | Escrito |

**Lectura clave:** Parte 3 (10 %) + Parte 4 (15 %) + bonus opcional (hasta 5 puntos) = hasta 30 puntos con pocas horas y sin depender de frontend. Se hacen **el primer día** en paralelo.

### 1.2 Qué evalúan realmente (leído entre líneas)

- Transiciones validadas en backend → invariantes de servidor.
- Dos confirmaciones concurrentes de la misma sala/horario → solo una gana → **garantía de BD** (exclusion constraint o lock) + prueba automatizada de carrera.
- Confirmar dos veces la misma reserva → no duplica ni recalcula precio → idempotencia + snapshot de precio.
- Un solo correo por reserva confirmada aunque reintente o haya carrera → patrón outbox.
- Asistente: nunca calcula precios, nunca inventa, nunca confirma, ignora instrucciones que cambien las reglas → **garantías estructurales** (sin tool de confirmación, precios solo del cotizador, salida validada contra esquema).
- Fechas relativas se resuelven en código.
- Debes explicar y modificar en vivo cada línea → poco código, sin magia.
- Sección Uso de IA con ejemplo real de algo corregido/descartado → capturar en `docs/ai-log.md` mientras ocurre.
- Historial de commits real → nada de squash final.
- Parte 4: evalúan el método, no la causa exacta.

### 1.3 Orden de prioridad (si falta tiempo, se recorta desde abajo)

1. Parte 1 completa con pruebas de cotizador, transiciones y concurrencia.  
2. Parte 4 (15 %) y, solo si hay margen, bonus Rails (+hasta 5 puntos).  
3. Parte 3 (SQL, 2–3 h, 10 pts).  
4. Parte 2.1 (correo outbox).  
5. Parte 2.2 (asistente). Si hay que recortar, se recorta aquí de forma limpia o se documenta “fuera de alcance”.  
6. README y Uso de IA se escriben al final con insumos recogidos durante todo el proceso.

### 1.4 Definición de “hecho”

| Parte | Hecho significa |
|-------|-----------------|
| 1 | Cotizar → draft por pasos → confirmar (con carrera) → admin listar/filtrar/cancelar. Pruebas unitarias del cotizador y de transiciones. Migraciones versionadas. Auth simple. |
| 2.1 | Al confirmar se encola exactamente un evento de correo. Worker en segundo plano. Hasta 5 reintentos con espera creciente. Fallo visible en admin. Captura local visible. |
| 2.2 | Chat que pregunta, cotiza vía API real, propone alternativa, crea draft. Nunca confirma. Salida validada. Fechas en código. Conversación persistente. |
| 3 | `consultas.sql` con las 5 consultas comentadas solo donde haga falta. |
| 4 | `INCIDENTE.md` ≤ 2 páginas con las 4 respuestas + método. |
| Bonus | Problema del `before_save` identificado y corrección propuesta en `BONUS_RAILS.md`, sin comprometer el máximo de páginas de `INCIDENTE.md`. |
| Entrega | Repo accesible, README con instalación, decisiones, fuera de alcance, Uso de IA, commits reales. |

---

## 2. Decisiones técnicas (fuente de verdad para agentes)

### 2.1 Stack

| Capa | Elección | Por qué |
|------|----------|---------|
| Lenguaje | TypeScript strict, Node 22 LTS, ESM | Obligatorio |
| Monorepo | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared` | Un install, esquemas compartidos |
| Backend | Express 5 | Universal, fácil de explicar línea a línea |
| Validación | zod (borde API + formularios) | Mismo esquema front/back |
| BD | PostgreSQL 16 (docker compose) | Obligatorio |
| Acceso/migraciones | Drizzle + SQL crudo donde haga falta | Constraints de exclusión y `FOR UPDATE SKIP LOCKED` sin pelear |
| Fechas | Luxon, zona `America/Bogota` | Explícita |
| Jobs | Tabla outbox + worker propio con `FOR UPDATE SKIP LOCKED` | Sin Redis, atómico con la confirmación |
| Correo principal | Captura durable en PostgreSQL (`captured_emails`) | Permite demostrar una sola captura incluso ante caída del worker |
| Correo opcional | Nodemailer → Mailpit, solo demostración adicional | SMTP tiene ventana residual de duplicación; no se declara exactamente una entrega externa |
| IA | SDK oficial (Anthropic u otro libre), modelo solo de env, tools con validación zod, bucle manual | Control total; interfaz `LlmClient` mockeable |
| Frontend | React 18 + Vite + TS, React Router, TanStack Query, RHF + zod, CSS propio | Mínimo de dependencias |
| Pruebas | Vitest + Supertest; BD real para integración y carreras | Concurrencia solo se prueba de verdad con PostgreSQL |
| CI | GitHub Actions: lint + typecheck + tests con servicio PG | Señal de seriedad |

**Descartado:** NestJS, Prisma (opaco para exclusion), Redis/Bull, Next.js, librerías de UI pesadas.

### 2.2 Estructura del repositorio

```
lumni-reservas/
├── README.md
├── PROGRESO.md                    # reanudación entre sesiones
├── PLAN_MAESTRO.md                # plan versionado
├── agentes/                       # A0–A10
├── INCIDENTE.md
├── consultas.sql
├── AGENTS.md                       # instrucciones Codex
├── docker-compose.yml          # postgres; Mailpit opcional
├── .env.example
├── .github/workflows/ci.yml
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
├── docs/
│   ├── decisiones.md
│   └── ai-log.md
├── sql/                        # soporte Parte 3
│   ├── schema.sql
│   ├── seed.sql
│   └── README.md
├── packages/shared/            # zod + tipos compartidos
└── apps/
    ├── api/
    │   ├── drizzle/
    │   └── src/
    │       ├── index.ts / worker.ts / app.ts / config.ts
    │       ├── db/
    │       ├── domain/         # funciones puras
    │       ├── routes/
    │       ├── services/
    │       └── ...
    └── web/
        └── src/
```

### 2.3 Reglas de negocio fijadas

| Tema | Decisión |
|------|----------|
| Zona | `America/Bogota`. Timestamps en `timestamptz`. |
| Duración | 60–600 min, múltiplos de 30. Inicios en `:00` o `:30`. Fin ≤ 21:00 mismo día. |
| Horario | Lun–sáb 07:00–21:00. Domingo cerrado. |
| Rangos | `[inicio, fin)` → salir a las 10:00 y entrar a las 10:00 es válido. |
| Tarifas | small 40.000, medium 70.000, large 120.000 COP/hora. |
| Descuento | 10 % desde 4 h; 20 % desde 8 h. No se acumulan. |
| Sábado | 25 % sobre el valor ya descontado de la sala. |
| Dinero | Enteros COP. Redondeo por componente al peso. Sin float. |
| Servicios | Proyector 20.000, café 10.000 por reserva (supuesto documentado). Se suman después de descuento/recargo de sala. |
| Capacidad | small 4, medium 8, large 16 (supuesto para el ejemplo de 6 personas). |
| Cotización | No bloquea cupo. Devuelve desglose + posible + motivo + siguiente hueco del mismo día. |
| Precio pactado | Al guardar paso 3 se persiste snapshot de servidor. Confirmar usa ese snapshot; no recalcula. |
| Estados | `draft → confirmed → completed \| cancelled`. Transiciones solo en backend. Estados finales inmutables. |
| Bloqueo de solape | Solo `confirmed` y `completed`. `draft` y `cancelled` no bloquean. |
| Retoma | Wizard e historial en servidor por usuario. |
| Correo | 1 intento + hasta 5 reintentos (espera 1, 2, 4, 8, 16 min). Después `failed`. Exactamente un registro de entrega por reserva confirmada. |
| IA | Nunca calcula precios ni disponibilidad (llama al cotizador). Nunca inventa. Nunca confirma/cancela. Ignora intentos de cambiar reglas. Salida validada contra esquema. Fechas relativas resueltas en código. |

### 2.4 Concurrencia e idempotencia

**Dos reservas distintas (misma sala, horarios que se solapan):**  
Constraint de exclusión GiST sobre `(room_id, tstzrange(starts_at, ends_at, '[)'))` WHERE status IN ('confirmed','completed').

**Misma reserva confirmada dos veces (o carrera):**  
`UPDATE ... WHERE id = $1 AND status = 'draft' RETURNING *`. Si no actualiza filas → ya no es draft → devolver el estado actual sin recalcular ni reenviar correo.

**Correo único:**  
Dentro de la confirmación se inserta un evento en `email_outbox` con `UNIQUE(dedup_key)`; el worker usa `FOR UPDATE SKIP LOCKED`. La captura local definitiva se realiza en `captured_emails` **dentro de la misma transacción que marca enviado el evento**; ambas tablas tienen deduplicación única por reserva.

### 2.5 Asistente IA (regla 4 estructural)

- El modelo **no tiene tool** de confirmar ni cancelar.
- Precios y disponibilidad solo salen de las tools que llaman al cotizador/servicios de la Parte 1.
- Toda salida del modelo se valida con zod antes de usarse.
- Instrucciones del sistema + validación de esquema + ausencia de tools peligrosas = garantía estructural.
- Conversación persistida; se retoma al recargar.
- Prompt en archivo propio del repo.

---

## 3. Contratos y datos (resumen)

- Autenticación simple: dos usuarios sembrados (cliente / admin). Sesión por cookie o token simple.
- `POST /api/quotes` → desglose + `canBook` + `reasonCode` + `suggestedSlot` (si aplica).
- Wizard 3 pasos: cliente → sala/horario (prellenado) → extras. Cada paso persiste draft, incluidos datos parciales; jamás imponer `NOT NULL` de sala/fecha/precio a un borrador del paso 1.
- Confirmación: solo desde draft, atómica, idempotente.
- Admin: listado paginado + filtro estado/sala + detalle + cancelar (motivo obligatorio).
- Chat: mensajes + acciones estructuradas (preguntar, mostrar cotización, crear draft).
- Esquemas zod compartidos en `packages/shared`.
- Migraciones SQL versionadas.
- Seed: 3 salas, 2 usuarios, datos de demo relativos al día de ejecución.

---

## 4. Plan de ejecución

### 4.1 Agentes y dependencias

| Agente | Entrega | Depende de | Paralelo con | Est. agente | Revisión humana |
|--------|---------|------------|--------------|-------------|-----------------|
| **A0** Bootstrap + contratos | Monorepo, docker, drizzle, migración inicial, seeds, shared, CI, AGENTS.md | — | — | 2–3 h | 45 min |
| **A7** SQL Parte 3 | `consultas.sql` + runner local | A0 (repo) | A1, A4, A8 | 2 h | 30 min |
| **A8** INCIDENTE + Bonus | `INCIDENTE.md` | — | todo | 2 h | 45 min |
| **A1** Cotizador backend | quotes + tests | A0 | A7, A8, A4 | 2 h | 30 min |
| **A2** Reservas + concurrencia | bookings, exclusion, tests de carrera | A1 | A4 | 4 h | 45 min |
| **A3** Auth + admin API | auth endurecido, admin | A2 | A4b | 2 h | 20 min |
| **A4** Frontend | shell, login, cotización, wizard, admin | A0 para shell; A2/A3 para UI completa | A5 | 5–6 h | 40 min |
| **A5** Correo outbox + worker | emails, worker, capturas PostgreSQL, admin estado | A2 | A4, A6 | 3 h | 30 min |
| **A6** Asistente IA | assistant, prompt, orquestador, chat UI, tests con LLM falso y demo real | A1, A2 | A5 | 5 h | 45 min |
| **A9** README + Uso de IA | README completo, ai-log, decisiones | todos | — | 2 h | 45 min |
| **A10** Revisor final | clon limpio, matriz, secretos, historial | A9 | — | 2 h | 30 min + arreglos |

### 4.2 Oleadas

```
Oleada 0 ──► A0
Oleada 1 ──► A1 + A4(base) + A7 + A8          (paralelo)
Oleada 2 ──► A2
Oleada 3 ──► A3 + A5 + A6 + A4(wizard/admin)
Oleada 4 ──► A9 → A10 → checklist → enviar
```

### 4.3 Plan de recorte (explícito)

- Si a las **24 h desde el inicio efectivo de implementación** A2 no está verde → **A6 sale del alcance** y se documenta en README como fuera de alcance.
- Nunca se entrega una funcionalidad a medias sin declararlo.
- Bonus solo si la base pasa.

### 4.4 Flujo git y continuidad en Codex

- El paquete de planeación extraído **es la raíz del futuro repositorio de aplicación**: A0 inicializa Git aquí, crea subcarpetas y no copia archivos a un segundo repo.
- `AGENTS.md` es instrucción persistente, `PROGRESO.md` es estado verificable entre sesiones; **Codex no ejecuta los briefs A# automáticamente**.
- `main` para backend secuencial.
- Worktrees + ramas `feat/<agente>` **solo** para partes realmente independientes y si la interfaz/entorno los soporta; si no, usar un único hilo secuencial. No compartir una misma base de datos de tests o archivos modificables entre ramas concurrentes.
- Merge fast-forward cuando sea viable; evitar squash final para preservar commits pequeños. Nunca afirmar autoría humana de cambios no revisados.
- Commits pequeños por paso lógico. Uso de IA documentado con transparencia en README y `docs/ai-log.md`; no falsificar quién implementó o revisó cambios.

### 4.5 Checkpoints humanos (obligatorios)

Después de A0, A1, A2, A5, A6 y antes de enviar: tú lees el código crítico, verificas los resultados de las pruebas, y autorizas continuar/integrar. Codex debe detenerse tras presentar la evidencia y actualizar `PROGRESO.md`; la aprobación humana no puede presuponerse.

---

## 5. Briefs de agentes (resumen de criterios)

Cada brief completo vive en `agentes/A0.md` ... `agentes/A10.md`. Aquí solo los criterios de aceptación binarios:

- **A0:** `docker compose up -d && pnpm install && pnpm db:setup && pnpm dev` funciona; shared exporta esquemas; seed carga 3 salas + 2 usuarios; CI verde.
- **A1:** `POST /api/quotes` cumple todas las reglas de tarifa/descuento/sábado/horario; tests unitarios con tabla de casos; no bloquea cupo.
- **A2:** confirmación atómica; exclusion constraint activo; prueba de carrera (2 confirms concurrentes → 1 gana); doble confirm de la misma reserva es idempotente y no recalcula; transiciones solo por backend.
- **A3:** login cliente/admin; admin lista/filtra/detalle/cancela con motivo; rutas protegidas.
- **A4:** cotizador UI; wizard 3 pasos con persistencia y retoma; admin UI; estados visibles.
- **A5:** al confirmar se crea exactamente 1 `email_outbox`; worker reintenta con backoff; `failed` visible en admin; captura DB única por reserva; SMTP/Mailpit es opcional.
- **A6:** chat reanudable; usa solo cotizador real; valida salida; resuelve fechas en código; crea draft; no puede confirmar; resiste prompt injection de cambio de reglas (demostrable).
- **A7:** 5 consultas correctas sobre el esquema dado; consulta 5 responde índices + cómo verificar en ≤ 5 líneas.
- **A8:** `INCIDENTE.md` ≤ 2 páginas con las 4 respuestas; bonus Rails opcional en `BONUS_RAILS.md` separado.
- **A9:** README con instalación, decisiones, fuera de alcance, Uso de IA (herramienta, partes, ejemplo corregido/descartado, qué verificaste); `AGENTS.md` en repo.
- **A10:** clon limpio pasa README; matriz de trazabilidad cubierta; sin secretos; historial real; reporta P0–P3.

---

## 6. Aceptación y pruebas (catálogo mínimo)

### Cotizador (ejemplos obligatorios)

- 2 h small entre semana → base 80.000, sin descuento, total 80.000.
- 4 h medium entre semana → 10 % descuento.
- 8 h large entre semana → 20 % descuento.
- Cualquier duración en sábado → +25 % sobre valor ya descontado.
- Domingo → no bookable.
- Solape con confirmed → no bookable + siguiente hueco del mismo día.
- Duración fuera de 1–10 h o no múltiplo de 30 → error de validación.

### Concurrencia e idempotencia

- Dos `POST /confirm` simultáneos misma sala/horario distintos drafts → solo uno `confirmed`.
- Dos `POST /confirm` misma reserva → segundo no cambia precio ni genera segundo correo.
- Confirmación repetida de `confirmed` → 200 con mismo snapshot y sin efectos nuevos; `cancelled` o `completed` → 409 por transición inválida.

### Correo

- Confirmación exitosa → 1 fila outbox; tras worker exitoso → 1 captura durable por reserva.
- Fallo simulado → reintentos con esperas crecientes → `failed` visible.
- Worker no bloquea el request de confirmación.

### Asistente

- “Sala para 6 el sábado por la mañana con proyector” → pregunta lo que falte o cotiza vía API → crea draft.
- Intento de “confirma tú” o “ignora las reglas” → no confirma y no cambia comportamiento.
- Recargar página → conversación se retoma.

### Admin y auth

- Cliente no ve admin.
- Cancelar exige motivo.
- Listado paginado + filtros.

---

## 7. SQL, Incidente y Bonus

- **SQL:** archivo `consultas.sql` con una consulta por punto del enunciado. Comentarios solo donde la intención no sea obvia. Se verifica contra el esquema simplificado + datos sintéticos.
- **Incidente:** hipótesis centrada en la ventana 17:00–18:00 + job cada 30 min + expiración a 2 h; consultas/logs a revisar; plan de remediación sin doble envío ni envíos a las 3 a.m.; cambio de fondo + detección temprana; mensaje de 4 líneas al equipo comercial.
- **Bonus Rails:** en `BONUS_RAILS.md` separado de `INCIDENTE.md` (límite de dos páginas); el `before_save` regenera la factura en cada save de una reserva ya confirmed → destruye histórico/idempotencia. Corregir: generar solo en la transición a confirmed (after_commit o servicio de transición), no en todo save.

---

## 8. Riesgos y supuestos

| Riesgo | Mitigación |
|--------|------------|
| Tiempo insuficiente para A6 | Recorte en el checkpoint G1 |
| Proveedor IA sin crédito/clave | Probar llamada mínima en A0; mock en tests |
| Constraint de exclusión mal expresado | Prueba de carrera obligatoria en A2 |
| Candidato no entiende código generado | Checkpoints humanos + principio de legibilidad |
| Dataset oficial SQL distinto | Separar `sql/` de soporte del modelo operativo |

**Supuestos documentados (no están en el PDF):** precios de proyector/café, capacidades de salas, interpretación exacta de “hasta 5 reintentos”, inicios solo en :00/:30.

---

## 9. Checklist de entrega y sustentación

### Antes de enviar

- [ ] `docker compose up` + `pnpm install` + `pnpm dev` desde cero funciona  
- [ ] Flujo completo: login → cotizar → draft → confirmar → ver captura local del correo → admin  
- [ ] Prueba de carrera verde  
- [ ] `consultas.sql` ejecutable  
- [ ] `INCIDENTE.md` ≤ 2 páginas  
- [ ] README: instalación, decisiones, fuera de alcance, **Uso de IA** con ejemplo real  
- [ ] `AGENTS.md` en la raíz del repo, coherente con la implementación real  
- [ ] Sin secretos en el historial  
- [ ] Commits pequeños y reales  
- [ ] Repo accesible al evaluador  

### Preguntas probables de sustentación (prepárate)

1. ¿Cómo garantizas que solo una confirmación gana en carrera?  
2. ¿Cómo evitas recalcular el precio al re-confirmar?  
3. ¿Cómo garantizas un solo correo?  
4. ¿Cómo implementas la regla 4 del asistente de forma estructural?  
5. Enseña el constraint de exclusión y la prueba de carrera.  
6. ¿Qué propuso la IA que corregiste o descartaste y por qué?  
7. Camina el INCIDENTE.md: hipótesis → evidencia → remediación → prevención.

---

## 10. Matriz de trazabilidad (resumen)

| Requisito clave | Dónde | Prueba | Documentación |
|-----------------|-------|--------|---------------|
| Cotizador reglas | A1 + domain | unit + casos numéricos | README decisiones |
| Disponibilidad / solape | A1/A2 + exclusion | carrera + quote | README |
| Wizard + draft + retoma | A2 + A4 | e2e manual | README |
| Transiciones backend | A2 | unit transición | README |
| Idempotencia confirm | A2 | doble confirm | README |
| Admin + cancel motivo | A3 + A4 | integración | — |
| Auth simple | A3 | integración | — |
| Correo async + reintentos + único | A5 | worker + captura PostgreSQL | README |
| Asistente reglas 1–4 | A6 | tests + inyección | README + prompt |
| SQL 1–5 | A7 | ejecución local | consultas.sql |
| Incidente 1–4 | A8 | revisión humana | INCIDENTE.md |
| Bonus Rails | A8 | — | BONUS_RAILS.md (opcional) |
| Uso de IA | A9 | — | README + ai-log |
| Commits reales | todos | A10 | historial |

---

## 11. Notas de la fusión

**De la Planeación 1 se tomó:** cobertura exhaustiva de requisitos, catálogo de pruebas numéricas y de carrera, rigor de contratos, riesgos/supuestos, revisión de coherencia, énfasis en evidencia.

**De la Planeación 2 se tomó:** stack y decisiones concretas, diseño estructural de concurrencia/outbox/IA, briefs accionables, oleadas + worktrees, plan de recorte, ai-log, checklist de sustentación, principio de legibilidad.

**Se descartó:** formalismo excesivo dentro de cada brief, cronogramas por franja horaria rígidos, stacks menos explicables (Fastify/Nest/Prisma cuando complicaban la sustentación).

**Tensión residual resuelta:** el rigor vive en este documento maestro y en las matrices; los agentes reciben briefs cortos con criterios binarios. Así se mantiene disciplina sin frenar la ejecución.

---

**Condición de éxito final**

Desde una instalación limpia se puede: iniciar sesión, cotizar, retomar un borrador, confirmar una sola vez bajo carrera, ver el correo, administrar la reserva y usar el chat con API real. Existen las 5 consultas SQL, un INCIDENTE.md de ≤ 2 páginas y las pruebas críticas pasan. El candidato puede explicar las decisiones y un ejemplo real de algo que corrigió a la IA.
```

