# Lumni Reservas

Aplicación de reservas de salas para un coworking, con React, Node/Express, TypeScript y PostgreSQL. **Estado: base A0 y cotizador backend A1 implementados; revisión de A1 pendiente.** La pantalla del cotizador, confirmación de reservas, administración y chat se incorporan en las fases siguientes.

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

## Verificar

Dentro de Docker, con la demo ya iniciada:

```sh
docker compose run --rm app pnpm verify
```

En desarrollo nativo:

```sh
pnpm verify
```

`verify` ejecuta lint, tipos, **105 pruebas: 6 de arranque + 16 contratos + 50 de API/dominio sin BD + 33 de integración PostgreSQL**, y build. La integración exige `TEST_DATABASE_URL` y solo admite bases `lumni_test` o `lumni_test_<sufijo>`. No se sustituye PostgreSQL con mocks.

La verificación local cubre los tres runtimes soportados, migraciones sobre base vacía, seed repetido, login real cliente/admin, expiración/logout, roles y exclusión de solapamientos con conexiones independientes. La demo comprueba además HTML, salud y sesión/catálogo/logout por HTTP. La verificación descrita se ejecutó localmente; la revisión de A1 continúa pendiente.

GitHub Actions está configurado con matriz Node 22/24/26 y un trabajo Docker. La ejecución remota depende de publicar el repositorio; no se afirma que ya haya ocurrido.

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

Disponibilidad: solo confirmed/completed ocupan, con rangos `[inicio, fin)`. La alternativa conserva sala, fecha y duración, avanza en bloques de 30 minutos, respeta 07:00–21:00 y no propone instantes pasados. Domingo, pasado o falta de hueco dejan alternativa null. **Cotizar no reserva ni bloquea cupo.** La pantalla para este endpoint se desarrolla en A4.

`QuoteService` en `apps/api/src/quotes/service.ts` es reutilizable por las fases siguientes; `domain.ts` contiene cálculo, calendario y búsqueda puros. Los contratos compartidos y las migraciones se conservaron sin cambios.

## Estructura y decisiones

- `apps/api`: Express 5, `createApp`, health, login/logout/me y catálogos autenticados.
- `apps/web`: React 18/Vite, pantalla de acceso y catálogo; cliente API con validación de respuestas.
- `packages/shared`: contratos Zod estrictos de login, quote, draft, confirmación/versiones, admin, correo, extracción IA y errores HTTP.
- `apps/api/src/db` y `apps/api/drizzle`: diez tablas, migraciones Drizzle/SQL, checks, claves únicas y seed.
- `Dockerfile`, `docker-compose.yml`, `infra/docker`: Node controlado dentro de la imagen, web compilada servida por Express, PostgreSQL 16 y arranque idempotente sin depender de .env del host.
- `scripts`: diagnóstico, preparación nativa, demo y comprobación HTTP.

PostgreSQL tiene tres bases separadas. `infra/postgres/init.sql` crea las de pruebas/Parte 3 al inicializar el volumen. La Parte 3 conservará su DDL independiente en A7. Zona America/Bogota; dinero entero COP. Capacidades 4/8/16 y extras proyector 20.000/café 10.000 COP son supuestos documentados.

Los drafts admiten datos parciales. Confirmed/completed exigen datos completos y rangos positivos. `bookings_no_overlap` es una exclusión GiST parcial para esos estados con intervalos `[inicio, fin)`, escrita explícitamente en `0001_booking_exclusion.sql`. Para verla:

```sh
docker compose exec postgres psql -U lumni -d lumni_app -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='bookings_no_overlap';"
```

La confirmación transaccional/idempotente y el worker aún corresponden a A2/A5. Las pruebas actuales de carrera son de restricción en DB; no se atribuye a A0 una ruta HTTP de confirmación que todavía no existe.

La sesión usa cookie opaca HttpOnly/SameSite=Lax; hash de token en PostgreSQL y scrypt con sal para contraseñas. Las mutaciones exigen Origin. En desarrollo HTTP se aceptan localhost y 127.0.0.1 únicamente con el mismo puerto configurado; otros hosts y puertos siguen bloqueados. Producción conserva un único origen exacto. El entorno Docker de demostración permite HTTP local; Secure se activa con NODE_ENV=production y exige HTTPS. A3 ampliará el endurecimiento de auth.

## Alcance pendiente y uso de IA

Pendientes: A2 API de borradores/confirmación; A3 admin/endurecimiento; A4 wizard/UI completa; A5 worker; A6 IA; A7 SQL; A8 incidente/bonus; A9/A10 cierre. Las tablas y contratos preparatorios no equivalen a esos flujos. La fecha límite oficial sigue pendiente de confirmación.

Codex (GPT-6) asistió en A0 y en la corrección de portabilidad. Ejemplo real corregido: la restricción inicial rechazaba Node 26 sin probarlo; se amplió el soporte tras ejecutar las comprobaciones con Node 22/24/26 y se añadió una ruta Docker sin Node local. También se corrigieron configuración de pnpm y errores de tipos detectados por las herramientas. Codex ejecutó las comprobaciones descritas; la revisión del candidato permanece pendiente. No se le atribuyen pruebas que no haya ejecutado.

Las instrucciones de trabajo de esta aplicación están en `AGENTS.md`. La planeación, los briefs y las referencias se mantienen fuera del repositorio y no se necesitan para instalar, ejecutar o probar la aplicación. Los commits y sus mensajes son manuales del usuario; no se hace staging, commit ni publicación automática.
