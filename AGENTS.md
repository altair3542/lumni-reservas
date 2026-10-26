# Instrucciones de Lumni Reservas

Esta carpeta contiene la aplicación. La planeación, los briefs A0–A10, referencias y registros de trabajo se mantienen en la carpeta hermana `../LUMNI_CODEX_PERSONAL/`. Consulta allí `AGENTS.md`, `PROGRESO.md` y el brief solicitado antes de implementar una fase; no copies ese material al repositorio de aplicación. La ejecución, instalación y pruebas de la app son independientes de esa carpeta.

- Ejecuta únicamente el alcance autorizado por el usuario. A6 base está confirmada en `3a34521` y UI de burbuja/panel en `134420c`. El usuario autorizó continuar a A7 el 2026-10-26; SQL implementado y verificado en base independiente, pendiente de revisión humana. No iniciar A8 sin nueva autorización ni atribuir revisión detallada de código.
- Los commits y sus mensajes son manuales del usuario. No ejecutar git add, commit, rebase ni publicar cambios por iniciativa propia.
- Conserva cambios ajenos. No reescribir historial ni limpiar archivos de forma destructiva.
- Usa TypeScript estricto, React, Express y PostgreSQL 16. Dinero entero COP y zona America/Bogota. Conserva la exclusión GiST de reservas y los contratos compartidos.
- Node soportado: 22.18+, 24 y 26; pnpm 11.25.0. Demo: ./scripts/demo.sh. Desarrollo: pnpm install --frozen-lockfile, pnpm dev:setup, pnpm dev.
- Verificación: pnpm verify, o docker compose run --rm app pnpm verify. La integración exige PostgreSQL real en una base de pruebas aislada.
- Parte 3: consultas.sql y sql/ usan el DDL del PDF. pnpm test:sql crea y elimina su propio contenedor; no usa .env ni la base de desarrollo. Mantén la separación y los supuestos documentados.
- No incluir secretos, material de planeación ni registros personales. No atribuir pruebas o revisiones humanas que no ocurrieron.

- Mantén el código legible desde cada entrega: ejecuta pnpm format y pnpm format:check. No pospongas el formato de TS/TSX/CSS ni comprimas bloques manualmente. La configuración de Prettier es compartida y verify la comprueba.

- Ampliación demo autorizada el 2026-10-26: db:setup/seed CLI agrega24 ejemplos en desarrollo; pnpm dev lo ejecuta antes del servidor y Docker en su entrypoint. Mantén solicitudes estables, preservación de ediciones y separación de Parte3. SEED_DEMO_BOOKINGS=false desactiva la ampliación. A7 en commit manual bfd03d4; A8 sigue sin iniciar.
