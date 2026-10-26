# Factura única al confirmar una reserva

## Problema

La condición `status == 'confirmed'` comprueba el estado actual, no una transición. Guardar otro campo de una reserva ya confirmada vuelve a ejecutar `regenerate_invoice`: `invoice&.destroy` elimina la factura y `build_invoice` prepara otra con importes/impuestos recalculados. Se puede perder identidad, referencias e información histórica de un documento ya emitido. No hay que asumir que el objeto construido ya está persistido: depende del guardado de la asociación. El `destroy` explícito causa el problema durante el guardado; `dependent: :destroy` gobierna la eliminación de la reserva. [Callbacks de Active Record](https://guides.rubyonrails.org/v8.1/active_record_callbacks.html).

## Corrección propuesta

Retiraría ese callback y concentraría la confirmación en un servicio transaccional. Bloquearía la reserva antes de leer su estado y calcularía la factura una sola vez con el precio pactado, conservando un snapshot inmutable. Todas las modificaciones de líneas deben respetar el mismo bloqueo y rechazar cambios financieros tras confirmar. Rails permite adquirir el bloqueo mediante `lock` o `with_lock`; este último recarga el registro dentro de una transacción. [Bloqueo pesimista](https://api.rubyonrails.org/v8.1/classes/ActiveRecord/Locking/Pessimistic.html).

Esquema ilustrativo en Ruby; presupone factura local, asociación `invoice`, métodos del enunciado y cálculo de impuestos sin llamada externa. No es un módulo incorporado ni ejecutado en esta aplicación TypeScript:

```ruby
def confirm_booking(id)
  Booking.transaction do
    booking = Booking.lock.find(id)

    if booking.status == 'confirmed'
      booking.invoice || raise('Factura ausente: requiere conciliación')
    elsif booking.status == 'draft'
      raise 'Borrador con factura: requiere conciliación' if booking.invoice

      total = booking.lines_total
      tax = TaxCalculator.for(booking)
      booking.update!(status: 'confirmed')
      booking.create_invoice!(total: total, tax: tax)
    else
      raise ArgumentError, 'La reserva no admite confirmación'
    end
  end
end
```

Si falla `create_invoice!`, la confirmación local también revierte. Un reintento devuelve la factura existente; no destruye ni recalcula. Una reserva confirmada sin factura necesita conciliación explícita, no regeneración silenciosa. El snapshot y las reglas de precio/estado se completarían según el modelo real, que no está suministrado.

Añadiría `NOT NULL`, FK y un índice único sobre `invoices.booking_id`, después de inspeccionar y resolver duplicados/huérfanos sin borrar documentos ciegamente. La comprobación Ruby y `has_one` no sustituyen la unicidad en BD. [Validación de unicidad e índice único](https://guides.rubyonrails.org/v8.1/active_record_validations.html#uniqueness).

Si se conserva un callback, para detectar una transición ya guardada usaría `saved_change_to_status?(from: 'draft', to: 'confirmed')` en un callback `after_update`, que aún participa en la transacción de guardado; antes de guardar corresponde `will_save_change_to_status?`. Este filtro no reemplaza el bloqueo, la unicidad ni la idempotencia. Las APIs se contrastaron con Rails 8.1; habría que comprobar la versión del proyecto receptor. [Dirty tracking](https://api.rubyonrails.org/v8.1/classes/ActiveRecord/AttributeMethods/Dirty.html).

Para facturación externa, persistiría un evento outbox en la misma transacción y un worker enviaría después del commit con clave idempotente estable y conciliación de respuestas inciertas. `after_commit` puede despertar al worker, pero no garantiza por sí solo una entrega durable ni revierte lo ya confirmado si falla. Una factura local puede existir como pendiente de emisión externa; sus estados y el momento legal de emisión requieren definición del negocio. [Callbacks transaccionales](https://guides.rubyonrails.org/v8.1/active_record_callbacks.html#transaction-callbacks).

## Comprobaciones previstas

Probaría: guardar una reserva confirmada mantiene ID/importes de factura; dos confirmaciones concurrentes crean una sola; un fallo al persistir factura revierte ambas escrituras; reintentar tras perder la respuesta devuelve la misma factura; cambiar tarifas no altera el snapshot; un fallo externo se recupera desde la outbox sin repetir la emisión. Son criterios de aceptación propuestos, no pruebas Rails ejecutadas.
