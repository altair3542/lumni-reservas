import {
  conversationResponseSchema,
  conversationListSchema,
  type ChatInput,
  adminBookingDetailSchema,
  adminBookingPageSchema,
  bookingListSchema,
  bookingResponseSchema,
  emailDetailSchema,
  emailQueuePageSchema,
  roomListSchema,
  serviceListSchema,
  quoteSchema,
  type QuoteRequest,
} from '@lumni/shared';
import { apiRequest } from '../api.js';
const send = (method: string, value: unknown): RequestInit => ({
  method,
  body: JSON.stringify(value),
});
export const api = {
  conversations: () => apiRequest('/chat/conversations', conversationListSchema),
  conversation: (id: string) => apiRequest(`/chat/conversations/${id}`, conversationResponseSchema),
  createConversation: (clientRequestId: string) =>
    apiRequest(
      '/chat/conversations',
      conversationResponseSchema,
      send('POST', { clientRequestId }),
    ),
  chat: (id: string, input: ChatInput) =>
    apiRequest(`/chat/conversations/${id}/messages`, conversationResponseSchema, {
      ...send('POST', input),
      signal: AbortSignal.timeout(25000),
    }),
  rooms: () => apiRequest('/rooms', roomListSchema),
  services: () => apiRequest('/services', serviceListSchema),
  quote: (input: QuoteRequest) => apiRequest('/quotes', quoteSchema, send('POST', input)),
  bookings: () => apiRequest('/bookings', bookingListSchema),
  booking: (id: string) => apiRequest(`/bookings/${id}`, bookingResponseSchema),
  create: (input: unknown) => apiRequest('/bookings', bookingResponseSchema, send('POST', input)),
  save: (id: string, input: unknown) =>
    apiRequest(`/bookings/${id}/draft`, bookingResponseSchema, send('PATCH', input)),
  confirm: (id: string, expectedVersion: number) =>
    apiRequest(`/bookings/${id}/confirm`, bookingResponseSchema, send('POST', { expectedVersion })),
  adminBookings: (query: string) => apiRequest(`/admin/bookings?${query}`, adminBookingPageSchema),
  adminBooking: (id: string) => apiRequest(`/admin/bookings/${id}`, adminBookingDetailSchema),
  changeStatus: (id: string, action: 'cancel' | 'complete', input: unknown) =>
    apiRequest(`/admin/bookings/${id}/${action}`, bookingResponseSchema, send('POST', input)),
  emails: (query: string) => apiRequest(`/admin/emails?${query}`, emailQueuePageSchema),
  email: (id: string) => apiRequest(`/admin/emails/${id}`, emailDetailSchema),
};
export type Room = Awaited<ReturnType<typeof api.rooms>>['items'][number];
export type Service = Awaited<ReturnType<typeof api.services>>['items'][number];
