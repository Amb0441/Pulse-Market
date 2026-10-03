import { AppNotification, Review } from '../types';
import { ApiNotification, ApiReview } from './api';
import { formatRelative } from './format';

/**
 * A review row from the API is already the shape the UI renders; only the
 * timestamp needs a second look, so `createdAt` stays ISO and callers format it.
 */
export function toReview(row: ApiReview): Review {
  return {
    ...row,
    targetName: row.targetName || 'A neighbor',
    targetAvatar: row.targetAvatar ?? '',
  };
}

/**
 * Notifications carry an ISO timestamp, but the inbox shows "12m ago", so the
 * display string is built here rather than on the server.
 */
export function toNotification(row: ApiNotification): AppNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    time: formatRelative(row.createdAt),
    read: row.read,
    type: row.type,
  };
}
