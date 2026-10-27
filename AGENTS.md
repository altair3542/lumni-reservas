# Instrucciones de Lumni Reservas

Guía técnica para trabajar en esta aplicación. Mantén las notas internas y la planificación fuera del repositorio; la documentación versionada debe describir el proyecto, su ejecución y sus verificaciones.

- Trabaja en el alcance solicitado y conserva modificaciones ajenas. Los commits y sus mensajes son manuales del usuario: no ejecutar git add, commit, rebase, squash o push por iniciativa propia. Publicar, desplegar o enviar mensajes requiere autorización explícita.
- Stack: TypeScript estricto, React/Vite, Express, PostgreSQL 16, Drizzle y Zod. Node 22.18+/24/26 y pnpm 11.25.0. Consulta README.md para configuración y recorrido.
- Demo: ./scripts/demo.sh o docker compose up --build -d --wait. Desarrollo: pnpm install --frozen-lockfile, pnpm dev:setup, pnpm dev; worker separado con pnpm worker. No cambies Node, Docker o contextos globales automáticamente.
- Verificación: pnpm verify, o docker compose run --rm app pnpm verify. Integración solo en `lumni_test` o `lumni_test_<sufijo>`; usa bases/proyectos aislados y nunca trunques la base de desarrollo.
- Parte 3: consultas.sql y sql/ usan el DDL del enunciado, independiente de la app. pnpm test:sql crea y elimina su propio contenedor. No mezclar sus fixtures con migraciones o seed de la aplicación.
- Conserva America/Bogota, COP enteros, borradores parciales, control de versión y snapshots del servidor. La confirmación es transaccional/idempotente y la exclusión GiST de 0001_booking_exclusion.sql impide solapes confirmed/completed. Mantener ese SQL al generar migraciones.
- Correo: outbox y captura local única en PostgreSQL, worker separado, savepoint/reintentos y failed visible. No prometer entrega SMTP externa exactamente una vez.
- Chat: extracción estricta/evidencia validada, fechas resueltas en código, precios/disponibilidad del cotizador; sin confirmar/cancelar o acceso ajeno. Clave solo en backend y sin fake silencioso. Distingue pruebas simuladas de llamadas reales al proveedor.
- Seed: solicitudes estables; no sobrescribir ediciones, fechas, usuarios o contraseñas existentes. SEED_DEMO_BOOKINGS=false omite nuevos ejemplos sin borrar los anteriores.
- Mantén legibilidad: pnpm format y pnpm format:check. No comprimir TS/TSX/CSS, relajar strict o cambiar reglas para acomodar tests. No formatear migraciones/generados. Nunca escribir secretos en Git, logs, frontend o respuestas.
- Registra solamente comprobaciones ejecutadas y sus límites. Una configuración CI, una prueba escrita o Syntax OK no equivalen a una ejecución integral aprobada.
