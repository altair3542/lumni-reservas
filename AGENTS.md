# AGENTS.md — Lumni TI | Codex personal

Estas instrucciones rigen el repositorio **completo** al trabajar con Codex. Los briefs `agentes/A0.md` ... `agentes/A10.md` son **tareas**, no agentes autónomos que se ejecuten solos. Por instrucción explícita del usuario, la raíz de aplicación es **`lumni-reservas/`**, carpeta hermana del paquete original `LUMNI_CODEX_PERSONAL/`. Se conservó aquí una copia versionada de la planeación. **A0 debe crear `apps/`, `packages/` y la configuración aquí mismo, sin crear otro proyecto anidado**.

## Jerarquía obligatoria

1. `referencia/Prueba_tecnica_Lumni_TI_F.pdf` (enunciado normativo).
2. `PLAN_MAESTRO.md` (alcance, prioridades, estrategia, supuestos).
3. `CONTRATOS_Y_MODELO.md` (contratos API/DB e invariantes).
4. `MATRIZ_REQUISITOS.md`, `PRUEBAS_Y_ACEPTACION.md` (criterios verificables).
5. Brief asignado en `agentes/Ax.md` (límite de la tarea).
6. `docs/decisiones.md` (decisiones que no contradicen lo anterior).

Si hay conflicto, indica archivo/regla, aplica la fuente superior y documenta la decisión. No alteres reglas de negocio para simplificar pruebas.

## Cómo trabajar en este repositorio

- **Solo ejecuta el brief solicitado por el usuario**, no la siguiente fase por iniciativa propia. Empieza en A0.
- Lee `PROGRESO.md` al empezar y actualízalo al cerrar cada fase; registra pruebas **realmente ejecutadas** con comando, resultado y bloqueo.
- Conserva las modificaciones de otras tareas y verifica `git status` antes de modificar; no hagas `reset --hard`, limpieza destructiva, squash ni force push sin autorización.
- Usa cambios pequeños con commits reales y mensajes descriptivos; si el repositorio aún no tiene Git, inicialízalo en A0 y no inventes un remoto.
- Antes de un cambio de contrato, migración o archivo compartido, verifica dependientes y pide revisión cuando aplique. Para tareas paralelas, usa worktrees/ramas aisladas **solo si hay acceso real a esa función**; si no, ejecución secuencial.
- Respeta el checkpoint humano: presenta resumen, diferencias, pruebas, riesgos y commits, y **detente** antes de avanzar al siguiente brief/merge de alto riesgo.
- Lleva decisiones a `docs/decisiones.md` y correcciones/rechazos auténticos de la IA a `docs/ai-log.md`. No inventes evidencia ni resultados para cumplir el README.
- No uses datos, secretos, repositorios, tokens ni cuentas del entorno laboral. Este trabajo vive en el espacio **personal**. No presupongas integración/sincronización con otro asistente o cuenta.

## Invariantes técnicas

- Stack: TypeScript estricto, Node/Express, React/Vite, pnpm, PostgreSQL, Drizzle y Zod según plan.
- Zona `America/Bogota`; COP enteros; cotizador, transiciones y fechas relativas con lógica testeable.
- Borradores parciales, snapshots calculados por backend, idempotencia; exclusión GiST para impedir solapes de reservas `confirmed/completed` con intervalos `[inicio, fin)`.
- Outbox transaccional + captura única en PostgreSQL. SMTP/Mailpit es **opcional** y no promete entrega externa exactamente una vez. Worker de segundo plano, reintentos y `failed` en admin.
- Chat IA sin permiso de confirmar/cancelar ni ver reservas ajenas; extracción estricta validada; precios/alternativas desde backend; fecha relativa resuelta en código; reanudación.
- Parte 3 usa el esquema **independiente** del PDF en `consultas.sql`; `INCIDENTE.md` ≤ 2 páginas; bonus Rails opcional separado.
- Protege secretos con `.gitignore` y `.env.example`; no imprimas variables sensibles ni publiques credenciales.

## Validación y cierre de fase

- Ejecuta los comandos pertinentes una vez existentes (lint, typecheck, tests, migraciones/integ). Para concurrencia, usa PostgreSQL real; mocks no sustituyen las pruebas de carrera.
- Nunca digas «verde», «hecho», «probado» o «CI pasa» sin evidencia. Si algo no corre, anota **bloqueado/no ejecutado**.
- Reporta al usuario: fase, requisitos R#, archivos, decisiones, comandos y salida relevante, commits, pendientes/riesgos y checkpoint requerido. Actualiza `PROGRESO.md`.
- No asumas que una suscripción de Codex incluye créditos para el proveedor del asistente de reservas: verifica acceso/API key personal cuando llegue A6 (o registra bloqueo y usa fake en pruebas).
