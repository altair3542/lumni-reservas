# Parte 3: consultas PostgreSQL

`../consultas.sql` contiene las cuatro consultas y la respuesta de cinco líneas sobre índices. Este ejercicio usa una base independiente; `schema.sql` reproduce el DDL del enunciado, incluidos campos anulables y `numeric(14,2)`. No utiliza las migraciones, credenciales ni tablas de la aplicación.

## Verificación automática

Desde la raíz del repositorio, con Node soportado y Docker encendido:

```sh
pnpm test:sql
```

Sin instalar dependencias de Node también funciona `node sql/check.ts` en Node 22.18+, 24 o 26. El comando crea un contenedor PostgreSQL 16 con nombre aleatorio `lumni-sql-check-*`, sin puertos publicados ni red, y lo retira con su volumen al terminar o recibir Ctrl+C. No lee `.env` ni se conecta a la base de la app. La primera ejecución necesita descargar `postgres:16` si no está disponible.

El runner carga el DDL y los fixtures en transacciones que revierte. Extrae las cuatro consultas del archivo entregable, sustituye únicamente sus dos `CURRENT_TIMESTAMP` para fijar el reloj y compara sus resultados con valores esperados independientes. También ejecuta `consultas.sql` intacto con el reloj real. No añade funciones de prueba al entregable. El chequeo de cinco líneas es estático; no representa un benchmark de cinco millones de pagos.

Resultado verificado: seis escenarios, **48 comprobaciones SQL**, ejecución del archivo original y límite de cinco líneas aprobados. Relojes `2026-01-01T02:30:00Z` (aún diciembre en Colombia) y `2024-03-01T05:30:00Z` (incluye el 29 de febrero); cada uno en sesiones UTC, America/Bogota y Pacific/Auckland.

| Punto | Casos y resultado esperado                                                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Bruno: 200/45 días; Ada: 150/90; Diana: 150/31; Clara: 25/30. Se excluyen 30 días exactos y un segundo menos; un segundo más sí entra. Pagos múltiples, nulos y sobrepagos no multiplican ni compensan otras deudas.                            |
| 2     | Cada par real una sola vez; excluye intervalos contiguos, otra sala y draft/cancelled/status nulo. Se comparan todos los pares, incluidos cruces de los fixtures temporales.                                                                    |
| 3     | 48 filas: cuatro salas por doce meses. La sala vacía conserva doce ceros. Sala Meses: 1,5 h/150,25 al principio de la ventana, 2 h/200 en el mes anterior y 1,5 h/150 en el actual; total 5 h/500,25. Se comprueban totales de las otras salas. |
| 4     | 401: ambas causas; 403, 408 y 409: solo líneas; 407: solo pagos. La reserva 402 tiene dos líneas y dos pagos, ambos suman 100 y no debe salir. Total cero, pago parcial, sobrepago y campos nulos cubiertos.                                    |
| 5     | Cinco líneas con índices candidatos y comparación de planes/tiempos/buffers; no se crea ningún índice adicional.                                                                                                                                |

CI ejecuta este comando en el job nativo Node 22. `pnpm verify` mantiene la suite de la app: no llama a Docker desde dentro del contenedor de la demo.

## Ejecutar manualmente con psql

Usa una base **nueva y exclusiva para Parte 3**. El DDL crea tablas sin borrarlas; no apuntes a las de la aplicación. Sustituye la URL por la de esa base:

```sh
psql "$SQL_PART3_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f sql/schema.sql
psql "$SQL_PART3_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f sql/seed.sql
psql "$SQL_PART3_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f consultas.sql
```

Los fixtures son **sintéticos propios**, no el script prometido por el evaluador. Sembrar una segunda vez produce conflictos de PK: usa una base vacía. Cuando llegue el dataset oficial, carga su script en otra base con el DDL oficial y ejecuta directamente `consultas.sql`; no requiere funciones, extensiones ni variables psql.

## Supuestos

- Punto 1: más de 30 períodos de 24 horas completos desde `ends_at`; días enteros por duración transcurrida, con el mismo reloj para todo el resultado. La deuda se filtra por reserva antes de sumar por cliente; un sobrepago de otra reserva no reduce esa deuda. El desempate es el ID del cliente.
- Puntos 1 y 4: todos los importes presentes en `payments` cuentan, aunque `paid_at` sea nulo, porque el esquema no tiene un estado de liquidación. `SUM` ignora `amount` nulo y una suma ausente es cero. Importes negativos se suman con su signo; no se deduplican eventos sin una regla de negocio. Un cambio de semántica requiere conocer el contrato del proveedor.
- Punto 2: intervalos semiabiertos `[inicio, fin)`, sin filtro temporal adicional.
- Punto 3: mes actual hasta el instante de consulta y once anteriores, en America/Bogota. Se incluyen inicios en el borde inferior y en el instante actual; se excluyen inicios futuros. Se atribuyen todas las horas reales y el total al mes de inicio, sin prorratear reservas que cruzan un mes ni recortar su fin al reloj. “Ingreso” es el total reservado, no el dinero cobrado. Así no se inventa una regla contable para distribuir descuentos o servicios.
- Punto 4: importes exactos `numeric`, una fila por reserva, dos indicadores booleanos; no exige que `payment_status` sea `paid` para detectar la inconsistencia de líneas.
- No se añaden constraints o índices al DDL oficial. Un índice por sí solo no garantiza mejorar una agregación completa de cinco millones de filas; los planes se deben medir con datos representativos.
