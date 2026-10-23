# Decisiones técnicas — registro vivo

Solo documentar decisiones efectivamente tomadas durante la implementación. No reemplaza el PDF, `PLAN_MAESTRO.md` ni `CONTRATOS_Y_MODELO.md`. Los supuestos ya fijados están descritos allí.

| Fecha | Contexto / ambigüedad | Opciones consideradas | Decisión y motivo | Impacto R# / prueba | Revisó |
| --- | --- | --- | --- | --- | --- |
| — | **Sin decisiones de implementación registradas** | — | — | — | — |

| 2026-10-23 | Ubicación de aplicación | Raíz original / carpeta solicitada | El usuario indicó crear en `lumni-reservas`, ya existente; se copiaron aquí los documentos sin alterar el original. La indicación explícita prevalece sobre las referencias a la ubicación del paquete. | R01/R62, A0 | Usuario: ubicación; código pendiente de revisión |
| 2026-10-23 | Inconsistencias del catálogo de pruebas | PostgreSQL 17 y npm ci / stack canónico | PostgreSQL 16 + pnpm según PLAN_MAESTRO y contratos. Los comandos de aceptación se interpretan con pnpm install --frozen-lockfile. | R02/R03/R60 | Pendiente G0 |
