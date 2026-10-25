# Lumni Reservas

Aplicación de reservas de salas para un coworking, con React, Node/Express, TypeScript y PostgreSQL. **Estado: cotizador, reservas en tres pasos y administración disponibles desde la interfaz.** La confirmación crea un evento de correo pendiente; el worker de procesamiento y el chat se incorporan después.

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

**Abre http://localhost:8080**. API y web comparten origen. El primer arranque requiere conexión a Internet para descargar imágenes y dependencias; puede tardar varios minutos. `--wait` espera a que PostgreSQL y la aplicación estén saludables.

| Perfil demo | Correo | Contraseña |
| --- | --- | --- |
| Cliente | cliente@example.com | ClienteDemo2026! |
| Administrador | admin@example.com | AdminDemo2026! |

Son datos ficticios para evaluación local. La aplicación se publica solo en la interfaz local. El seed conserva usuarios, contraseñas, salas y borradores existentes; ejecutarlo de nuevo no duplica datos.

Comandos útiles:

```sh
docker compose logs -f app
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

`dev:setup` diagnostica Node/Docker, crea `.env` desde el ejemplo solo si no existe, inicia únicamente PostgreSQL y aplica migración/seed. No sobrescribe tu configuración. Abre **http://localhost:5173** (también funciona **http://127.0.0.1:5173**); API en **http://localhost:3000/api/health**. Detén API/web con `Ctrl+C`.

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
| Estado unhealthy | Consulta `docker compose logs app postgres`; el arranque no se considera completado hasta pasar ambos healthchecks. |

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

`verify` ejecuta lint, tipos, **178 pruebas: 6 de arranque + 18 contratos + 72 de API/dominio sin BD + 6 de cliente web/fechas + 76 de integración PostgreSQL**, y build. La integración exige `TEST_DATABASE_URL` y solo admite bases `lumni_test` o `lumni_test_<sufijo>`. No se sustituye PostgreSQL con mocks.

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
- **Correos**: filtra por estado, revisa intentos/errores y consulta contenido y captura, si existe. Hasta implementar el worker, las confirmaciones normales permanecen pendientes.

Navegación con rutas hash, por ejemplo `/#/salas` y `/#/reservas/<id>`: se pueden recargar enlaces directos tanto con Vite como con la demo Docker, sin exigir configuración de fallback de Express. Cliente y admin tienen navegación separada; los permisos reales siguen en el backend.

El horario siempre se presenta en America/Bogota, también si el equipo está en otra zona. Fallos de red conservan la edición; una versión obsoleta requiere cargar explícitamente la versión del servidor antes de sobrescribir. Sesión invalidada permite volver a ingresar conservando la edición en memoria para la misma cuenta. Al cambiar de cuenta se limpia la caché privada. No hay tokens ni fuente de verdad del draft en localStorage.

## Pruebas de navegador

Además de `pnpm verify`, hay **10 recorridos Playwright** con PostgreSQL real: cliente→confirmación→admin/cancelar, retoma en navegador nuevo, red, versiones, colisión/alternativa, sesión, cambios sin guardar, paginación/filtros/403, móvil y estados/capturas de correo. Se ejecutan con zona de navegador Pacific/Auckland para comprobar la presentación en Colombia.

Usa una demo **aislada**, que no contenga tus datos de desarrollo. En macOS/Linux:

```sh
APP_PORT=8097 POSTGRES_PORT=55452 docker compose --project-name lumni-e2e up --build -d --wait
pnpm --filter @lumni/web exec playwright install chromium
E2E_BASE_URL=http://localhost:8097 E2E_COMPOSE_PROJECT=lumni-e2e pnpm test:e2e
```

En PowerShell, establece esas variables con `$env:NOMBRE="valor"` antes del comando. El runner exige proyecto de pruebas y comprueba su puerto publicado antes de crear fixtures. Los correos failed/sent/capturados de esas pruebas son fixtures explícitos; no representan un worker real ni envíos externos. No hay endpoints de producción para forzar fallos.

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

El evento de correo queda `pending`, sin enviar mensajes ni crear capturas todavía. El worker de A5 procesará esos eventos. La interfaz permite guardar cada paso, retomar desde Mis reservas y confirmar mediante un botón explícito.

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

Los correos reales creados hasta esta fase siguen pending. La inspección de failed/sent/capturas se verifica con fixtures de PostgreSQL; el worker que los producirá se incorpora en A5. El panel visual permite consultar estos estados y el contenido de cada confirmación; nunca inserta el HTML del correo como contenido ejecutable.

## Estructura y decisiones

- `apps/api`: Express 5, `createApp`, health, sesiones, catálogos, cotizador, reservas y administración autenticadas.
- `apps/web`: React 18/Vite, rutas por rol, cotizador, reservas/wizard y administración; cliente API validado, React Hook Form, TanStack Query, CSS por responsabilidad y carga diferida de pantallas.
- `packages/shared`: contratos Zod estrictos de login, quote, draft, confirmación/versiones, admin, correo, extracción IA y errores HTTP.
- `apps/api/src/db` y `apps/api/drizzle`: diez tablas, migraciones Drizzle/SQL, checks, claves únicas y seed.
- `Dockerfile`, `docker-compose.yml`, `infra/docker`: Node controlado dentro de la imagen, web compilada servida por Express, PostgreSQL 16 y arranque idempotente sin depender de .env del host.
- `scripts`: diagnóstico, preparación nativa, demo y comprobación HTTP.

PostgreSQL tiene tres bases separadas. `infra/postgres/init.sql` crea las de pruebas/Parte 3 al inicializar el volumen. La Parte 3 conservará su DDL independiente en A7. Zona America/Bogota; dinero entero COP. Capacidades 4/8/16 y extras proyector 20.000/café 10.000 COP son supuestos documentados.

Los drafts admiten datos parciales. Confirmed/completed exigen datos completos y rangos positivos. `bookings_no_overlap` es una exclusión GiST parcial para esos estados con intervalos `[inicio, fin)`, escrita explícitamente en `0001_booking_exclusion.sql`. Para verla:

```sh
docker compose exec postgres psql -U lumni -d lumni_app -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='bookings_no_overlap';"
```

La confirmación HTTP usa esta exclusión y una transacción para estado, líneas y outbox. Las pruebas de A2 enfrentan solicitudes HTTP simultáneas de dos clientes con PostgreSQL real, además de las pruebas iniciales del constraint. El worker de correo queda pendiente.

La sesión usa cookie opaca HttpOnly/SameSite=Lax; hash de token en PostgreSQL y scrypt con sal para contraseñas. Las mutaciones exigen Origin. En desarrollo HTTP se aceptan localhost y 127.0.0.1 únicamente con el mismo puerto configurado; otros hosts y puertos siguen bloqueados. Producción conserva un único origen exacto. El entorno Docker de demostración permite HTTP local; Secure se activa con NODE_ENV=production o WEB_ORIGIN HTTPS; producción debe servirse por HTTPS. Las rutas administrativas exigen sesión y rol admin; recursos de otro cliente conservan el 404. El rol se consulta en PostgreSQL, sin confiar en campos enviados por el navegador.

## Alcance pendiente y uso de IA

Pendientes: revisión de A4; A5 worker; A6 IA; A7 SQL; A8 incidente/bonus; A9/A10 cierre. Las tablas y contratos preparatorios no equivalen a esos flujos. La fecha límite oficial sigue pendiente de confirmación.

Codex asistió en la base, cotizador, reservas/administración, interfaz y correcciones de portabilidad/origen/formato. Ejemplo real corregido: la restricción inicial rechazaba Node 26 sin probarlo; se amplió el soporte tras ejecutar las comprobaciones con Node 22/24/26 y se añadió una ruta Docker sin Node local. También se corrigieron configuración de pnpm y errores de tipos detectados por las herramientas. Codex ejecutó las comprobaciones descritas; la revisión del candidato permanece pendiente. No se le atribuyen pruebas que no haya ejecutado.

Las instrucciones de trabajo de esta aplicación están en `AGENTS.md`. La planeación, los briefs y las referencias se mantienen fuera del repositorio y no se necesitan para instalar, ejecutar o probar la aplicación. Los commits y sus mensajes son manuales del usuario; no se hace staging, commit ni publicación automática.
