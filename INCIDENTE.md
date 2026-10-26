# Recordatorios que vencen antes de poder enviarse

Análisis propuesto del escenario; no se han consultado datos de producción ni ejecutado reenvíos.

## 1. Hipótesis y comprobación

La hipótesis principal es que las dos horas de permanencia en `pending` incluyen tiempo en el que la política impide enviar. Un recordatorio creado a las 18:10 supera ese plazo antes de las 08:00 siguientes; si la expiración sigue evaluándose durante la noche, un ciclo lo marcará `expired` sin oportunidad de entrega. El 92 % respalda investigarlo, pero no demuestra la causa: describe cuándo se crearon los expirados, no qué proporción de todos los creados tarde expiró.

Después de las 17:00 también quedan oportunidades de envío: uno creado a las 17:10 podría salir en el ciclo de las 17:30. Revisaría elegibilidad inicial, orden de validaciones, ciclos omitidos, errores del proveedor y zona horaria antes de atribuir todos los casos al mismo fallo. Usaría `America/Bogota` y propondría la ventana `[08:00, 18:00)`, con el extremo de cierre por confirmar con producto.

Primero solicitaría esquema y significado de estados. Con consultas adaptadas a ese esquema, agruparía recordatorios por fecha y hora local de creación: total, enviados, expirados y porcentaje expirado de cada cohorte. Compararía antes/después de las 17:00 y seguiría muestras individuales, contrastando creación, primer horario legal, elegibilidad programada, primer intento y expiración. Cruzaría estado de la reserva, destinatario, identificador del recordatorio y respuesta/ID del proveedor. Revisaría logs y configuración del job entre 17:00-20:30 y 07:30-09:00: ejecución prevista/real, reloj, decisiones de descarte, reintentos y aceptación sin respuesta. No escribiría SQL ejecutable sobre tablas supuestas ni registraría teléfonos o cuerpos de mensajes en los logs de diagnóstico.

## 2. Recuperación controlada

Prepararía una instantánea y una selección de solo lectura de afectados por el patrón confirmado. Excluiría reservas que ya no sean `draft`, destinatarios inválidos y contactos no permitidos por la política vigente. Contrastaría intentos y entregas con el proveedor: ausencia de confirmación local no prueba que no se haya enviado. Los resultados inciertos quedarían en conciliación, sin reenvío automático.

Conservaría los registros originales. Crearía una cola de recuperación auditable, con una clave estable por reserva/tipo de recordatorio compartida con el envío original y una restricción única; una campaña nueva no debe permitir repetir el mismo recordatorio. Cada decisión dejaría motivo, referencia original e identificador de ejecución. Registraría un intento durable antes de contactar al proveedor; un intento sin cierre exige conciliación. Volvería a consultar reserva, identidad del destinatario, permisos de contacto, ventana y deduplicación justo antes del despacho; los pendientes nocturnos esperarían a las 08:00.

Confirmación y despacho deben compartir coordinación por reserva: bajo exclusión se revalida `draft` y se serializa la autorización del envío con la confirmación, hasta aceptación o rechazo del proveedor con timeout acotado. Un chequeo seguido de liberar el bloqueo y llamar después deja una carrera. Si el proveedor acepta y se pierde la respuesta, registraría el resultado incierto para conciliarlo; usaría además su clave idempotente si la ofrece. Una confirmación posterior a la aceptación no puede retirar un mensaje ya aceptado. No prometería entrega exactamente una vez sin soporte del proveedor.

Antes de producción probaría en staging con datos anonimizados, destinos de prueba y reloj controlado: noche, bordes 08:00/18:00, dos horas exactas y superiores, confirmación concurrente, campaña repetida, fallo y aceptación sin respuesta. Revisaría una muestra del listado con operaciones. Solicitaría aprobación del responsable técnico/operaciones y del responsable de producto/comercial que autoriza comunicaciones; incorporaría a seguridad/privacidad según la política existente. Tras aprobar alcance, volumen y texto, haría un canario pequeño en horario, vigilaría duplicados/errores y ampliaría por lotes. La salida de emergencia es pausar la cola conservando evidencia y corregir los pendientes; no puede deshacer mensajes aceptados.

## 3. Cambio de fondo y detección

Persistiría `next_eligible_at` y separaría espera por horario de fallo de entrega. Propondría que el plazo consuma solo minutos dentro de la ventana permitida: al cerrar se conserva el saldo y se reanuda a las 08:00; producto debe aprobar esta semántica. Un timeout del proveedor es incertidumbre de entrega, no expiración por horario. El job podría seguir cada treinta minutos, respetando elegibilidad y validaciones en cada despacho.

Añadiría pruebas de reloj para cierre, apertura, fines de día, límites del plazo y reintentos. Mediría expirados/total por cohorte de creación, proporción sin intentos legales, edad de pendientes elegibles, demora hasta envío, fallos, resultados inciertos y duplicados. Alertaría ante acumulación nocturna que no se drena al abrir o desvíos respecto a la línea base acordada. Así se detecta el patrón antes de depender de quejas comerciales.

## 4. Mensaje al equipo comercial

```text
Estamos revisando por qué algunos recordatorios vencen antes de poder enviarse.
Validaremos qué clientes resultaron afectados y cuáles ya recibieron el mensaje.
Prepararemos una recuperación en horario, sin duplicados ni reservas ya confirmadas.
Les compartiremos el alcance y solicitaremos aprobación antes de activar los reenvíos.
```
