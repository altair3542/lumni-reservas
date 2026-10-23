# Registro de fusión, correcciones y límites

## Fuentes utilizadas

- `planeacion_1.zip`: matriz de 67 requisitos, catálogo de aceptación, contratos rigurosos, riesgos y guion de sustentación.
- `planeacion_2.zip`: once agentes A0–A10, stack pnpm/Express/Drizzle, oleadas de trabajo y formato de entrega por agente.
- `PLAN-UNIFICADO-Lumni-TI.md`: documento que el usuario aportó como borrador de fusión, base editorial de `PLAN_MAESTRO.md`.
- PDF Lumni TI: texto rector, preservado en `referencia/`.

## Conflictos resueltos

| Tema | Diferencia original | Decisión única | Por qué |
|---|---|---|---|
| Correo | P1 captura transaccional DB; P2 SMTP/Mailpit con ventana residual de duplicación | Outbox + captura local transaccional; Mailpit opcional, sin prometer semántica externa exactamente-una | El PDF permite captura local y exige un correo aunque haya reintentos/carreras |
| Borrador | P1 admite campos parciales; P2 exige sala/fechas/totales desde la creación | Permitir drafts incompletos, guardar cada paso, y exigir snapshot solo al confirmar | El PDF exige guardar paso a paso y retomar |
| Confirma estado final | Borrador unificado sugería idempotencia incluso para cancelled | Confirmed repetida 200 sin recalcular; cancelled/completed 409 | Máquina de estados explícita y finales inmutables |
| Cronograma | Propuesta 27/10 20:00, sin respaldo visible en PDF | Rotular **provisional** y solicitar validar la invitación | El PDF solo confirma ventana de 48–72 h y plazo por comunicar |
| Ponderación | 2.1 12 %, 2.2 13 %, README 10 % implícito | Parte 2 25 % íntegra, resto no definido | Evita atribuir porcentajes inexistentes a subpartes |
| Stack | P1 Fastify/pg/npm/PG17; P2 Express/Drizzle/pnpm/PG16 | P2 por legibilidad del plan de agentes; SQL explícito en transacciones, exclusión y worker | A0–A10 necesitan una sola pila |
| IA | Tool-use y texto libre de P2; interpretación verificable de P1 | LLM extrae slots tipados; backend orquesta cálculos/estados y produce tarjetas veraces | Validar JSON no evita alucinaciones de texto libre |
| Incidente y Rails | Bonus anexo al mismo archivo arriesga 2 páginas | `INCIDENTE.md` con cuatro respuestas, bonus en archivo independiente opcional | El PDF fija límite solo para INCIDENTE |
| Dependencias de briefs | P2 remite a `01`/`02`/`03` inexistentes en el borrador fusionado | 11 briefs nuevos que remiten al maestro, contratos y matriz | Permite ejecución sin reconstruir referencias históricas |
| Bitácora IA | Plan sugería no poner trailers de IA, lectura susceptible de opacidad | Documentar autoría/revisión verdadera en README y `docs/ai-log.md`; no fabricar commits | Transparencia exigida en el PDF |

## Supuestos que siguen siendo supuestos

- Capacidades small/medium/large 4/8/16 personas; tarifas extra proyector 20.000 y café 10.000 COP por reserva. El enunciado no fija estos valores.
- Inicios a :00/:30. El PDF obliga a duraciones en bloques de 30 min, no restringe expresamente todos los inicios.
- Reintentos: 1 inicial + 5 adicionales con backoff 1/2/4/8/16 min; alternativa literal de «hasta 5 veces» debe documentarse.
- Precio snapshot guardado después del paso 3, y no al confirmar. Revalidar reglas de negocio/solapes justo al confirmar sin recalcular total.
- Parte 3: tratamiento de pagos `paid_at IS NULL` y atribución de ingresos de reservas que cruzan mes requieren decisión explícita y pruebas.
- Fecha límite absoluta propuesta sigue sin confirmarse aquí.

## Estado real de la ejecución

Este paquete **sí** unifica y prepara la planeación. **No** contiene una aplicación implementada, migraciones ejecutadas, resultados de test, claves IA ni repo GitHub publicado. Los criterios siguen pendientes hasta desarrollarlos y comprobarlos.
