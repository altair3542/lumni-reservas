# Registro de adaptación a Codex personal — v1.2 (23/10/2026)

## Objetivo

Pasar del plan unificado v1.1 a un proyecto **operable desde una cuenta personal de Codex** sin requerir otro asistente ni copiar documentación entre dos repositorios.

## Cambios

1. `PLANTILLA_CLAUDE.md` se sustituye por `AGENTS.md` activo en la raíz, con política de lectura, límites por fase, invariantes, tests y checkpoints.
2. El paquete extraído se considera **la raíz del repositorio final**; A0 crea la app aquí. Se ajustaron `PLAN_MAESTRO.md` y `agentes/A0.md` para evitar un proyecto anidado.
3. `README.md` incluye pasos de inicio en Codex, estado no implementado y separación de cuentas.
4. `GUIA_CODEX_PERSONAL.md` define dependencias, trabajo secuencial, worktrees opcionales y gates. No promete subagentes automáticos.
5. `PROMPTS_CODEX.md` incluye mensajes de arranque A0, reanudación, ejecución de un brief, revisión adversarial y cierre.
6. `PROGRESO.md` permite reanudar entre sesiones con pruebas/commits comprobables y autorización explícita.
7. `docs/decisiones.md`, `docs/ai-log.md` y `.gitignore` habilitan registros y seguridad desde el inicio.
8. Se ajustaron `agentes/A9.md` y `MATRIZ_REQUISITOS.md` para declarar `AGENTS.md` al evaluador; todos los demás briefs siguen vigentes sin reinterpretación de requisitos.

## Qué **no** se ha hecho

- No se implementó el código de la aplicación ni se lanzó Docker, npm/pnpm, migraciones, tests ni CI.
- No se configuró remoto GitHub ni ninguna clave o proveedor IA.
- No hay transferencia/sincronización de historial entre cuentas.
- No se verificó el plazo real de Lumni: el objetivo 27 de octubre de 2026 permanece **provisional**.

## Consideraciones de compatibilidad

`AGENTS.md` es un archivo de instrucciones de repositorio reconocido por Codex. `PROGRESO.md` y los briefs son convenciones **del proyecto**, no activadores automáticos del producto. El uso de varios agentes o worktrees depende de la interfaz y del entorno efectivo; el flujo secuencial funciona sin esas funciones.
