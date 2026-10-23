# Prompts listos para Codex — Lumni TI

## Prompt 1 — Primera sesión / A0 (copiar tal cual)

```text
Trabaja exclusivamente en esta carpeta como repositorio de aplicación Lumni TI. Lee AGENTS.md, referencia/Prueba_tecnica_Lumni_TI_F.pdf, PLAN_MAESTRO.md, CONTRATOS_Y_MODELO.md, MATRIZ_REQUISITOS.md, PRUEBAS_Y_ACEPTACION.md, GUIA_CODEX_PERSONAL.md, PROGRESO.md y agentes/A0.md.

Ejecuta SOLO A0 en esta carpeta. No crees otro repositorio ni subcarpeta raíz para el proyecto. Inicializa Git aquí si no existe, conserva los documentos de planeación y crea apps/, packages/, infraestructura y contratos según el brief. Verifica realmente instalación, migración, seed, auth inicial, constraint de exclusión y pruebas de humo; si faltan Docker o credenciales, registra el bloqueo y continúa con lo verificable sin inventar resultados.

Actualiza PROGRESO.md, docs/decisiones.md y docs/ai-log.md únicamente con hechos. Haz commits lógicos pequeños. Al terminar presenta R# cubiertos, diff/archivos, comandos y resultados reales, commits, riesgos y el gate G0. NO inicies A1 ni integres trabajo ajeno: espera mi revisión explícita.
```

## Prompt 2 — Reanudar en una sesión nueva

```text
Lee AGENTS.md, PROGRESO.md, PLAN_MAESTRO.md, CONTRATOS_Y_MODELO.md, el PDF de referencia, el brief en curso y git status/log. Resume brevemente qué está realmente verificado, qué falta y qué checkpoint requiere mi aprobación. Si PROGRESO.md declara una fase pendiente sin autorización, NO la comiences. Si hay una fase ya aprobada y asignada explícitamente en mi mensaje, ejecuta únicamente esa fase y verifica su aceptación.
```

## Prompt 3 — Ejecutar una fase autorizada (sustituir A#)

```text
Te autorizo a ejecutar únicamente A# del archivo agentes/A#.md. Antes revisa dependencias en PROGRESO.md y contratos vigentes; no cambies criterios del PDF. Si falta una dependencia, repórtala y detente sin improvisar otra arquitectura. Implementa, prueba de verdad, registra decisiones/uso de IA reales y actualiza PROGRESO.md. Informa evidencia por R#, archivos, comandos, commits, riesgos y checkpoint. No avances a otro agente sin autorización.
```

## Prompt 4 — Verificación adversarial antes del merge

```text
Revisa exclusivamente los cambios de la fase actual contra el PDF y los criterios de PRUEBAS_Y_ACEPTACION.md. Comprueba git diff, tests reales, contratos, secretos y dependencias. Da una lista P0/P1/P2/P3 con ubicaciones de archivos; separa evidencia observada de lo no ejecutado. No edites otros módulos, no hagas merge ni des por aprobado el gate por tu cuenta. Registra el resultado en PROGRESO.md.
```

## Prompt 5 — Cierre A9/A10

```text
Después de que autorice el cierre y los gates previos estén revisados, ejecuta A9 y luego A10 en pasos separados. Verifica clon limpio, Docker, migraciones, tests, carreras PostgreSQL, consultas.sql, INCIDENTE.md <= 2 páginas, README, Uso de IA auténtico, AGENTS.md actualizado, secretos e historial de Git. No inventes pruebas, releases o enlaces. Deja reporte final verificable y riesgos pendientes para revisión humana antes de enviar.
```
