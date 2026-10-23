# Guía operativa — Codex personal (versión 1.2)

## 1. Modelo de ejecución

- **Una carpeta, un repositorio:** extraer `LUMNI_CODEX_PERSONAL/` y abrirla en Codex Desktop. `AGENTS.md` y todos los briefs viven en la raíz. A0 crea la implementación **en esta carpeta**, no en `lumni-reservas/lumni-reservas/`.
- **A0–A10 son briefs, no once instancias automáticas.** Se activan mediante un prompt explícito; se ejecutan las dependencias en orden y se detienen en un checkpoint humano. No confiar en automatismo de multiagente por el nombre de un archivo.
- **Estado entre sesiones:** `PROGRESO.md` (etapa, evidencias, bloqueos, siguiente tarea autorizada) es el estado persistente. Las conversaciones de Codex no sustituyen el registro en Git.
- **Cuentas separadas:** este proyecto es personal. No sincroniza credenciales/historial de un espacio de trabajo de otro proveedor; evita exportar material confidencial del empleador.

## 2. Preparación sin asumir capacidades

1. Descomprime, abre carpeta en Codex y comprueba que aparecen `AGENTS.md`, `PLAN_MAESTRO.md`, `agentes/A0.md` y el PDF de referencia.
2. Confirma que tu máquina tiene Node, pnpm, Docker/Compose y Git **o permite que A0 diagnostique prerequisitos**. No declares que funcionan sin comprobarlos.
3. No añadas ninguna clave de IA al paquete. Guarda claves personales en `.env` sin versionar; `.env.example` lleva solo nombres de variables.
4. El acceso a Codex personal **no garantiza créditos de API** para el chat de la aplicación: A6 comprobará el proveedor que decidas y usará un `LlmClient` falso en tests.
5. Confirma la fecha de entrega con la comunicación de Lumni; no inferirla de la fecha de acceso a herramientas.

## 3. Ejecución por fases

| Fase | Brief | Dependencia real | Gate |
| --- | --- | --- | --- |
| Base | A0 | ninguna; Git/infra aquí mismo | G0: contenedores, migración, contratos y smoke verificados |
| Núcleo | A1 | A0 | G1: cotizador con oráculos numéricos |
| Reservas | A2 | A1 | G2: draft, snapshot, carreras reales y estado |
| API/UI | A3, A4a/A4b | A3 después A2; A4 en dos etapas | G3: permisos, usuario/admin y wizard |
| Integración | A5 | A2 (+ admin para estado visible) | G5: captura, reintentos y failed |
| IA | A6 | A1 + A2 | G6: extracción, quote real, persistencia y sin confirmación |
| Independientes | A7, A8 | A7 tras A0; A8 sin código | G7/G8: SQL validado / incidente revisado |
| Entrega | A9 y A10 | funcionalidades dentro de alcance | GF: instalación limpia, documentación y revisión humana |

**Orden seguro de inicio:** A0 → A1 → A2. A7 y A8 pueden intercalarse sin riesgo de colisión. A4 puede hacer el shell tras A0 y completar flujos después de A2/A3.

## 4. Paralelismo sin pisarse

- Primera opción: secuencial hasta A2; después tareas sin archivos compartidos pueden separarse.
- Si tienes varias sesiones/ventanas o soporte de worktrees, usa ramas aisladas (`feat/a7-sql`, `feat/a8-incidente`) y revisión explícita antes de integrar. No trabajar sobre `main` en paralelo con modificaciones incompatibles.
- No lanzar dos escrituras simultáneas al mismo directorio, migración, contrato Zod, lockfile ni base de pruebas. Cada rama/test debe contar con recursos aislados o ejecutar los tests de manera serial.
- Los agentes no se autorizan a pasar a la siguiente fase por haber terminado la suya. No crear worktrees ficticios ni afirmar que existen si no se ejecutaron comandos reales.

## 5. Checkpoint de cada fase (obligatorio)

1. Resumen de requisitos `R##` cubiertos y archivos tocados.
2. Comandos **realmente ejecutados**, resultados y fallos conocidos; marcar `no ejecutado` si aplica.
3. Estado de ramas/commits; `git status` sin ignorar cambios ajenos.
4. Actualización de `PROGRESO.md`, `docs/decisiones.md` y, si correspondió, `docs/ai-log.md`.
5. Riesgos, preguntas pendientes y autorización humana explícita para integrar o avanzar.

## 6. Entrega y fuentes

El PDF del enunciado manda sobre las decisiones del plan. El README final deberá informar el **uso real de Codex como asistente** y un ejemplo auténtico de corrección/descarte, así como las comprobaciones realizadas por la persona. No atribuir el código a una autoría distinta ni inventar resultados. Los artefactos SQL, incidente y bonus mantienen sus restricciones originales.
