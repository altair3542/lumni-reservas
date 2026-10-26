# Instrucciones de Lumni Reservas

Esta carpeta contiene la aplicación y sus entregables. La planeación, briefs A0–A10, referencias y registros de desarrollo permanecen en `../LUMNI_CODEX_PERSONAL/`, por instrucción del candidato. Consulta allí el brief autorizado antes de implementar una fase; no copies ese material a este repositorio. Instalar, ejecutar y probar la aplicación no depende de esa carpeta.

- Trabaja solo en el alcance autorizado. A9 documenta la entrega y sus evidencias; no iniciar A10, publicar, desplegar o enviar mensajes sin autorización. Los briefs son fases, no agentes autónomos. No atribuyas revisión o pruebas humanas que no se hayan reportado.
- Git es manual: el candidato hace los commits y sus mensajes. No ejecutar git add, commit, rebase, squash ni push por iniciativa propia. Revisa git status y conserva modificaciones ajenas; no reescribas historial ni borres datos para facilitar pruebas.
- Stack: TypeScript estricto, React/Vite, Express, PostgreSQL 16, Drizzle y Zod. Node 22.18+/24/26; pnpm 11.25.0 fijado. Consulta README.md para configuración y recorrido.
- Demo: ./scripts/demo.sh o docker compose up --build -d --wait. Desarrollo: pnpm install --frozen-lockfile, pnpm dev:setup, pnpm dev; worker separado con pnpm worker. No cambies Node/Docker/contextos globales automáticamente.
- pnpm verify comprueba formato/lint/tipos/tests/build; integración solo en `lumni_test` o `lumni_test_<sufijo>`. En Docker: docker compose run --rm app pnpm verify. Usa proyectos/bases de prueba aislados; nunca trunques la base de desarrollo.
- Parte 3: consultas.sql y sql/ usan el DDL del enunciado, separado de la app. pnpm test:sql crea y elimina su propio contenedor. No mezclar sus fixtures con migraciones o seed de la aplicación.
- Conserva zona America/Bogota, COP enteros, borradores parciales, control de versión y snapshot del servidor. Confirmar es transaccional e idempotente; la exclusión GiST de 0001_booking_exclusion.sql impide solapes confirmed/completed. No retirar ese SQL al generar migraciones.
- Correo: outbox y captura local única en PostgreSQL, worker separado, savepoint/reintentos y failed visible. No prometer entrega SMTP externa exactamente una vez.
- Chat: extracción estricta con evidencia validada, fechas resueltas en código, precio/disponibilidad del cotizador; sin confirmar/cancelar o acceso ajeno. Clave solo en backend y sin fake silencioso. Distingue tests con LlmClient falso/UI simulada de prueba real de Gemini.
- Seed demo: solicitudes estables, no sobrescribir ediciones/fechas, usuarios o contraseñas existentes. SEED_DEMO_BOOKINGS=false omite la ampliación; no borra ejemplos previos.
- Mantén legibilidad desde cada entrega: pnpm format y pnpm format:check. No comprimir TS/TSX/CSS, relajar strict o cambiar reglas de negocio para acomodar tests. No formatear migraciones/generados. No escribir secretos en archivos versionados, logs, frontend o respuestas.
- Registra comprobaciones realmente ejecutadas y sus límites. Actualiza el seguimiento externo y detente en el checkpoint de fase. Una configuración CI, una prueba escrita o Syntax OK no equivalen a una ejecución integral aprobada.
