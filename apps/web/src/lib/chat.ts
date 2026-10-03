import type { ApiConversation, ApiMessage } from './api';
import { formatRelative } from './format';
import type { ChatThread, ItemStatus, Message } from '../types';

/** Mirrors `listingStatus` in backend/src/schemas.ts and the DB CHECK constraint. */
const STATUSES: readonly ItemStatus[] = ['active', 'reserved', 'sold'];

function toStatus(value: unknown): ItemStatus {
  return STATUSES.includes(value as ItemStatus) ? (value as ItemStatus) : 'active';
}

/**
 * Converts a message row into the UI's Message; `senderName` comes from the caller.
 */
function toMessage(row: ApiMessage, conversationId: string, senderName: string): Message {
  return {
    id: row.id,
    chatId: conversationId,
    senderId: row.senderId,
    senderName,
    text: row.body,
    timestamp: formatRelative(row.createdAt),
  };
}

/**
 * Converts an API conversation into the UI's ChatThread; `reviewCompleted` stays undefined.
 */
export function toChatThread(row: ApiConversation): ChatThread {
  const nameFor = (senderId: string): string => {
    if (senderId === row.buyerId) return row.buyerName;
    if (senderId === row.sellerId) return row.sellerName;
    return 'Member';
  };

  return {
    id: row.id,
    listingId: row.listingId,
    listingTitle: row.listingTitle,
    listingImage: row.listingImage,
    listingPrice: Number(row.listingPrice ?? 0),
    listingStatus: toStatus(row.listingStatus),
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    lastMessage: row.lastMessage,
    lastMessageTime: row.lastMessageTime ? formatRelative(row.lastMessageTime) : '',
    unreadCount: row.unreadCount ?? 0,
    messages: (row.messages ?? []).map((m) => toMessage(m, row.id, nameFor(m.senderId))),
  };
}

export function toChatThreads(rows: ApiConversation[] | null | undefined): ChatThread[] {
  return (rows ?? []).flatMap((row) => {
    if (!row?.id) return [];
    try {
      return [toChatThread(row)];
    } catch {
      return [];
    }
  });
}
