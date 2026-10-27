# Lumni Reservas

Una aplicación para cotizar y reservar salas de coworking. El cliente puede guardar una reserva por pasos y retomarla después; el administrador consulta y gestiona las reservas. También hay confirmaciones de correo en segundo plano y un asistente que ayuda a preparar el borrador.

Está hecha con TypeScript, React/Vite, Express y PostgreSQL 16. Uso Drizzle para las migraciones y Zod para validar los datos que comparten el frontend y la API.

## Cómo correrla

Desde la raíz del repositorio, con Docker iniciado y Compose 2.20 o superior:

```sh
docker compose up --build -d --wait
```

Abre **http://localhost:8080**. El arranque prepara la base, carga los datos de ejemplo e inicia la app y el worker. No hace falta instalar Node ni crear `.env` para probar las reservas. El primer build necesita Internet y puede tardar unos minutos. En macOS/Linux también puedes usar `./scripts/demo.sh`.

| Perfil        | Correo              | Contraseña       |
| ------------- | ------------------- | ---------------- |
| Cliente       | cliente@example.com | ClienteDemo2026! |
| Administrador | admin@example.com   | AdminDemo2026!   |

Son cuentas ficticias para la demo. En una base nueva se crean tres salas, dos servicios y 25 reservas de ejemplo en distintos estados. Los siguientes arranques conservan los datos y las ediciones. `SEED_DEMO_BOOKINGS=false` evita agregar nuevos ejemplos, sin borrar los existentes.

Para detenerla, `docker compose down`; los datos quedan en el volumen. Si algo falla, revisa `docker compose logs app worker postgres` y comprueba que `docker info` encuentre el motor. Los puertos se pueden cambiar con `APP_PORT` y `POSTGRES_PORT` en `.env`.

### Desarrollo con Node

Necesitas **Node 22.18+, 24 o 26**, **pnpm 11.25.0** y PostgreSQL. Para preparar la base local con Docker:

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

La web queda en **http://localhost:5173** y la API en **http://localhost:3000**. En otra terminal ejecuta `pnpm worker` para procesar los correos.

`dev:setup` crea `.env` desde [.env.example](.env.example) si no existe e inicia PostgreSQL. `pnpm dev` aplica las migraciones y el seed antes de levantar los servidores. Si ya tienes PostgreSQL, crea `lumni_app` y `lumni_test`, ajusta las URLs del ejemplo y usa `pnpm dev` y `pnpm worker` sin pasar por `dev:setup`.

## Qué probar

1. Entra como cliente y cotiza una sala pequeña un sábado futuro libre, a las 09:00, por cuatro horas, con proyector y café. El total debe ser **210.000 COP**: 160.000 de base, menos 16.000 de descuento, más 36.000 de recargo y 30.000 de servicios.
2. Continúa con la reserva y guarda los pasos. Recarga o vuelve a entrar para retomar lo guardado. La cotización no aparta la sala; el cupo se asegura al confirmar.
3. Entra como administrador. Filtra por sala o estado, abre el detalle y revisa el correo capturado. Puedes cancelar con motivo o completar una reserva cuyo horario ya terminó.
4. Con Gemini configurado, abre la burbuja y pide una sala para seis personas un sábado por la mañana con proyector. El asistente preguntará lo que falte y dejará un borrador para revisar. La confirmación se hace desde el formulario.

El correo se muestra como **Capturado** porque se guarda en PostgreSQL para consultarlo en local; no se envía a un buzón externo. Para probar reintentos en una demo aislada, usa `EMAIL_FAILURE_MODE=first-two` o `always` y reinicia el worker. Los eventos que agotan sus reintentos quedan en `failed`, visibles en el detalle administrativo.

## Decisiones que tomé

La hora de referencia es **America/Bogota** y los importes se manejan en pesos colombianos enteros. Apliqué las tarifas, descuentos y horarios del enunciado. Para lo que no estaba definido, asumí:

- Inicios en bloques de media hora. Los intervalos son `[inicio, fin)`: una reserva puede empezar justo cuando termina otra.
- Capacidades de 4, 8 y 16 personas. Proyector a 20.000 y café a 10.000 COP por reserva, añadidos después del descuento y el recargo de la sala.
- Descuentos no acumulables y redondeo por componente al peso, con mitades hacia arriba.
- Las reservas `confirmed` y `completed` ocupan la sala; los borradores y las canceladas no. Una alternativa conserva sala, día y duración.

**Dos confirmaciones para el mismo horario.** La [restricción de PostgreSQL](apps/api/drizzle/0001_booking_exclusion.sql) impide guardar dos reservas que se crucen en la misma sala. Aunque ambas cotizaciones vieran cupo, solo una confirmación gana; la otra recibe un conflicto y una alternativa cuando existe.

**Confirmar dos veces la misma reserva.** [BookingService](apps/api/src/bookings/service.ts) bloquea la fila dentro de una transacción. Si ya está confirmada, devuelve el mismo ID, fecha y precio guardados. No recalcula el importe, repite líneas ni crea otro evento de correo. Los cambios del borrador usan una versión para evitar sobrescribir una edición más reciente.

**Correo en segundo plano.** La confirmación guarda el evento en esa misma transacción y el worker lo procesa aparte. Hay hasta cinco reintentos, con esperas de 1, 2, 4, 8 y 16 minutos. La captura y el estado del evento se guardan juntos, con claves únicas, para conservar una sola captura incluso si se reinicia el proceso.

La sesión va en una cookie HttpOnly y cada ruta comprueba dueño o rol en el servidor. El login admite 30 solicitudes por IP y minuto, por proceso, antes de calcular la contraseña; devuelve 429 con `Retry-After` al superar el límite. El texto inválido se rechaza antes de guardarlo y los logs excluyen cuerpos, credenciales y errores crudos.

## Cómo funciona el asistente

Para activarlo, prepara `.env` desde [.env.example](.env.example) si aún no existe y completa `AI_API_KEY` y `AI_MODEL`. El ejemplo propone `gemini-3.5-flash-lite`, que se comprobó por API durante el desarrollo. La clave queda en el backend y no debe subirse a Git. Reinicia `pnpm dev` o ejecuta de nuevo `docker compose up -d --wait` para cargar el entorno.

El modelo extrae datos, pero las decisiones de la reserva siguen en el servidor:

- Los precios y la disponibilidad vienen del cotizador.
- La salida se valida con un [esquema cerrado](packages/shared/src/assistant.ts) y se contrasta con citas del mensaje. Si falta información o hay ambigüedad, se pregunta. Las fechas relativas se resuelven en código, en hora de Colombia.
- El chat puede preparar un borrador propio; no tiene acciones para confirmar, cancelar ni consultar reservas ajenas.
- Pedir que ignore las reglas no amplía esas capacidades: autorización, esquema y comprobaciones siguen aplicándose fuera del modelo. La defensa no depende solo del [prompt](apps/api/src/prompts/booking-assistant.md), ni supone inmunidad absoluta a instrucciones maliciosas.

La conversación y el borrador se guardan en PostgreSQL y se recuperan al recargar. El texto aún no enviado queda en memoria. Gemini recibe los mensajes del chat y el contexto reciente; usa datos ficticios. Si falta la clave o el proveedor falla, el panel permite reintentar y conserva lo guardado. Las reservas siguen funcionando sin IA.

## Pruebas

Con la base de pruebas disponible:

```sh
pnpm verify
# O desde la demo Docker:
docker compose run --rm app pnpm verify
# Consultas de la Parte 3; necesita Node y Docker:
pnpm test:sql
```

`verify` comprueba formato, lint, tipos, **246 pruebas** y build. Incluye cotización, estados, permisos, confirmaciones simultáneas, reintentos de correo y validación del chat. Las pruebas de integración reinician solo `lumni_test` o `lumni_test_<sufijo>`; no uses esas bases para datos que quieras conservar. Las consultas SQL tienen 48 comprobaciones independientes.

También pasaron **15 recorridos de navegador**: 11 con backend y PostgreSQL, y 4 de interfaz del chat con su API simulada. Las pruebas de API del chat simulan el proveedor; durante el desarrollo también se comprobó Gemini con llamadas reales. La configuración de [CI](.github/workflows/ci.yml) está incluida.

<details>
<summary>Ejecutar los recorridos de navegador</summary>

Usa una demo aislada, porque el runner crea datos de prueba:

```sh
APP_PORT=8097 POSTGRES_PORT=55452 docker compose --env-file .env.example --project-name lumni-e2e up --build -d --wait
pnpm --filter @lumni/web exec playwright install chromium
E2E_BASE_URL=http://localhost:8097 E2E_COMPOSE_PROJECT=lumni-e2e pnpm test:e2e
docker compose --env-file .env.example --project-name lumni-e2e down --volumes
```

En Linux usa `playwright install --with-deps chromium`. En PowerShell establece las variables con `$env:NOMBRE="valor"` antes del comando.

</details>

## SQL, incidente y bonus

- [consultas.sql](consultas.sql) usa el esquema simplificado del enunciado, separado de la app. [sql/README.md](sql/README.md) explica la ejecución y los supuestos. Los datos incluidos son sintéticos; la propuesta de índices no incluye una medición sobre cinco millones de pagos.
- [INCIDENTE.md](INCIDENTE.md) desarrolla la hipótesis, recuperación y prevención del escenario de WhatsApp, junto al mensaje para comercial. Es un análisis, no una integración implementada.
- [BONUS_RAILS.md](BONUS_RAILS.md) explica el problema de regenerar facturas y propone una corrección. El código Ruby es ilustrativo, no parte de la aplicación TypeScript.

## Uso de IA

Usé **Codex** para desarrollar código, pruebas, SQL, configuración y documentación. **Gemini** es la IA que usa el producto para interpretar las solicitudes de reserva. Las instrucciones de desarrollo están en [AGENTS.md](AGENTS.md).

Descarté la primera interfaz del chat porque abría una página separada y obligaba a salir del cotizador o del formulario. La cambié por una burbuja con panel lateral, para que acompañara el proceso sin interrumpirlo. Conservé la conversación en el servidor y comprobamos el panel con [pruebas de navegador](apps/web/e2e/chat.spec.ts), con la API del chat simulada.

En la revisión manual probé los flujos de cliente y administrador, la confirmación repetida con el mismo ID, precio y fecha, y la captura del correo sin duplicados tras reiniciar el worker. Codex ejecutó las suites automatizadas y las comprobaciones de navegador y de la API real de Gemini.

## Qué quedó por fuera

Me limité a las cuentas sembradas: no hay registro, recuperación de contraseña, pagos ni facturación real. Los pagos pertenecen solo al ejercicio SQL; WhatsApp y Rails se entregan como análisis según el enunciado.

La configuración está pensada para una demo local. No añadí despliegue público, TLS, límites distribuidos ni un proveedor alternativo de IA. Gemini depende del acceso y la cuota del proyecto; sus fallos se muestran al usuario.
