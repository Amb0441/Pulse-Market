import type { ApiListing, ApiProfile } from './api';
import type { Category, ItemStatus, Listing, UserProfile } from '../types';

/**
 * Must match `categorySchema` in backend/src/schemas.ts. 'All' is filter-only: never persisted.
 */
const CATEGORIES: readonly Category[] = [
  'Furniture',
  'Electronics',
  'Home & Garden',
  'Clothing & Kids',
  'Sports & Outdoors',
  'Books & Media',
  'Free & Giveaway',
  'Other',
  'All',
];

/** Mirrors `listingStatus` in backend/src/schemas.ts and the DB CHECK constraint. */
const STATUSES: readonly ItemStatus[] = ['active', 'reserved', 'sold'];

/**
 * Narrows a DB value to a known union member, falling back when unrecognised.
 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Converts a database row into the UI's Listing; fields the table lacks stay undefined.
 */
export function toListing(row: ApiListing): Listing {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    price: row.price,
    category: oneOf(row.category, CATEGORIES, 'All'),
    status: oneOf(row.status, STATUSES, 'active'),
    images: Array.isArray(row.images) ? row.images : [],
    sellerId: row.user_id ?? '',
    sellerName: row.profiles?.username ?? 'Unknown seller',
    sellerAvatar: row.profiles?.avatar_url ?? undefined,
    createdAt: row.created_at ?? '',
    location: row.location ?? '',
    lat: typeof row.lat === 'number' ? row.lat : undefined,
    lng: typeof row.lng === 'number' ? row.lng : undefined,
  };
}

export function toListings(rows: ApiListing[] | null | undefined): Listing[] {
  return (rows ?? []).map(toListing);
}

/**
 * Converts the `profiles` row behind `/api/auth/me` into the UI's UserProfile.
 */
export function toUserProfile(row: unknown): UserProfile | null {
  if (!row || typeof row !== 'object') return null;
  const p = row as ApiProfile;

  return {
    id: p.id ?? '',
    name: p.username ?? 'Unknown neighbor',
    email: p.email ?? '',
    avatar: p.avatar_url ?? '',
    bio: p.bio ?? '',
    neighborhood: p.location ?? '',
    joinedDate: p.created_at ?? '',
      // The viewer's own pin, used as the origin for every distance shown.
      lat: typeof p.lat === 'number' ? p.lat : undefined,
      lng: typeof p.lng === 'number' ? p.lng : undefined,
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      reviewsCount: typeof p.reviewsCount === 'number' ? p.reviewsCount : undefined,
    };
}