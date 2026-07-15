import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Personaliza el `message` del envelope de éxito para un handler concreto.
 * Ej: @ResponseMessage('Cliente creado correctamente')
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
