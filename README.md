# Lumni Reservas

Aplicación de reservas de salas para un coworking, con React, Node/Express, TypeScript y PostgreSQL. **Estado: cotizador, reservas en tres pasos y administración disponibles desde la interfaz.** La confirmación crea un evento de correo y un worker separado guarda su captura local en PostgreSQL. El asistente de reservas está integrado y verificado con Gemini 3.5 Flash-Lite, con conversación persistente y borrador propio.

## Ejecutar la demo (recomendado para evaluación)

Requisito: **Docker con el motor iniciado y Compose v2.20 o superior**. No necesitas Node, pnpm, PostgreSQL local ni crear `.env`: el contenedor instala las versiones y aplica migraciones/seed automáticamente.

Desde la raíz del proyecto, en macOS o Linux:

```sh
./scripts/demo.sh
```

El script comprueba Docker/Compose y el motor antes de construir o arrancar nada. Si falta el motor, muestra cómo iniciarlo; no cambia el contexto de Docker ni instala software en el equipo.

En Windows/PowerShell, o para ejecutar directamente los comandos equivalentes:

```sh
docker info
docker compose up --build -d --wait
```

**Abre http://localhost:8080**. API y web comparten origen. El primer arranque requiere conexión a Internet para descargar imágenes y dependencias; puede tardar varios minutos. `--wait` espera a que PostgreSQL, la aplicación y el worker estén saludables.

| Perfil demo | Correo | Contraseña |
| --- | --- | --- |
| Cliente | cliente@example.com | ClienteDemo2026! |
| Administrador | admin@example.com | AdminDemo2026! |

Son datos ficticios para evaluación local. La aplicación se publica solo en la interfaz local. El seed conserva usuarios, contraseñas, salas y borradores existentes; ejecutarlo de nuevo no duplica datos.

Comandos útiles:

```sh
docker compose logs -f app worker
docker compose run --rm app pnpm verify
docker compose down
```

`down` conserva los datos del volumen. La suite de integración reinicia solo la base de pruebas `lumni_test`; no usarla para conservar datos personales.

Si un puerto está ocupado, define `APP_PORT` (8080 por defecto) o `POSTGRES_PORT` (55432) en un `.env` local. El origen permitido se adapta a `APP_PORT`. `.env.example` sirve como referencia; no se requiere para la ruta Docker. No hay rutas, sockets de OrbStack ni gestores de Node de una máquina particular dentro de la configuración del proyecto.

## Desarrollo con Node local (opcional)

Soportado y probado: **Node 22.18+, 24 y 26**. pnpm **11.25.0**, fijado en `packageManager`. `.node-version`/`.nvmrc` proponen 22.18.0 para quienes usan un gestor; no obligan a bajar Node 24/26. Con Corepack disponible, habilita pnpm según tu instalación de Node. La ruta Docker evita este requisito por completo.

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

`dev:setup` diagnostica Node/Docker, crea `.env` desde el ejemplo solo si no existe, inicia únicamente PostgreSQL y aplica migración/seed. No sobrescribe tu configuración. Abre **http://localhost:5173** (también funciona **http://127.0.0.1:5173**); API en **http://localhost:3000/api/health**. Detén API/web con `Ctrl+C`. Para procesar los correos, abre otra terminal en esta misma carpeta y ejecuta `pnpm worker`; puedes detenerlo con `Ctrl+C` sin detener la web. En Docker el worker arranca automáticamente.

Diagnóstico sin instalar dependencias:

```sh
node scripts/doctor.mjs
```

También puedes usar PostgreSQL 16 propio: crea bases separadas `lumni_app`, `lumni_test`, `lumni_sql`, configura sus URLs y contraseñas demo en `.env`, ejecuta `pnpm db:setup` y `pnpm dev`. Los scripts aceptan variables de entorno sin exigir un archivo `.env`, como ocurre en Docker y CI.

## Si el entorno no arranca

| Síntoma | Qué comprobar |
| --- | --- |
| No existe docker.sock / no conecta al motor | Inicia el motor de Docker Desktop, OrbStack u otra instalación compatible. `docker info` debe mostrar servidor. `docker context ls` permite identificar un contexto que apunte a una instalación diferente; el proyecto no lo cambia automáticamente. |
| Versión de Node rechazada | Usa 22.18+, 24 o 26, o la ruta Docker. Versiones fuera de ese conjunto no están verificadas. |
| Puerto ocupado | Ajusta APP_PORT/POSTGRES_PORT en `.env` y vuelve a arrancar. Para desarrollo nativo, actualiza las URLs de base de datos si cambias su puerto. |
| Error de credenciales PostgreSQL después de cambiar .env | El volumen conserva la contraseña inicial; los cambios de entorno no rotan usuarios existentes. Usa las credenciales con las que se creó el volumen o administra explícitamente esa instancia. |
| Estado unhealthy | Consulta `docker compose logs app worker postgres`; el arranque no se considera completado hasta pasar los tres healthchecks. |

Docker apagado o ausente es un prerrequisito del equipo. No puede garantizarse desde un repositorio; por eso se declara y se diagnostica antes del arranque.

## Formato del código

```sh
pnpm format
pnpm format:check
```

El proyecto fija Prettier y su configuración para mantener indentación de dos espacios, JSX y CSS legibles y un estilo consistente. `pnpm verify` comprueba el formato antes de lint y los tests. Los archivos generados, migraciones, cachés y dependencias quedan excluidos.

## Verificar

Dentro de Docker, con la demo ya iniciada:

```sh
docker compose run --rm app pnpm verify
```

En desarrollo nativo:

```sh
pnpm verify
```

`verify` ejecuta lint, tipos, **228 pruebas: 6 de arranque + 19 contratos + 87 de API/dominio sin BD + 6 de cliente web/fechas + 110 de integración PostgreSQL**, y build. La integración exige `TEST_DATABASE_URL` y solo admite bases `lumni_test` o `lumni_test_<sufijo>`. No se sustituye PostgreSQL con mocks.

La verificación local cubre los tres runtimes soportados, migraciones sobre base vacía, seed repetido, login real cliente/admin, expiración/logout, roles y exclusión de solapamientos con conexiones independientes. La demo comprueba además HTML, salud y sesión/catálogo/logout por HTTP. La verificación descrita se ejecutó localmente; la interfaz de A4 queda lista para revisión. Los recorridos de navegador se ejecutan por separado.

GitHub Actions está configurado con matriz Node 22/24/26 y un trabajo Docker. La ejecución remota depende de publicar el repositorio; no se afirma que ya haya ocurrido.

## Recorrer la aplicación

Cliente (`cliente@example.com` / `ClienteDemo2026!`):

1. En **Reservar espacio**, elige sala, fecha futura de lunes a sábado, hora, duración y servicios. Consulta disponibilidad y desglose. Si está ocupado, puedes revisar la alternativa real que devuelve el servidor.
2. Pulsa **Continuar con esta reserva**. Revisa y guarda contacto, sala/horario y servicios. Se admiten cero servicios. Cada paso espera confirmación del servidor; mientras se guarda se bloquea avanzar.
3. Revisa el precio guardado y pulsa **Confirmar reserva**. El diálogo requiere confirmación explícita. Si alguien ocupó el horario, se ofrece editar/recotizar; la cotización nunca bloquea cupo.
4. En **Mis reservas**, retoma borradores y consulta estados. Recargar, cerrar navegador o limpiar localStorage no borra los pasos guardados. Los campos todavía sin guardar se distinguen y salir requiere elegir si se descartan.

Administrador (`admin@example.com` / `AdminDemo2026!`):

- **Reservas**: pagina, combina filtros de sala/estado y abre detalles. Cancela con motivo o marca como completada cuando ya terminó. Listado y detalle se actualizan con los datos del servidor.
- **Correos**: filtra por estado, revisa intentos/errores y consulta contenido y captura, si existe. El worker convierte los pendientes en **Capturado**; el detalle y las listas con pendientes se actualizan cada dos segundos. El estado API `sent` representa una captura local, sin envío a un buzón externo.

Navegación con rutas hash, por ejemplo `/#/salas` y `/#/reservas/<id>`: se pueden recargar enlaces directos tanto con Vite como con la demo Docker, sin exigir configuración de fallback de Express. Cliente y admin tienen navegación separada; los permisos reales siguen en el backend.

El horario siempre se presenta en America/Bogota, también si el equipo está en otra zona. Fallos de red conservan la edición; una versión obsoleta requiere cargar explícitamente la versión del servidor antes de sobrescribir. Sesión invalidada permite volver a ingresar conservando la edición en memoria para la misma cuenta. Al cambiar de cuenta se limpia la caché privada. No hay tokens ni fuente de verdad del draft en localStorage.

## Pruebas de navegador

Además de `pnpm verify`, hay **13 recorridos Playwright**: 11 con backend/PostgreSQL reales y 2 de UI de chat con contrato HTTP simulado. Los 11 anteriores cubren: rechazo de correo concatenado, cliente→confirmación→captura real→admin/cancelar, retoma en navegador nuevo, red, versiones, colisión/alternativa, sesión, cambios sin guardar, paginación/filtros/403, móvil y estados/capturas de correo. Se ejecutan con zona de navegador Pacific/Auckland para comprobar la presentación en Colombia.

Usa una demo **aislada**, que no contenga tus datos de desarrollo. En macOS/Linux:

```sh
APP_PORT=8097 POSTGRES_PORT=55452 docker compose --project-name lumni-e2e up --build -d --wait
pnpm --filter @lumni/web exec playwright install chromium
E2E_BASE_URL=http://localhost:8097 E2E_COMPOSE_PROJECT=lumni-e2e pnpm test:e2e
```

En PowerShell, establece esas variables con `$env:NOMBRE="valor"` antes del comando. El runner exige proyecto de pruebas y comprueba su puerto publicado antes de crear fixtures. El flujo principal comprueba la captura producida por el worker real. El recorrido dedicado a visualizar estados usa fixtures failed/sent explícitos; no demuestra reintentos del worker. Ninguna prueba representa un envío externo. Los dos recorridos de chat verifican historial visual, apertura de un borrador real, escape de HTML y texto/ID conservados al reintentar un error. Su persistencia y orquestación se prueban por separado con PostgreSQL real y LlmClient falso; no sustituyen una demostración contra Gemini. No hay endpoints de producción para forzar fallos.

Resultados y capturas de fallo van al directorio temporal del sistema, o a `E2E_OUTPUT_DIR` si lo defines. No se guardan cookies ni trazas de autenticación. Puedes usar `PLAYWRIGHT_CHROMIUM_PATH` para un Chromium instalado; normalmente Playwright usa su navegador compatible descargado por el comando anterior.

Para repetir toda la suite con datos nuevos, recrea únicamente ese proyecto aislado. Al terminar:

```sh
docker compose --project-name lumni-e2e down --volumes
```

GitHub Actions incluye la ejecución E2E en el trabajo Docker, con instalación de Chromium. La configuración no equivale a una ejecución remota comprobada.

## Cotizador backend

`POST /api/quotes` requiere sesión de cliente y el Origin configurado. El administrador obtiene 403. Entrada de ejemplo (elige una fecha futura de lunes a sábado):

```json
{
  "roomId": "00000000-0000-4000-8000-000000000201",
  "date": "2026-10-24",
  "startTime": "09:00",
  "durationMinutes": 240,
  "serviceCodes": ["projector", "coffee"]
}
```

Devuelve Quote v1 con base, descuento, recargo, servicios, total COP, `canBook`, motivo y alternativa. El ejemplo de sábado da 160.000 − 16.000 + 36.000 + 30.000 = **210.000 COP**. Una solicitud válida sin cupo responde 200 con `canBook: false`; entradas inválidas o importes inyectados se rechazan con 400. Sala inexistente: 404; servicio retirado del catálogo: 422.

El cálculo admite 60–600 minutos en bloques de 30, descuentos 10 % desde 4h y 20 % desde 8h, y recargo del sábado del 25 % sobre la sala ya descontada. Los extras se suman después. Los componentes se redondean al peso con aritmética entera. Tarifas y servicios salen del catálogo del servidor.

Disponibilidad: solo confirmed/completed ocupan, con rangos `[inicio, fin)`. La alternativa conserva sala, fecha y duración, avanza en bloques de 30 minutos, respeta 07:00–21:00 y no propone instantes pasados. Domingo, pasado o falta de hueco dejan alternativa null. **Cotizar no reserva ni bloquea cupo.** La interfaz ofrece revisar la alternativa antes de continuar.

`QuoteService` en `apps/api/src/quotes/service.ts` es reutilizable por las fases siguientes; `domain.ts` contiene cálculo, calendario y búsqueda puros. A2 reutiliza este servicio y la misma validación de calendario. Las migraciones se conservaron sin cambios.

## Borradores y confirmación por API

Estas rutas requieren sesión de cliente. El dueño proviene de la sesión; no se aceptan dueño, estado ni importes enviados por el navegador. Las respuestas individuales tienen forma `{ "booking": ... }` y el listado `{ "items": [...] }`.

| Método y ruta | Entrada |
| --- | --- |
| `POST /api/bookings` | `clientRequestId` UUID y `customer` parcial opcional. Responde 200 tanto en creación como en replay. |
| `GET /api/bookings?status=draft` | Lista únicamente las reservas propias; el filtro de estado es opcional. |
| `GET /api/bookings/:id` | Retoma campos, próximo paso, versión y precio persistidos en servidor. |
| `PATCH /api/bookings/:id/draft` | `expectedVersion`, `step` y los datos del paso. |
| `POST /api/bookings/:id/confirm` | Solo `expectedVersion`. |

Creación mínima:

```json
{ "clientRequestId": "d63ee83e-a9db-4b6d-9eb5-a5486d518563" }
```

Genera un UUID por intención de creación. Repetirlo con los mismos datos normalizados devuelve la misma reserva, incluso tras editarla. Reutilizarlo con otros datos da 409. Se conserva el hash original de creación, que no se expone al cliente.

Guarda los pasos usando la versión devuelta por la respuesta anterior:

1. `{ "step": 1, "expectedVersion": 1, "customer": { "fullName": "Ana", "email": "ana@example.com" } }`. Empresa opcional.
2. `{ "step": 2, "expectedVersion": 2, "roomId": "<uuid-sala>", "date": "<fecha futura YYYY-MM-DD>", "startTime": "09:00", "durationMinutes": 240 }`. Usa los datos elegidos en el cotizador para prellenar este paso. No se envía un objeto Quote ni su precio como autoridad.
3. `{ "step": 3, "expectedVersion": 3, "serviceCodes": ["projector"] }`. Envía `[]` explícitamente para elegir ningún extra. El servidor calcula y guarda el snapshot de precio.

Cada guardado incrementa la versión. El paso devuelto es el siguiente pendiente (3 cuando ya puede revisarse el precio). Sala/horario pueden guardarse antes del contacto, pero el paso de extras exige contacto y horario completos. Un cambio de sala/horario invalida el snapshot: hay que guardar extras y revisar el nuevo precio antes de confirmar. Cambiar extras recalcula el precio en servidor. Guardar un precio o cotizar **no bloquea disponibilidad**.

Una versión antigua al editar/confirmar un draft produce 409; recarga antes de reintentar. Datos incompletos para confirmar producen 422. UUID ajeno o inexistente produce 404. Los cuerpos/query desconocidos se rechazan con 400.

La confirmación bloquea la propia fila y usa el snapshot persistido, aunque cambie el catálogo. En una sola conexión y transacción escribe `confirmed`, cuatro líneas contables (base, descuento negativo, recargo y servicios) y un evento `booking-confirmed:{id}`. Repetir una confirmación ya exitosa devuelve el mismo snapshot y fecha, incluso con versión vieja, sin líneas ni correo adicionales. Estados finales rechazan reconfirmación con 409; la gestión administrativa usa las rutas descritas a continuación.

Si otra reserva gana el horario, la exclusión GiST provoca rollback completo; se responde 409 `ROOM_UNAVAILABLE` con `error.suggestedSlot` (o null), calculado después del rollback. El perdedor conserva su draft. Los horarios contiguos y las salas distintas sí pueden confirmarse simultáneamente.

El evento de correo queda inicialmente `pending`; el worker separado lo procesa después de confirmar, sin que la solicitud espere al correo. La interfaz permite guardar cada paso, retomar desde Mis reservas y confirmar mediante un botón explícito.

## Correo y captura local

Docker inicia el servicio `worker` automáticamente. En desarrollo nativo, deja `pnpm dev` activo y ejecuta en otra terminal:

```sh
pnpm worker
```

Para ejecutar los archivos compilados: `pnpm build` y después `pnpm worker:start`. El proceso usa la misma `DATABASE_URL` que la API. No requiere proveedor de correo ni SMTP.

Cada evento se toma con `FOR UPDATE SKIP LOCKED`. La captura en `captured_emails` y el estado `sent` se guardan en la misma transacción. Una caída anterior al commit revierte ambas escrituras; después del commit el evento deja de ser elegible. Las claves únicas por reserva y deduplicación impiden capturas repetidas. Esta garantía se limita a PostgreSQL local; no equivale a entregar un correo externo exactamente una vez.

Un fallo programa hasta cinco reintentos con esperas de **1, 2, 4, 8 y 16 minutos** desde cada fallo. El sexto fallo deja `failed` con seis intentos y un error resumido, visible en **Administración → Correos**. Reiniciar el worker conserva intentos y fecha del próximo intento. No se imprimen cuerpos ni destinatarios en sus logs.

Configuración opcional en `.env`:

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `EMAIL_POLL_INTERVAL_MS` | `1000` | Espera entre ciclos, de 100 a 60000 ms. |
| `EMAIL_BATCH_SIZE` | `20` | Máximo de eventos por ciclo, de 1 a 100; una transacción por evento. |
| `EMAIL_FAILURE_MODE` | `none` | `first-two` falla dos veces por evento y luego captura; `always` agota intentos. Solo desarrollo/test. |

Para demostrar fallos localmente, detén el worker, cambia `EMAIL_FAILURE_MODE`, vuelve a iniciarlo y confirma una reserva nueva. En Docker, aplica la variable con `docker compose up -d --wait worker`. Las esperas son reales en la demo; las pruebas usan un reloj controlado para comprobar los seis intentos sin esperar 31 minutos. Producción rechaza modos de fallo simulados. No existe un endpoint para alterar reintentos ni forzar fallos.

Para observar `pending`, detén solo el worker antes de confirmar; la reserva se confirma y el evento queda pendiente hasta reiniciarlo. En Docker: `docker compose stop worker` y luego `docker compose up -d --wait worker`. El panel muestra destinatario, contenido, captura, intentos y último error. La salud del worker comprueba un pulso renovado después de consultar PostgreSQL; no solo que el proceso exista.

## Administración por API

Inicia sesión como `admin@example.com` desde la pantalla de acceso. Todas las rutas `/api/admin` exigen sesión de administrador: un cliente obtiene 403 y una petición sin sesión válida obtiene 401.

| Método y ruta | Función |
| --- | --- |
| `GET /api/admin/bookings?page=1&pageSize=20&status=confirmed&roomId=<uuid>` | Reservas de todos los dueños, filtros combinables, total filtrado y paginación por SQL. |
| `GET /api/admin/bookings/:id` | `{ booking, lines, email }`: snapshot y motivo de cancelación, líneas contables y estado del evento de correo, si existe. |
| `POST /api/admin/bookings/:id/cancel` | `{ "expectedVersion": 5, "reason": "Cambio solicitado" }`. Solo desde confirmed; conserva precio/líneas/correo y libera el horario. |
| `POST /api/admin/bookings/:id/complete` | `{ "expectedVersion": 5 }`. Solo desde confirmed cuando ya terminó; conserva precio/líneas/correo. |
| `GET /api/admin/emails?page=1&pageSize=20&status=failed` | Eventos pending/sent/failed con intentos, último error e ID de captura nullable. |
| `GET /api/admin/emails/:id` | `{ event, payload, capture }`; el ID es del evento outbox, también cuando todavía no hay captura. |

Los listados usan página 1 y tamaño 20 por defecto, máximo 100, y orden estable por fecha de creación descendente e ID descendente. Items y total se leen en la misma transacción/snapshot. Filtros y query strings se validan en servidor.

Cancelar exige motivo válido (no vacío ni solo espacios, máximo 1.000 caracteres); ausente/blanco/excesivo produce 422. Tipos/campos desconocidos producen 400. Versión obsoleta, repetir una cancelación o cambiar un estado final produce 409. Las mutaciones bloquean la propia fila en una transacción e incrementan la versión. No hay una API genérica para asignar estados. El completado es manual por admin después del fin, sin job automático.

Para inspeccionar la reserva que probaste como cliente, entra como admin y ejecuta en la consola del navegador:

```js
const respuestaAdmin = await fetch('/api/admin/bookings?status=confirmed', {
  credentials: 'include',
});
console.log(respuestaAdmin.status, await respuestaAdmin.json());
```

Para ver un detalle, usa el ID obtenido en `/api/admin/bookings/<id>`. La cancelación es una operación real: envía motivo y la versión actual que muestra ese detalle. Si cambia la versión, vuelve a cargar antes de reintentar.

Los correos pasan de pending a sent al guardar su captura; si agotan los reintentos quedan failed, consultables por administrador. El panel visual permite consultar estos estados y el contenido de cada confirmación; nunca inserta el HTML del correo como contenido ejecutable.

## Asistente de reservas con Gemini

Configura únicamente el `.env` del backend, con una clave de tu proyecto personal:

```dotenv
AI_API_KEY=tu_clave_personal
AI_MODEL=gemini-3.5-flash-lite
```

El modelo es configurable; comprueba su disponibilidad y límites en tu proyecto. No uses prefijo `VITE_` para la clave ni la incluyas en Git. En desarrollo, reinicia `pnpm dev` después de cambiar `.env`. En Docker, `docker compose up --build -d --wait` aplica la configuración al servicio app; el worker no recibe la clave.

Puedes comprobar una sola petición real desde tu propia terminal, sin imprimir la clave:

```sh
pnpm ai:check
```

Playground y API pueden tener acceso/cuotas diferentes. Durante la verificación del 2026-10-25, Gemini 3.8 Flash respondió en Playground pero falló por API con503/timeout, también desde la terminal del usuario. Se seleccionó Gemini 3.5 Flash-Lite tras verificar generación y extracción reales. Un recorrido HTTP de tres mensajes con PostgreSQL creó un draft de195000 COP para seis personas, sábado09:00/dos horas/proyector; recargar y repetir el mensaje conservaron historial/draft, con tres llamadas al modelo y cero eventos de confirmación. Hubo fallos transitorios antes de ese recorrido exitoso; la causa de los503 no se presume. No se usa un fake como respaldo del producto. Sin clave o ante un fallo del proveedor, la aplicación conserva el estado y el texto por enviar, ofrece reintentar y permite usar el formulario normal.

Como cliente, abre **Asistente de reservas → Iniciar conversación**. Ejemplo: «Una sala para 6 personas el sábado en la mañana con proyector». El servidor elige la sala más pequeña con capacidad suficiente y pide un dato faltante por turno. «En la mañana» no fija una hora ni duración; responde, por ejemplo, `09:00` y `2 horas`. Si no mencionaste servicios, debes elegir café, proyector, ambos o sin extras.

La tarjeta presenta la respuesta del cotizador, con horarios de Colombia. Si no hay cupo, puedes aceptar una alternativa explícitamente para volver a consultar; no se cambia el horario por cuenta del usuario. Con datos suficientes se guarda un único draft con contacto del perfil autenticado. **Revisar borrador** abre el wizard existente; la confirmación requiere su botón normal. Una conversación ligada a una reserva ya confirmada exige abrir otra para una solicitud nueva.

Las conversaciones propias se recuperan desde la lista del asistente y sus enlaces `/#/asistente/<id>`. Historial, fecha resuelta, slots y vínculo al draft viven en PostgreSQL. `Actualizar conversación` recupera cambios de otra pestaña sin descartar el texto por enviar. Si editaste el draft en el formulario, el chat no lo sobrescribe: continúa allí o abre otra conversación.

### Las cuatro reglas del asistente

El prompt versionado está en `apps/api/src/prompts/booking-assistant.md`. La aplicación hace cumplir los límites además del prompt:

1. **No inventar datos.** La respuesta estructurada se valida con Zod strict, exige cita literal por campo y contrasta números, unidades, hora, fecha, servicios y sala con código y catálogo. Una salida inválida no modifica historial, slots ni reservas. Las expresiones ambiguas piden aclaración. La fecha relativa se resuelve una vez con reloj/Bogotá; recargar no la desplaza.
2. **No calcular precio ni disponibilidad.** El modelo no recibe tarifas ni tiene campos para importes/disponibilidad. Las tarjetas usan `QuoteService` y el snapshot guardado por `BookingService`; nunca prosa del LLM.
3. **No confirmar/cancelar ni ver datos ajenos.** El proveedor no recibe herramientas ni cookies/contactos del perfil. La sesión determina dueño y rol. Las rutas por ID aplican filtro de dueño/404 y cliente; no existe herramienta para confirmar, cancelar o listar otros clientes.
4. **No aceptar instrucciones que amplíen permisos.** El texto del usuario no altera capacidades: esquema cerrado, evidencia contrastada, autorización de servidor y ausencia de herramientas privilegiadas. Un rechazo escrito por el modelo no es la única defensa. Estas restricciones no equivalen a prometer inmunidad absoluta a prompt injection; el usuario revisa el draft antes de confirmar.

`LlmClient` es sustituible en tests; el producto usa el SDK oficial `@google/genai`, timeout de12s, máximo2048 tokens de salida y seis mensajes recientes como contexto. Input máximo1000 caracteres; respuesta máxima16000; conversación máxima80 mensajes (40 turnos). Una petición activa por cliente en el proceso. Los diez intentos por minuto incluyen fallos en memoria del proceso; los diez mensajes guardados por minuto se comprueban también en PG entre reinicios. Para un despliegue con múltiples instancias se necesitaría un limitador compartido de intentos fallidos; la demo no lo presenta como un control distribuido.

La llamada externa sucede fuera de transacción. Después, el servidor bloquea la conversación y verifica `expectedVersion`; mensaje, slots y creación/actualización del draft se confirman juntos. `clientMessageId` identifica reintentos: mismo ID/contenido devuelve lo guardado, ID reutilizado con otro contenido o versión vieja produce409. Los cambios manuales del draft se protegen con su versión. Los logs del chat contienen requestId, latencia y resultado, sin cuerpos, contacto ni clave.

API de chat, solo cliente autenticado:

| Método y ruta | Entrada / resultado |
| --- | --- |
| POST `/api/chat/conversations` | `{ clientRequestId }`; creación idempotente propia. |
| GET `/api/chat/conversations` | Últimas20 conversaciones propias. |
| GET `/api/chat/conversations/:id` | Historial, slots, versión y draft vinculado. |
| POST `/api/chat/conversations/:id/messages` | `{ kind: "message", content, clientMessageId, expectedVersion }`, o `kind: "accept_alternative"` sin content. |

Las respuestas individuales contienen `{ conversation }`. Datos inválidos400, sesión401, rol403, dueño ajeno404, versión/draft409, límites429 y proveedor503. No hay endpoint para insertar precios ni asignar estado de reserva desde el chat.

Documentación del proveedor: [SDK oficial](https://github.com/googleapis/js-genai), [salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output), [modelos y precios](https://ai.google.dev/gemini-api/docs/pricing). Usar datos ficticios en esta demo.

## Estructura y decisiones

- `apps/api`: Express 5, `createApp`, health, sesiones, catálogos, cotizador, reservas, administración y asistente autenticados.
- `apps/web`: React 18/Vite, rutas por rol, cotizador, reservas/wizard y administración; cliente API validado, React Hook Form, TanStack Query, CSS por responsabilidad y carga diferida de pantallas y conversación de reservas.
- `packages/shared`: contratos Zod estrictos de login, quote, draft, confirmación/versiones, admin, correo, extracción IA y errores HTTP.
- `apps/api/src/db` y `apps/api/drizzle`: diez tablas, migraciones Drizzle/SQL, checks, claves únicas y seed.
- `Dockerfile`, `docker-compose.yml`, `infra/docker`: Node controlado dentro de la imagen, web compilada servida por Express, PostgreSQL 16 y arranque idempotente sin depender de .env del host.
- `scripts`: diagnóstico, preparación nativa, demo y comprobación HTTP.

PostgreSQL tiene tres bases separadas. `infra/postgres/init.sql` crea las de pruebas/Parte 3 al inicializar el volumen. La Parte 3 conservará su DDL independiente en A7. Zona America/Bogota; dinero entero COP. Capacidades 4/8/16 y extras proyector 20.000/café 10.000 COP son supuestos documentados.

Los drafts admiten datos parciales. Confirmed/completed exigen datos completos y rangos positivos. `bookings_no_overlap` es una exclusión GiST parcial para esos estados con intervalos `[inicio, fin)`, escrita explícitamente en `0001_booking_exclusion.sql`. Para verla:

```sh
docker compose exec postgres psql -U lumni -d lumni_app -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='bookings_no_overlap';"
```

La confirmación HTTP usa esta exclusión y una transacción para estado, líneas y outbox. Las pruebas de A2 enfrentan solicitudes HTTP simultáneas de dos clientes con PostgreSQL real, además de las pruebas iniciales del constraint. La captura local se procesa en una transacción separada por el worker.

La sesión usa cookie opaca HttpOnly/SameSite=Lax; hash de token en PostgreSQL y scrypt con sal para contraseñas. Las mutaciones exigen Origin. En desarrollo HTTP se aceptan localhost y 127.0.0.1 únicamente con el mismo puerto configurado; otros hosts y puertos siguen bloqueados. Producción conserva un único origen exacto. El entorno Docker de demostración permite HTTP local; Secure se activa con NODE_ENV=production o WEB_ORIGIN HTTPS; producción debe servirse por HTTPS. Las rutas administrativas exigen sesión y rol admin; recursos de otro cliente conservan el 404. El rol se consulta en PostgreSQL, sin confiar en campos enviados por el navegador.

## Alcance pendiente y uso de IA

Pendientes: revisión de A6; A7 SQL; A8 incidente/bonus; A9/A10 cierre. Las tablas y contratos preparatorios no equivalen a esos flujos. La fecha límite oficial sigue pendiente de confirmación.

Codex asistió en la base, cotizador, reservas/administración, interfaz, worker de captura local, asistente con validación estructurada y correcciones de portabilidad/origen/formato. Ejemplo real corregido: la restricción inicial rechazaba Node 26 sin probarlo; se amplió el soporte tras ejecutar las comprobaciones con Node 22/24/26 y se añadió una ruta Docker sin Node local. También se corrigieron configuración de pnpm y errores de tipos detectados por las herramientas. Codex ejecutó las comprobaciones descritas; la revisión del candidato permanece pendiente. No se le atribuyen pruebas que no haya ejecutado.

Las instrucciones de trabajo de esta aplicación están en `AGENTS.md`. La planeación, los briefs y las referencias se mantienen fuera del repositorio y no se necesitan para instalar, ejecutar o probar la aplicación. Los commits y sus mensajes son manuales del usuario; no se hace staging, commit ni publicación automática.
