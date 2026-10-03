import { AppError } from '../middleware/errors.js';

/**
 * The `conversations` columns this module needs; deliberately not the full row or message content.
 */
export interface ConversationParticipants {
  id: string;
  buyer_id: string;
  seller_id: string;
}

/**
 * Chat authorization as pure functions: service_role bypasses RLS, so these checks *are* the authorization.
 */

/** True when `userId` is one of the two people in the conversation. */
export function isParticipant(conversation: ConversationParticipants, userId: string): boolean {
  return conversation.buyer_id === userId || conversation.seller_id === userId;
}

/**
 * Refuses anyone not in the conversation; 404 rather than 403 so the id's existence stays hidden.
 */
export function assertParticipant(conversation: ConversationParticipants, userId: string): void {
  if (!isParticipant(conversation, userId)) {
    throw AppError.notFound('Conversation not found');
  }
}

/** The other person in the conversation. Only valid for a participant. */
export function counterpartId(conversation: ConversationParticipants, userId: string): string {
  if (conversation.buyer_id === userId) return conversation.seller_id;
  if (conversation.seller_id === userId) return conversation.buyer_id;
  throw AppError.notFound('Conversation not found');
}

/**
 * Seller cannot message themselves about their own listing; DB: conversations_distinct_participants.
 */
export function canStartConversation(sellerId: string, userId: string): boolean {
  return sellerId !== userId;
}

export function assertCanStartConversation(sellerId: string, userId: string): void {
  if (!canStartConversation(sellerId, userId)) {
    throw AppError.forbidden('You cannot message yourself about your own listing');
  }
}

export interface MessageLike {
  sender_id: string;
  read_at: string | null;
  created_at: string;
  /** Present on chat rows; last-message previews read this. */
  body?: string;
}

/**
 * Unread messages in a thread; only the other participant's count, so own messages never badge.
 */
export function unreadCount(messages: MessageLike[], userId: string): number {
  return messages.filter((m) => m.sender_id !== userId && m.read_at === null).length;
}

/**
 * Most recent message, or null when empty; compares parsed time, not array order.
 */
export function lastMessage<T extends MessageLike>(messages: T[]): T | null {
  const rows = messages.filter(
    (m): m is T => Boolean(m) && typeof m.created_at === 'string' && m.created_at.length > 0,
  );
  if (rows.length === 0) return null;
  return rows.reduce((latest, current) =>
    Date.parse(current.created_at) > Date.parse(latest.created_at) ? current : latest,
  );
}
