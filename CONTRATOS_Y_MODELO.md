# Contratos, invariantes y datos — implementación canónica

**Estado:** contrato canónico del plan consolidado; congelar antes de implementar A1/A2. Stack fijado: Node 22 LTS + Express 5 + Drizzle y SQL parametrizado para locks/constraints; PostgreSQL 16; React/Vite + pnpm. Drizzle no sustituye las transacciones SQL explícitas. Los esquemas ejecutables vivirán en `packages/shared`; este documento explica su intención. No mantener tipos duplicados en web y API. IDs UUID como cadenas; instantes ISO 8601 con offset; dinero entero COP; JSON en camelCase, SQL en snake_case.

## Respuestas y errores

Errores: `{ error: { code, message, fieldErrors?, requestId } }`. Convención: 400 JSON/esquema inválido; 401 sin sesión; 403 rol insuficiente; 404 recurso inexistente o de otro cliente; 409 conflicto de horario, versión o transición; 422 datos de negocio inválidos/incompletos; 429 límites del chat; 503 proveedor IA no disponible. No filtrar stack, SQL, secretos o datos de otro cliente.

Una cotización válida pero no reservable responde 200 con `canBook: false`; una fecha imposible o una duración fuera de esquema se rechaza. Usar `reasonCode` estable y mensaje de UI legible. `POST /api/quotes` requiere sesión de cliente en esta propuesta.

## Endpoints mínimos

| Método y ruta | Actor | Entrada / salida principal |
| --- | --- | --- |
| POST `/api/auth/login` | Sin sesión | email/password → usuario + cookie |
| POST `/api/auth/logout` | Autenticado | Invalida sesión |
| GET `/api/me` | Autenticado | Perfil y rol, sin hash |
| GET `/api/rooms` | Autenticado | Catálogo: id, nombre, tamaño, capacidad, tarifa |
| GET `/api/services` | Autenticado | Proyector/café y precios asumidos |
| POST `/api/quotes` | Cliente | roomId, date, startTime, durationMinutes, serviceCodes → Quote |
| POST `/api/bookings` | Cliente | clientRequestId, datos parciales de paso 1 → draft propio |
| GET `/api/bookings?status=draft` | Cliente | Borradores propios para retoma; no lista global |
| GET `/api/bookings/:id` | Dueño o admin | Reserva, paso, versión y snapshot |
| PATCH `/api/bookings/:id/draft` | Dueño | expectedVersion, step, datos de ese paso → draft actualizado |
| POST `/api/bookings/:id/confirm` | Dueño | expectedVersion → confirmación o replay idempotente |
| GET `/api/admin/bookings` | Admin | page, pageSize, status?, roomId? → items/total/page/pageSize |
| GET `/api/admin/bookings/:id` | Admin | Detalle + estado del correo |
| POST `/api/admin/bookings/:id/cancel` | Admin | reason no vacío + expectedVersion → cancelled |
| POST `/api/admin/bookings/:id/complete` | Admin | expectedVersion → completed si terminó |
| GET `/api/admin/emails` | Admin | Capturas y eventos failed con intentos/error |
| GET `/api/admin/emails/:id` | Admin | Destinatario, asunto, cuerpo y fecha |
| POST `/api/chat/conversations` | Cliente | clientRequestId → conversación propia |
| GET `/api/chat/conversations` | Cliente | Conversaciones propias; escoger la última al retomar |
| GET `/api/chat/conversations/:id` | Dueño | Historial, slots, versión y draft vinculado |
| POST `/api/chat/conversations/:id/messages` | Dueño | clientMessageId, expectedVersion, content → mensaje + tarjetas |
| GET `/api/health` | Local/operación | Estado API/DB sin secretos |

`page >= 1`, `pageSize` predeterminado 20 y máximo 100; orden estable por `created_at DESC, id DESC`. Filtrar y contar en servidor. Las acciones de cliente no aceptan `ownerId`, `role`, `status`, importes o permisos aportados por el navegador. Validar el body y la query, no solo los tipos de TypeScript.

La lista de correos se identifica por el ID del evento outbox y contiene `status`, `attempts`, `lastError` y `capturedEmailId` nullable. El detalle `/api/admin/emails/:id` recibe ese ID de evento y muestra payload/captura si existe. Así también se puede inspeccionar un evento pending/failed sin que exista una captura.

## Quote v1

Ejemplo de entrada (fecha futura al generar este plan):

```json
{
  "roomId": "<uuid-pequena>",
  "date": "2026-10-24",
  "startTime": "09:00",
  "durationMinutes": 240,
  "serviceCodes": ["projector"]
}
```

Salida relevante:

```json
{
  "roomId": "<uuid-pequena>",
  "startsAt": "2026-10-24T09:00:00-05:00",
  "endsAt": "2026-10-24T13:00:00-05:00",
  "timeZone": "America/Bogota",
  "currency": "COP",
  "pricingVersion": "v1",
  "breakdown": {
    "base": 160000,
    "discount": 16000,
    "surcharge": 36000,
    "services": 20000,
    "total": 200000
  },
  "canBook": true,
  "reasonCode": null,
  "message": null,
  "suggestedSlot": null
}
```

`discount` es la magnitud positiva del descuento en API; al persistir líneas contables, su `amount` es negativo. Invariante: `total = base - discount + surcharge + services`. Nunca sumar dos veces una captura o una línea. `suggestedSlot` es null o contiene `startsAt/endsAt` con la **misma duración, sala y día local**, encontrado desde el horario pedido hacia adelante en saltos de 30 minutos. No buscar el día siguiente ni reducir la duración para fingir disponibilidad.

Para domingo, fecha pasada, cierre superado o ausencia de cupos restantes, explicar el motivo y retornar alternativa null. Si empieza antes de abrir, la búsqueda puede partir de las 07:00; nunca sugerir una hora pasada. La pantalla ofrece editar la solicitud cuando no hay alternativa.

## Draft y pasos

Reserva: `id, ownerId, status, wizardStep, version, customer, roomId?, startsAt?, endsAt?, serviceCodes, quoteSnapshot?, createdAt, confirmedAt?, cancelledAt?, cancellationReason?`.

Paso 1: nombre y correo de contacto válidos; empresa opcional. Paso 2: sala, fecha, inicio y duración, prellenados desde Quote. Paso 3: selección explícita de extras, incluyendo ninguno, y último snapshot calculado en servidor. Al guardar, devolver el siguiente paso pendiente. Al volver a abrir, ofrecer retomar por ID; el almacenamiento local puede recordar el ID, nunca ser la fuente única del borrador ni contener el token de sesión.

PATCH es parcial por paso pero valida todos los campos exigidos para avanzar en ese paso. Una reserva confirmada no es editable por esta ruta. La mutación comprueba `expectedVersion`; actualiza a `version + 1` de forma atómica. Si hay 409, volver a cargar sin sobrescribir silenciosamente. Evitar autosaves fuera de orden: una petición por draft en vuelo, cola local de la siguiente edición y espera del guardado antes de avanzar/cerrar voluntariamente.

`clientRequestId` para crear un draft es UUID generado una vez por intención de creación. Restricción única por `(owner_id, client_request_id)`; repetir con el mismo contenido devuelve el mismo draft, repetir con contenido incompatible devuelve 409. Conservar el hash del payload original de creación para comparar replays contra esa intención inicial, no contra campos del draft que después se editaron. No se exige una infraestructura universal de idempotency keys para todos los endpoints.

Confirmación no acepta importe. Para una reserva ya `confirmed`, devolver 200 y su mismo snapshot **antes de rechazar la versión antigua**. Esto permite reintentar tras perder la respuesta de la primera confirmación. Una reserva `completed/cancelled` no se confirma de nuevo. Cancelar requiere motivo sin solo espacios, con longitud máxima; no modifica el precio pactado ni borra el correo de confirmación ya generado.

## Modelo físico orientativo

| Tabla | Campos/índices que deben existir |
| --- | --- |
| `users` | id, email único normalizado, password_hash, role, full_name |
| `sessions` | token_hash único, user_id FK, expires_at; índice por expiración |
| `rooms` | id, name, size, capacity, hourly_rate_cop; tres seeds |
| `services` | code PK, name, flat_price_cop; catálogo fijo |
| `bookings` | dueño FK, estado, campos parciales de wizard, version, snapshot JSONB de servidor, fechas, motivo, client_request_id, create_request_hash; exclusión e índices por dueño/estado/sala |
| `booking_lines` | booking_id FK, concept, amount_cop; UNIQUE(booking_id, concept) para conceptos únicos del catálogo; snapshot de base/descuento/recargo/extras al confirmar |
| `email_outbox` | id, booking_id, dedup_key UNIQUE, payload inmutable, status pending/sent/failed, attempts, next_attempt_at, last_error, sent_at; índice parcial de pendientes por vencimiento |
| `captured_emails` | id, dedup_key UNIQUE, booking_id UNIQUE, to_email, subject, text_body, html_body?, captured_at |
| `chat_conversations` | id, owner_id, version, slots JSONB, draft_booking_id UNIQUE opcional |
| `chat_messages` | id, conversation_id FK, client_message_id, role, content/card_data, created_at; unicidad de mensaje cliente por conversación y orden estable |

Los campos necesarios para el snapshot/confirmación se completan antes de pasar a confirmed; no exigirlos NOT NULL en un draft de paso 1. `booking_lines` se crea una sola vez con la confirmación. Validar en servicio la consistencia entre líneas y snapshot. FK y restricciones son defensa complementaria a validación.

No forzar esta estructura a la Parte 3. Las consultas de esa parte corren en una base/schema independiente con **el DDL simplificado del PDF**, incluyendo `customers`, `payments` y `numeric(14,2)`. Mantener fixtures de solapamientos allí: la exclusión de la app impediría crear esos datos de prueba.

## Contrato limitado con el modelo

La respuesta del proveedor debe convertirse a este esquema semántico estricto, definido en `packages/shared/src/assistant.ts`. Es un borrador de forma; el coordinador lo transforma en esquema ejecutable antes de integrar:

```ts
type AssistantExtraction = {
  intent: 'booking_request' | 'unrelated';
  patch: {
    participants?: number;               // entero 1..100
    roomId?: string;                     // además validar contra catálogo
    dateReference?:
      | { kind: 'absolute'; date: string }
      | { kind: 'relative_day'; offsetDays: 0 | 1 | 2 }
      | { kind: 'weekday'; isoWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
          relation: 'next_or_today' | 'following_week' };
    startTime?: string;                  // HH:mm; validar rejilla
    period?: 'morning' | 'afternoon' | 'evening';
    durationMinutes?: number;
    serviceCodes?: ('projector' | 'coffee')[];
  };
  evidence: Record<string, string>;       // solo claves de patch y cita literal por campo
};
```

Sin campos `price`, `available`, `ownerId`, `action`, `confirm`, `cancel`, SQL, URLs a ejecutar o prosa libre que afirme disponibilidad. Claves desconocidas invalidan la salida. Campos ausentes conservan slots anteriores; no completar duración, hora o extras sin evidencia. Por cada campo del patch, exigir una cita literal de la entrada actual y verificar que existe en ella; contrastar números, horas y referencias de fecha con un parser de código. Una cita que no permite justificar el valor provoca aclaración, no un relleno automático. La evidencia textual reduce invenciones, pero no sustituye validaciones ni permisos. El nombre/correo provienen del perfil real del usuario o de sus entradas de formulario verificadas; no de datos inventados. Si el cliente no quiere servicios, debe poder indicarlo explícitamente.

El backend valida extracción, mezcla slots, aplica reloj/zona, comprueba capacidad y pregunta un dato faltante por turno con plantillas. “En la mañana” delimita opciones, **no fija una hora**. “El sábado” usa el siguiente sábado incluyendo hoy; si hoy y la hora ya pasó, preguntar si se refiere a la siguiente semana. Expresiones ambiguas como “próximo sábado” o “a las 8” se aclaran. Guardar fecha resuelta y referencia temporal para no mover una solicitud ya acordada cada vez que se recarga.

Si hay datos suficientes, consultar Quote; si no hay cupo, mostrar su alternativa. No crear draft automáticamente con un horario alternativo no aceptado. Cuando estén completos los campos, crear o actualizar el draft vinculado a la conversación mediante el servicio de reservas; `UNIQUE(draft_booking_id)` y relación de conversación aseguran un draft por conversación. La confirmación ocurre solo en el botón de la app, con la cookie del cliente y el endpoint de confirmación.

Procesamiento de mensajes: una petición activa por conversación en UI; backend lee su versión, llama al proveedor con timeout **fuera de una transacción**, y al persistir usa compare-and-swap de versión. Mensaje, actualización de slots y creación/vinculación del draft se guardan atómicamente. `clientMessageId` repetido devuelve el resultado guardado; dos mensajes distintos con versión vieja reciben 409 y se reintentan de forma controlada. No mantener un lock de DB durante una llamada a IA.

Si el modelo rechaza, retorna JSON inválido o el proveedor falla, mostrar error recuperable y conservar el estado previo. No enviarle reservas ajenas, contraseñas, cookies, claves ni tablas completas. En logs registrar requestId/latencia/resultado, con contenidos personales redactados.


## Algoritmos canónicos de estados y correo

- `draft → confirmed → completed | cancelled`: no transiciones desde estados finales; cancelar `draft` no está implementado en el flujo mínimo. `confirmed → cancelled` requiere motivo; `confirmed → completed` requiere gestión del administrador.
- Confirmar lee bajo `SELECT FOR UPDATE` **en la misma conexión y transacción**, verifica titularidad y estado, usa snapshot ya persistido, valida reglas horarias y confirma. Inserta en `email_outbox` la clave `booking-confirmed:{id}` en el mismo COMMIT.
- Añadir `CREATE EXTENSION IF NOT EXISTS btree_gist;` y `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status IN ('confirmed','completed'))`. Manejar `23P01` como 409. Campos de intervalo pueden ser NULL en `draft`, pero no en `confirmed/completed`.
- El worker toma outbox vencidos con `FOR UPDATE SKIP LOCKED`; en éxito escribe `captured_emails` con clave única y marca `sent` **en la misma transacción**. Reintentos: inicial + hasta cinco repeticiones, espera 1/2/4/8/16 min, luego `failed`. Fallos de transporte inyectables solo por configuración local/test.
- No usar SMTP como transporte de garantía exactamente-una-captura. Si se activa Mailpit opcional, documentar separadamente semántica `at-least-once`.
- `booking_lines` de app guardan snapshot por componente al confirmar; no confundir con el DDL específico de la Parte 3.

## Seguridad y sesiones

- Dos usuarios sembrados (cliente/admin) con hashes de contraseña y sesión opaca en cookie HttpOnly, SameSite=Lax, con expiración. HTTPS implica cookie Secure.
- Nunca leer `ownerId`, `customerId`, `status`, `price_*` o `role` desde datos del navegador ni desde herramientas IA. El dueño deriva de la sesión. Acceso a recurso ajeno => 404 para evitar filtración.
- Validar Zod en toda ruta, inclusive query strings; no exponer secretos ni stack traces en errores. No añadir una API que permita ejecutar SQL o jobs manuales desde el navegador.

## Desambiguación del flujo del asistente

El proveedor transforma texto en un objeto tipado con intención, `slots` y extractos de evidencia. Después de validación estricta, un orquestador del servidor comprueba sala/capacidad, fecha relativa con reloj inyectable en `America/Bogota`, horario exacto y duración; pregunta lo que falte. Una descripción «el sábado en la mañana» **no equivale** a las 09:00: debe preguntar una hora. El modelo no tiene herramientas para confirmar/cancelar/listar reservas. El servidor produce tarjetas y respuesta estructurada a partir de `QuoteService`, solo crea o edita un `draft` de la sesión, y persiste historial/versiones para retomar. El prompt de sistema reside en `apps/api/src/assistant/prompt.md`.

