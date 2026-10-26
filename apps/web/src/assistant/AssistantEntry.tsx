import { Navigate, useParams } from 'react-router-dom';
import { uuidSchema } from '@lumni/shared';

// Conserva enlaces anteriores sin convertir el asistente en una página independiente.
export function AssistantEntry() {
  const { id } = useParams();
  return (
    <Navigate
      to="/salas"
      replace
      state={{
        assistantOpen: true,
        assistantConversationId: id && uuidSchema.safeParse(id).success ? id : null,
      }}
    />
  );
}
