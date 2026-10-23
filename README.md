# Lumni TI — Plan unificado, adaptado para Codex personal

**Versión 1.2 | 23-10-2026 | Solo planeación:** todavía **no** hay aplicación implementada, pruebas ejecutadas, CI verificado ni repositorio remoto creado.

## Inicio rápido en Codex Desktop

1. **Descomprime el ZIP** y abre la carpeta `LUMNI_CODEX_PERSONAL/` como proyecto en tu cuenta personal de Codex. La carpeta ya contiene `AGENTS.md` en la raíz, que Codex puede leer como instrucciones persistentes.
2. Revisa `GUIA_CODEX_PERSONAL.md`; luego copia el **Prompt A0** de `PROMPTS_CODEX.md` y pégalo en Codex.
3. En A0, Codex inicializa Git **en esta misma carpeta** (si no está inicializado), crea `apps/`, `packages/` y Docker/CI, y sigue solo `agentes/A0.md`. Revisa G0 antes de pasar a A1.
4. Cada sesión empieza leyendo `PROGRESO.md` y los documentos rectores. Usa los prompts de continuidad y cierre. No inicies todos los agentes simultáneamente.
5. Confirma el **plazo oficial** comunicado por Lumni. El PDF no dice 27/10 a las 20:00; esa fecha del plan es provisional.

## Archivos principales

- `AGENTS.md`: instrucciones persistentes para Codex; **no hace falta `CLAUDE.md`**.
- `PLAN_MAESTRO.md` y `CONTRATOS_Y_MODELO.md`: alcance, stack e invariantes.
- `MATRIZ_REQUISITOS.md`, `PRUEBAS_Y_ACEPTACION.md`: requisitos y oráculos.
- `agentes/A0.md` a `agentes/A10.md`: briefs accionables por fase.
- `GUIA_CODEX_PERSONAL.md`, `PROMPTS_CODEX.md`, `PROGRESO.md`: uso, ejecución y reanudación.
- `docs/decisiones.md` y `docs/ai-log.md`: registros basados en hechos; completar durante trabajo real.
- `SQL_INCIDENTE_BONUS.md`, `SUSTENTACION_Y_ENTREGA.md`: entregables independientes y defensa.
- `REGISTRO_DE_FUSION.md`, `REGISTRO_ADAPTACION_CODEX.md`: historial de decisiones documentales.
- `referencia/Prueba_tecnica_Lumni_TI_F.pdf`: fuente normativa original.

## Alcance y cuentas

Este proyecto es **personal**: no requiere acceso a Claude ni a otro entorno laboral. Mantén credenciales, `.env` y repositorios empresariales fuera del proyecto. El proveedor de IA **dentro de la aplicación** requiere una credencial/API separada cuando se implemente A6; Codex no aporta automáticamente esa credencial.

**La adaptación solo habilita la ejecución ordenada en Codex:** no equivale a superar la prueba ni a haber ejecutado A0–A10.
