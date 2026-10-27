# Lumni Reservas

Aplicación de reservas de salas para un coworking. Frontend React/Vite y backend Express en TypeScript estricto, PostgreSQL 16, Drizzle, Zod y pnpm workspaces. El cliente cotiza, guarda una reserva por pasos y la confirma; el administrador consulta, filtra y gestiona las reservas. Un worker captura el correo en segundo plano y un asistente con Gemini prepara borradores desde lenguaje natural.

| Entrega         | Contenido                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parte 1         | Cotizador, wizard persistente, confirmación concurrente/idempotente, autenticación cliente/admin y administración.                                |
| Parte 2         | Captura local asíncrona de correo y asistente con API real de Gemini, conversación persistente y burbuja/panel lateral.                           |
| Parte 3         | [consultas.sql](consultas.sql): cuatro consultas y una respuesta sobre índices, con [DDL, fixtures y verificación independientes](sql/README.md). |
| Parte 4 y bonus | [INCIDENTE.md](INCIDENTE.md), análisis del escenario, y [BONUS_RAILS.md](BONUS_RAILS.md), propuesta ilustrativa.                                  |

## Demo con Docker

Clona este repositorio y sitúate en su raíz. Necesitas **Docker con el motor iniciado y Compose v2.20+**. No necesitas instalar Node, pnpm o PostgreSQL en el host ni crear `.env` para la demo de reservas.

En macOS/Linux:

```sh
./scripts/demo.sh
```

En PowerShell, o directamente con Compose:

```sh
docker info
docker compose up --build -d --wait
```

Abre **http://localhost:8080**. API y web comparten origen. El arranque instala las dependencias fijadas, construye la app, aplica migraciones y ejecuta el seed antes de aceptar tráfico. El primer build necesita Internet y puede tardar varios minutos; `--wait` comprueba PostgreSQL, app y worker. El script diagnostica Docker apagado/ausente; no instala un motor ni cambia su contexto global.

| Perfil demo   | Correo              | Contraseña       |
| ------------- | ------------------- | ---------------- |
| Cliente       | cliente@example.com | ClienteDemo2026! |
| Administrador | admin@example.com   | AdminDemo2026!   |

Son credenciales ficticias para evaluación local. La app se publica en la interfaz loopback. El seed conserva usuarios y contraseñas existentes: cambiar las variables demo no rota una contraseña ya guardada.

```sh
docker compose logs -f app worker
docker compose run --rm app pnpm verify
docker compose down
```

`down` conserva el volumen. `verify` reinicia datos solo de la base de pruebas; no uses esa base para información que quieras conservar. Para cambiar puertos define `APP_PORT` o `POSTGRES_PORT` en `.env`; Compose adapta el origen de la web a `APP_PORT`.

## Desarrollo con Node

Versiones soportadas: **Node 22.18+, 24 o 26** y **pnpm 11.25.0**. `.node-version` y `.nvmrc` proponen 22.18.0; `package.json` admite las tres ramas verificadas. Instala pnpm con tu gestor habitual o Corepack si está disponible.

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

`dev:setup` comprueba el entorno, crea `.env` desde el ejemplo solo si no existe, inicia PostgreSQL y prepara esquema/datos. Cada `pnpm dev` aplica migraciones/seed antes de iniciar los servidores; PostgreSQL debe estar disponible. No sobrescribe `.env`.

- Web: **http://localhost:5173**, también http://127.0.0.1:5173.
- API: **http://localhost:3000/api/health**.
- En otra terminal, `pnpm worker` procesa los correos. `Ctrl+C` detiene el proceso de esa terminal. Docker inicia el worker automáticamente.

Con PostgreSQL propio, crea bases separadas `lumni_app`, `lumni_test` y, si usarás psql para Parte 3, `lumni_sql`. Prepara `.env` desde el ejemplo sin sobrescribir uno existente, ajusta las URLs y ejecuta `pnpm db:setup`, `pnpm dev` y `pnpm worker`. No necesitas Docker para este modo si ya tienes PostgreSQL; `dev:setup` sí utiliza Compose. `node scripts/doctor.mjs` diagnostica el modo con Docker.

## Configuración

[.env.example](.env.example) documenta los valores locales. Los scripts aceptan variables exportadas sin exigir `.env`; nunca incluyas una clave real en Git. En Docker, Compose construye las URLs internas y define HOST, PORT y WEB_ORIGIN; no usa la URL de conexión al host como dirección del contenedor.

| Variable                                      | Uso / valor local                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Conexión de API/worker; en desarrollo apunta a `lumni_app`.                                                                                                         |
| `TEST_DATABASE_URL`                           | Base exclusiva de integración, `lumni_test` o `lumni_test_<sufijo>`.                                                                                                |
| `POSTGRES_PASSWORD`, `POSTGRES_PORT`          | Credencial inicial de PostgreSQL y puerto publicado, 55432 por defecto. El volumen conserva la credencial inicial.                                                  |
| `APP_PORT`                                    | Web/API de Docker; 8080 por defecto.                                                                                                                                |
| `HOST`, `PORT`, `WEB_ORIGIN`                  | API nativa: 127.0.0.1, 3000 y http://localhost:5173. Cambiar puertos exige ajustar también URLs/proxy correspondientes.                                             |
| `NODE_ENV`, `SESSION_TTL_HOURS`               | development y 12 horas por defecto. Cookie Secure en producción o con WEB_ORIGIN HTTPS.                                                                             |
| `DEMO_CLIENT_PASSWORD`, `DEMO_ADMIN_PASSWORD` | Requeridas por el seed; mínimo 12 caracteres. Valores ficticios en el ejemplo.                                                                                      |
| `SEED_DEMO_BOOKINGS`                          | true por defecto; false omite nuevas reservas demo adicionales. Solo se amplían en development.                                                                     |
| `AI_API_KEY`, `AI_MODEL`                      | Clave de Gemini y modelo explícito. Modelo verificado: `gemini-3.5-flash-lite`. Sin configuración válida, el chat informa indisponibilidad; las reservas funcionan. |
| `EMAIL_POLL_INTERVAL_MS`, `EMAIL_BATCH_SIZE`  | Worker: 1000 ms y 20 eventos por ciclo.                                                                                                                             |
| `EMAIL_FAILURE_MODE`                          | none, first-two o always; simulación solo desarrollo/test.                                                                                                          |
| `EMAIL_HEALTH_FILE`, `WEB_DIST_DIR`           | Opcionales; Docker configura pulso del worker y carpeta de web compilada.                                                                                           |
| `SQL_DATABASE_URL`                            | Referencia para una base manual separada de Parte 3. `pnpm test:sql` crea su propia base y no lee esta variable.                                                    |

## Datos y recorrido de demostración

En una base nueva el seed crea dos cuentas, tres salas, dos servicios y 25 reservas: el borrador original más 24 ejemplos `[Demo]` del cliente. Hay siete borradores, seis confirmadas, seis completadas y seis canceladas; las 18 confirmaciones generan eventos de correo que procesa el worker real. Se incluyen borradores con pasos pendientes y reservas históricas/futuras en días abiertos de Colombia.

Las solicitudes demo tienen IDs estables: los reinicios conservan fechas, estados, ediciones y eventos; dos arranques simultáneos no duplican. Ante ocupación se busca alternativa del mismo día o se omite el ejemplo sin cupo. Las fechas se calculan al crear cada ejemplo y envejecen; un borrador antiguo puede necesitar cambiar su fecha. `SEED_DEMO_BOOKINGS=false` no elimina datos anteriores. `pnpm db:seed` agrega ejemplos faltantes sin reiniciar el servidor.

Recorrido breve:

1. **Cliente:** abre Reservar espacio. Elige un sábado futuro libre, sala pequeña, 09:00, cuatro horas, proyector y café: **160.000 − 16.000 + 36.000 + 30.000 = 210.000 COP**. Si hay ocupación, revisa el motivo y la alternativa real.
2. Continúa con la reserva, guarda contacto, sala/horario y extras. Recarga o entra desde otro navegador para retomar lo guardado. Revisa el precio y confirma mediante el diálogo. La cotización no bloquea cupo.
3. En **Mis reservas**, consulta estados y retoma borradores. Los cambios sin guardar siguen en memoria; los guardados viven en el servidor. Una versión obsoleta pide cargar la versión vigente antes de sobrescribir.
4. **Administrador:** filtra por sala/estado, pagina y abre el detalle; cancela con motivo o completa una reserva cuyo fin ya pasó. En el detalle de cada reserva revisa el estado del correo, intentos, errores y contenido capturado. `sent` se presenta como **Capturado**, no como entrega a un buzón externo.
5. **Cliente con Gemini configurado:** abre la burbuja inferior derecha, pide una sala para seis personas un sábado futuro por la mañana con proyector; aclara fecha, hora y duración cuando se solicite. Revisa la cotización y el borrador desde el enlace; la confirmación ocurre en el formulario.

Las rutas hash, como `/#/salas`, `/#/reservas` y `/#/reservas/<id>`, permiten recargar enlaces. Los horarios se muestran en America/Bogota aunque el navegador esté en otra zona. Cliente y administrador tienen navegación separada; la autorización sigue en el backend. Al cambiar de cuenta se limpia la caché privada.

## Decisiones y supuestos

| Tema                  | Decisión                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarifas y horario     | Pequeña 40.000, mediana 70.000, grande 120.000 COP/h; lunes-sábado 07:00–21:00, domingo cerrado.                                                                                                         |
| Duración y rejilla    | 60–600 minutos en bloques de 30; inicios en :00/:30. El fin puede ser exactamente 21:00. La rejilla de inicio es un supuesto.                                                                            |
| Descuentos y sábado   | 10 % desde 4 h, 20 % desde 8 h, sin acumular; sábado 25 % sobre la sala ya descontada.                                                                                                                   |
| Dinero                | COP enteros; aritmética entera y redondeo por componente al peso, mitades hacia arriba.                                                                                                                  |
| Servicios y capacidad | Supuestos: proyector 20.000/café 10.000 por reserva; capacidades pequeña 4/mediana 8/grande 16. Extras después de descuento/recargo.                                                                     |
| Disponibilidad        | Intervalos semiabiertos `[inicio, fin)`; confirmed/completed bloquean, draft/cancelled no. Alternativa: misma sala/día/duración y nunca un inicio pasado.                                                |
| Precio pactado        | Snapshot del backend al guardar extras; confirmar lo conserva. Cambiar sala/horario invalida el snapshot y exige revisar de nuevo.                                                                       |
| Estados               | draft → confirmed → completed o cancelled. Completar exige fin alcanzado; cancelar exige motivo. Finales inmutables.                                                                                     |
| Persistencia          | Borrador parcial e historial por dueño en PostgreSQL; no se exige completar todo para crear un draft.                                                                                                    |
| Parte 3               | DDL oficial independiente con numeric(14,2). Mes actual hasta ahora y once anteriores en Bogotá; horas/ingreso íntegros al mes de inicio, sin prorratear. Los pagos con importe cuentan aun sin paid_at. |

React 18/Vite y Express 5 separan interfaz y servicios; TanStack Query gestiona datos del servidor y React Hook Form/Zod validan formularios. Drizzle aplica migraciones, y SQL explícito define la exclusión GiST. Luxon maneja la zona; no hay Redis ni framework de jobs adicional. Auth simple: sesión opaca en cookie HttpOnly/SameSite=Lax, token hasheado en BD, contraseñas con scrypt. Mutaciones validan Origin; en desarrollo se admiten localhost/127.0.0.1 solo con el puerto configurado. IDs ajenos responden 404 y rutas administrativas requieren rol.

## Concurrencia e idempotencia

**Reservas distintas, misma sala/horario:** [0001_booking_exclusion.sql](apps/api/drizzle/0001_booking_exclusion.sql) crea `bookings_no_overlap`, exclusión GiST parcial para confirmed/completed con `tstzrange(..., '[)')`. Ambas cotizaciones pueden decir disponible; al confirmar, PostgreSQL permite un ganador y rechaza el otro. El perdedor conserva el draft y recibe 409/alternativa. Salir a las 10:00 y entrar a las 10:00 es válido.

**Misma reserva repetida:** [BookingService](apps/api/src/bookings/service.ts) bloquea la fila y comprueba si ya está confirmed antes de exigir versión. Devuelve el mismo ID, confirmedAt y snapshot incluso con una versión anterior; no recalcula, reinserta líneas ni duplica la outbox. Estado, cuatro componentes de precio y evento se guardan en una transacción. Repetir confirmación de cancelled/completed da 409.

Crear un draft usa `clientRequestId`: la misma intención/datos normalizados devuelve el existente; reutilizarlo con otros datos da 409. Los cambios posteriores usan `expectedVersion` para evitar sobreescrituras.

Las pruebas [bookings.test.ts](apps/api/test/bookings.test.ts) ejecutan carreras HTTP con PostgreSQL real, clientes/conexiones independientes, replay y cambios del catálogo; no se usa un mutex en Node como prueba de exclusión.

## Correo en segundo plano

Confirmar solo inserta el evento. El proceso [worker](apps/api/src/worker.ts) consume con `FOR UPDATE SKIP LOCKED`; un savepoint permite guardar el fallo/reintento incluso si una escritura SQL aborta el intento. Hay un intento inicial y hasta cinco reintentos con espera de **1, 2, 4, 8 y 16 minutos**; el sexto fallo deja failed visible en administración.

La captura en `captured_emails` y el cambio de outbox a sent se confirman en la misma transacción, con claves únicas por reserva/deduplicación. Se garantiza **una captura local durable**, también al reintentar o reiniciar; no una entrega SMTP externa exactamente una vez. En el detalle administrativo, los correos pendientes se actualizan cada dos segundos. [emails.test.ts](apps/api/test/emails.test.ts) cubre dos workers, fallos SQL y procesos interrumpidos antes/después del commit.

Para ver pending en Docker, detén `docker compose stop worker`, confirma una reserva y reinicia con `docker compose up -d --wait worker`. En nativo basta detener/reiniciar la terminal de `pnpm worker`.

Para demostrar fallos en una demo aislada, agrega `EMAIL_FAILURE_MODE=first-two` o `always` a su `.env` y recrea solo el worker con `docker compose up -d --wait --force-recreate worker`. En nativo, cambia esa variable y reinicia `pnpm worker`. Vuelve a none para envíos nuevos; los eventos failed no se reactivan automáticamente. No hay endpoint público para forzar fallos ni un botón que acelere el backoff.

## Asistente con Gemini

Configura una clave de Gemini en `AI_API_KEY` y un modelo habilitado para ese proyecto en `AI_MODEL`, sin pegar la clave en código o frontend. `.env.example` propone `gemini-3.5-flash-lite`, verificado por API durante el desarrollo. Reinicia `pnpm dev` o recrea la app de Docker para cargar cambios de entorno.

Si el proveedor rechaza la petición o agota el tiempo de espera, el panel muestra un error recuperable. Revisa clave, modelo habilitado y cuota del proyecto; después reinicia la app si cambiaste el entorno. Los límites vigentes se consultan en la [documentación de Google](https://ai.google.dev/gemini-api/docs/pricing).

El panel aparece solo para cliente. Minimizar conserva texto y solicitud en curso; Conversaciones retoma historial, Nueva prepara otra y Revisar borrador abre el wizard. En móvil ocupa la pantalla y contiene el foco; Escape cierra, Enter envía y Shift+Enter agrega línea. Los enlaces antiguos `/#/asistente/<id>` abren el panel en Salas.

Historial, slots y draft viven en PostgreSQL. sessionStorage recuerda únicamente ID seleccionado/open por cuenta; el texto sin enviar permanece en memoria con aviso antes de cerrar/recargar. Cerrar sesión limpia la interfaz privada. La versión del draft impide que el chat pise cambios hechos en el wizard.

### Reglas 1–4

El [prompt](apps/api/src/prompts/booking-assistant.md) y el [esquema estricto](packages/shared/src/assistant.ts) se complementan con controles de servidor:

1. **Precios/disponibilidad desde el cotizador.** El modelo no recibe tarifas ni campos para importes/disponibilidad. QuoteService y BookingService generan las tarjetas y snapshots.
2. **Preguntar faltantes.** El modelo extrae intención/patch/evidencia; Zod strict, citas literales y comprobaciones de números, unidades, sala, extras y fechas rechazan rellenos sin respaldo. Código/Bogotá resuelve la fecha una vez; ambigüedades se aclaran y recargar no la desplaza.
3. **Sin acciones privilegiadas o datos ajenos.** No se entregan herramientas de confirmar/cancelar/listar otras cuentas. Dueño y rol derivan de sesión; el filtro del backend devuelve 404 para IDs ajenos. La confirmación sigue en el formulario.
4. **Instrucciones del usuario no amplían permisos.** Esquema cerrado, evidencia contrastada, servicios y autorización conservan las capacidades anteriores aunque el texto pida ignorarlas. No depende solo de que el modelo diga que no, ni se promete inmunidad absoluta a prompt injection. El cliente revisa el draft.

Se usa el SDK oficial `@google/genai`, timeout de 12 s, salida de 2048 tokens/16000 caracteres, entrada de 1000, contexto de seis mensajes recientes y máximo de 80 mensajes por conversación. La llamada al proveedor ocurre fuera de transacción; al volver, lock/versión y `clientMessageId` permiten persistir historial/slots/draft de forma atómica. Un replay válido devuelve lo guardado aunque traiga la versión anterior; un mensaje nuevo con versión obsoleta da 409.

Los mensajes escritos, slots e historial reciente se envían al proveedor: usa datos ficticios. No se adjuntan automáticamente contraseñas, cookies, clave, contacto del perfil o reservas ajenas; los logs propios registran requestId/latencia/resultado sin cuerpos. Sin clave o ante error del proveedor, el chat conserva lo ya guardado y permite reintentar, sin un simulador oculto.

## API y estructura

API bajo `/api`, autenticación en `/auth/login`, `/auth/logout` y `/me`. Catálogos en `/rooms` y `/services`. Mutaciones requieren Origin y cookie de sesión.

| Ruta principal                                                                       | Uso                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `POST /quotes`                                                                       | Sala/fecha/hora/duración/extras; Quote con desglose, canBook, motivo y alternativa. |
| `POST /bookings`, `GET /bookings?status=draft`, `GET /bookings/:id`                  | Crear/retomar reservas propias con clientRequestId.                                 |
| `PATCH /bookings/:id/draft`, `POST /bookings/:id/confirm`                            | Guardar step 1/2/3 con expectedVersion o confirmar.                                 |
| `GET /admin/bookings`, `GET /admin/bookings/:id`                                     | Paginación/filtros status/roomId y detalle.                                         |
| `POST /admin/bookings/:id/cancel`, `POST /admin/bookings/:id/complete`               | Motivo obligatorio al cancelar; fin alcanzado al completar.                         |
| `POST /chat/conversations`, `GET /chat/conversations`, `GET /chat/conversations/:id` | Conversaciones propias; lista de últimas 20.                                        |
| `POST /chat/conversations/:id/messages`                                              | kind=message con content, o accept_alternative; clientMessageId y expectedVersion.  |

Los contratos exactos están en [packages/shared/src](packages/shared/src). Validación 400, sesión 401, rol 403, recurso 404, conflicto 409, negocio 422, límites 429 y proveedor 503, según endpoint. Las respuestas de error contienen requestId. No se aceptan importes, ownerId o estados de reserva enviados por el cliente.

- [apps/api/src](apps/api/src): rutas, servicios, dominio, auth, worker, prompt y configuración.
- [apps/api/drizzle](apps/api/drizzle): migraciones; mantener el constraint SQL explícito al generar otras.
- [apps/web/src](apps/web/src): pantallas/componentes, formularios, queries y CSS.
- [packages/shared](packages/shared): contratos/tipos; [scripts](scripts) e [infra](infra): arranque, diagnóstico y demo.

## Verificación

```sh
# Con la base de pruebas de .env disponible:
pnpm verify
# Alternativa con la demo Docker iniciada:
docker compose run --rm app pnpm verify
# Parte 3, desde el host con Node soportado y Docker encendido:
pnpm test:sql
```

`verify` comprueba formato, lint, tipos, pruebas y build. Las 233 pruebas se distribuyen en 118 sin base de datos (`pnpm test`) y 115 de integración PostgreSQL (`pnpm test:integration`). Integración reinicia únicamente una base llamada `lumni_test` o `lumni_test_<sufijo>`; no uses esa base para datos que quieras conservar.

| Área                | Cobertura                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cotizador y estados | [Aritmética, calendario](apps/api/test/quotes.unit.test.ts) y [transiciones](apps/api/test/bookings.unit.test.ts).                                                                                |
| Reservas            | [Carreras HTTP, reintentos y precio pactado](apps/api/test/bookings.test.ts), con [exclusión en PostgreSQL real](apps/api/test/database.test.ts).                                                 |
| Correo              | [Dos workers, reintentos y recuperación de procesos interrumpidos](apps/api/test/emails.test.ts).                                                                                                 |
| Datos demo          | [Repetición, edición, concurrencia y rollback del seed](apps/api/test/seed-demo.test.ts).                                                                                                         |
| Asistente           | [Autorización, persistencia e idempotencia](apps/api/test/assistant.test.ts) y [validación de salidas/fechas](apps/api/test/assistant.unit.test.ts). El proveedor está simulado en estas pruebas. |
| SQL                 | [Seis escenarios y 48 comprobaciones](sql/README.md) sobre el DDL del enunciado y fixtures sintéticos.                                                                                            |

Se ejecutó `verify` con Node 22.18.0, 24.22.1 y 26.10.0, y en Docker con PostgreSQL 16. La integración de Gemini se comprobó además con la API real: cotización, creación de borrador, recarga y reintento sin confirmar ni generar correos. Esa comprobación no forma parte de las suites sin clave.

`pnpm format` aplica el formato y `pnpm format:check` lo comprueba; las migraciones y los archivos generados se excluyen.

### Navegador

Hay **15 recorridos Playwright**: 11 con backend/PG y 4 de UI del asistente con HTTP simulado; incluyen móvil, red, versiones, retoma, permisos, capturas, burbuja y teclado. Se ejecutaron con zona Pacific/Auckland. El fixture dedicado a mostrar failed/sent es explícito; el flujo principal observa el worker real. Los mocks de UI no demuestran el proveedor ni la persistencia del chat en PG.

Con Node/pnpm y dependencias instaladas, en una demo aislada sin tus datos:

```sh
APP_PORT=8097 POSTGRES_PORT=55452 docker compose --env-file .env.example --project-name lumni-e2e up --build -d --wait
pnpm --filter @lumni/web exec playwright install chromium
E2E_BASE_URL=http://localhost:8097 E2E_COMPOSE_PROJECT=lumni-e2e pnpm test:e2e
docker compose --env-file .env.example --project-name lumni-e2e down --volumes
```

En Linux instala también las bibliotecas del navegador con `pnpm --filter @lumni/web exec playwright install --with-deps chromium`. En PowerShell establece las variables con `$env:NOMBRE="valor"` antes del comando. El runner comprueba nombre de proyecto y puerto antes de escribir fixtures. Resultados en el directorio temporal o `E2E_OUTPUT_DIR`; Chromium instalado se admite con `PLAYWRIGHT_CHROMIUM_PATH`. No se guardan cookies/trazas de auth. [CI](.github/workflows/ci.yml) ejecuta la matriz Node 22/24/26, SQL en Node 22 y los recorridos Docker con Chromium.

## Parte 3 e informe del incidente

[consultas.sql](consultas.sql) se ejecuta sobre el DDL simplificado del enunciado, que difiere de la aplicación. [sql/README.md](sql/README.md) explica `pnpm test:sql`, psql, resultados y supuestos. La validación utiliza los fixtures sintéticos incluidos en `sql/seed.sql`. La respuesta sobre índices describe un método de medición; no incluye un benchmark de cinco millones de pagos.

[INCIDENTE.md](INCIDENTE.md) responde hipótesis, validación, recuperación, responsables, prevención y comunicación comercial. Es un análisis del escenario; no implementa WhatsApp ni afirma haber consultado producción o reenviado mensajes. [BONUS_RAILS.md](BONUS_RAILS.md) propone corrección con fuentes oficiales Rails 8.1; el Ruby ilustrativo no es una integración ejecutada en la app TypeScript.

## Uso de IA

Se utilizó **Codex** como asistente de desarrollo para TypeScript, SQL, pruebas, configuración y documentación. El trabajo incluyó el cotizador, las transacciones de reservas, administración, interfaz, worker de correo, integración del chat y consultas SQL. La IA del producto es **Gemini**, mediante `@google/genai`, y se limita a extraer la solicitud según el esquema descrito arriba.

Un ejemplo de propuesta descartada fue la primera interfaz del chat: Codex lo implementó como una página propia, con una barra lateral opcional. La descarté porque obligaba al cliente a salir del cotizador o del wizard para conversar, cuando el asistente debe acompañarlo hasta dejar el borrador listo y la confirmación ocurre en la pantalla de la reserva. Se rehízo como burbuja con panel lateral ([AssistantDock.tsx](apps/web/src/assistant/AssistantDock.tsx)), montada en el layout autenticado, sin cambiar el flujo de datos ni la persistencia de la conversación en el servidor. Las pruebas de navegador del panel ([chat.spec.ts](apps/web/e2e/chat.spec.ts)), con la API del chat simulada, comprueban que la conversación se conserva al minimizar y al recargar, que los enlaces abren el panel desde otras pantallas y que en móvil el foco queda contenido.

Otra corrección fue que Codex restringió `engines.node` a Node 22, lo que impedía instalar con Node 26; se amplió a 22.18+, 24 y 26 después de verificar cada versión ([package.json](package.json)).

La revisión manual incluyó los flujos cliente/administrador, el reintento de confirmación con el mismo ID, precio y fecha, y la captura de correo sin duplicación tras reiniciar el worker. Codex ejecutó las suites automatizadas, las pruebas de navegador, el recorrido real de Gemini y la comprobación de extensión del informe. Se distinguen las pruebas con proveedor simulado de las llamadas reales.

Las instrucciones técnicas utilizadas por el asistente están en [AGENTS.md](AGENTS.md).

## Fuera de alcance y limitaciones

- Sin SMTP/Mailpit ni entrega externa: PostgreSQL permite demostrar una captura única sin prometer lo que un proveedor no garantiza.
- Sin registro, recuperación de contraseña, pagos o facturación real: autenticación de dos roles para la prueba; payments pertenece solo al esquema de Parte 3. WhatsApp y Rails se resuelven como escritos, según enunciado.
- Gemini depende de clave/acceso/cuota y puede devolver 429/503. No hay proveedor alternativo ni mock silencioso del producto. Una petición activa por dueño/proceso y diez intentos/minuto en memoria; PG limita diez mensajes guardados/minuto. El límite de intentos fallidos no está distribuido entre instancias.
- No se implementa producción pública, TLS, rotación de credenciales, gestión multiempresa o un broker de jobs. La demo usa configuración y datos locales.

## Diagnóstico

| Síntoma                                            | Qué comprobar                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker socket ausente o motor apagado              | Inicia Docker Desktop/OrbStack u otro motor compatible. docker info debe mostrar servidor; revisa docker context ls si apunta a otra instalación. |
| pnpm rechaza Node                                  | Usa 22.18+/24/26 o ejecuta la demo Docker.                                                                                                        |
| Puerto ocupado                                     | Ajusta APP_PORT/POSTGRES_PORT; en nativo también URLs/proxy. Detén solo el proceso propio que corresponda.                                        |
| Credencial PostgreSQL no coincide tras editar .env | El volumen conserva la inicial; editar la variable no rota usuarios existentes.                                                                   |
| App/worker unhealthy                               | docker compose logs app worker postgres; no se considera listo hasta que los tres estén saludables.                                               |
| Chat 503/timeout                                   | Revisa el error del panel, clave/modelo/acceso y cuota de Gemini; no compartas la clave.                                                          |
| Correo pending                                     | Comprueba pnpm worker o servicio Docker y el backoff persistido. failed no se reintenta automáticamente.                                          |
