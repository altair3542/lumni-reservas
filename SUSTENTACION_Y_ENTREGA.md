# Sustentación y entrega

## README que se debe producir en el proyecto

1. Qué resuelve la app y qué partes de la prueba están completas, parciales o pendientes.
2. Requisitos y versiones fijadas; instalación desde cero; variables de entorno; migración y seed; comandos para API, web, worker, tests y build; URL y usuarios demo. Separar credenciales de demo de cualquier secreto real.
3. Decisiones de negocio: zona, redondeo, capacidades, extras, precio pactado, slots, expiración/reintentos, estados y atribución mensual SQL. No hacer pasar supuestos por texto del enunciado.
4. Cómo se evitan solapamientos entre reservas distintas y cómo se repite una confirmación de la misma reserva sin recalcular ni duplicar. Señalar migración, transacción, constraint y prueba que lo demuestra.
5. Cómo funciona el correo local, cómo verlo y reproducir errores/reintentos. Garantía exacta dentro de este transporte y límite de una futura salida externa.
6. Cómo usar el chat real: proveedor/modelo elegidos, variable para la clave, prompt versionado, validación, fechas en código y límites. Explicar específicamente la regla 4 con capacidades ausentes, autorización y pruebas adversariales; no decir solamente “el prompt lo prohíbe”.
7. Parte 3: cómo ejecutar consultas/fixtures y qué supuestos temporales utiliza. Identificar si no se recibió el dataset oficial.
8. Uso de IA auténtico: herramientas y tareas, decisiones dirigidas por el candidato, un ejemplo real de propuesta corregida o descartada y por qué; qué comprobó personalmente. Adjuntar AGENTS.md si se utilizó.
9. Qué se dejó por fuera y por qué; limitaciones conocidas reproducibles. Una omisión explícita sigue siendo una omisión, no un requisito cumplido.

## Checklist de entrega

- [ ] Todos los requisitos R01–R66 tienen resultado y evidencia o limitación explícita; R67 solo si se hizo el bonus.
- [ ] `npm ci`, migración y seed funcionan en una instalación limpia. Seed repetido no duplica usuarios/salas.
- [ ] API, web y worker arrancan con comandos documentados, sin archivos secretos locales indispensables.
- [ ] Unitarias, integración PostgreSQL, SQL, E2E y build pasan en el commit que se entregará.
- [ ] Hay evidencia de dos confirmaciones concurrentes distintas y dos de la misma reserva.
- [ ] Una confirmación produce una captura; error persistente termina failed visible tras los reintentos.
- [ ] Chat real disponible; prompt y esquema en repo; no depende de una respuesta fija presentada como IA.
- [ ] `consultas.sql` usa el DDL del PDF; punto 5 no supera cinco líneas.
- [ ] `INCIDENTE.md` contiene las cuatro respuestas y se verificó que cabe en dos páginas con formato legible; mensaje comercial de cuatro líneas.
- [ ] README/Uso de IA/AGENTS.md reflejan el proyecto real y el trabajo de verdad realizado.
- [ ] Historial con commits pequeños auténticos, sin claves ni datos sensibles en commits previos.
- [ ] Repositorio GitHub público o con acceso al evaluador, según lo autorizado. Confirmar a quién invitar si es privado.
- [ ] URL y commit final anotados; si el usuario autoriza su publicación/envío, verificar acceso y entregar antes de las 19:00 del martes.
- [ ] Candidato puede explicar y modificar el código crítico sin instrucciones del agente.

La solicitud actual autoriza planeación y archivos locales. No autoriza al equipo a enviar mensajes al evaluador, dar acceso a terceros, publicar información o desplegar por anticipado. Preparar un resultado concreto para que esa decisión posterior sea sencilla.

## Guion de sustentación de 45 minutos

| Minutos | Qué mostrar y explicar |
| --- | --- |
| 0–4 | Problema, alcance realizado y decisiones de ambigüedad más relevantes |
| 4–12 | Login cliente, desglose sábado/descuento, wizard, cierre/retoma y confirmación |
| 12–19 | Dos clientes compiten; una reserva gana. Misma reserva repetida devuelve precio pactado; mirar DB y pruebas |
| 19–24 | Worker detenido/reiniciado, correo capturado, reintentos y failed en admin |
| 24–31 | Chat real con faltantes, alternativa y draft; intento de saltarse reglas que no obtiene permisos |
| 31–36 | Dos consultas SQL representativas, agregación de pagos sin fan-out y análisis de índices |
| 36–40 | Hipótesis del incidente, recuperación segura y política de TTL/horario |
| 40–45 | Uso de IA, corrección real, tradeoffs y pequeño cambio en vivo |

El equipo evaluador puede dirigir la sesión; este guion es para ensayar, no para impedir preguntas.

## Lo que el candidato debe poder contestar

- ¿Por qué consultar disponibilidad antes de confirmar no basta frente a concurrencia?
- ¿Por qué se necesitan lock de fila y exclusión, y por qué resuelven carreras distintas?
- ¿Qué pasa si el proceso cae entre confirmar y crear el correo? ¿Y durante el worker?
- ¿En qué momento queda pactado el precio y qué impide que el navegador lo cambie?
- ¿Por qué repetir una confirmación con versión vieja funciona, pero editar un draft viejo falla?
- ¿Cómo se distinguen UTC, hora de Colombia, fecha local y mes local?
- ¿Qué acciones no puede realizar el modelo aunque una instrucción lo pida?
- ¿Cómo se prueba una API de IA sin gastar ni depender de variabilidad en cada test?
- ¿Por qué juntar líneas y pagos directamente puede multiplicar las sumas?
- ¿Qué significa “últimos doce meses” en esta implementación y cómo se decidió?
- ¿Qué evidencia adicional hace falta para confirmar la hipótesis del incidente?
- ¿Qué cambio haría primero con otra semana y cuál no vale la pena para esta prueba?

## Ensayo de modificación

Elegir una modificación pequeña y real: por ejemplo, añadir un servicio con precio fijo o cambiar un umbral de descuento. El candidato localiza reglas/contrato, ajusta el caso numérico esperado, cambia código y ejecuta pruebas. En el ensayo se puede usar una rama que se descarta al terminar; la entrega conserva los valores del PDF. No cambiar arbitrariamente las tarifas o los descuentos del reto final.


## Regla de fecha límite

La fecha 27/10/2026 20:00 es una **hipótesis** de las planeaciones recibidas y debe confirmarse contra la invitación de Lumni. El PDF solo define 48–72 horas con confirmación individual. Mantener un buffer de al menos cuatro horas tras la validación final. Si se confirma otro plazo, recalcular los gates G0–G4 sin comprometer pruebas críticas ni el ensayo de 45 minutos.

## Guion de cierre para agentes

- A9 documenta funciones realmente completadas y en `README.md` incluye un caso real de código sugerido por IA y corregido/descartado.
- A10 ejecuta desde un clon limpio; si el repo todavía no existe, su informe es «pendiente», nunca «verde» por expectativa.
- Nadie crea commits ficticios ni pruebas simuladas como evidencia real.
