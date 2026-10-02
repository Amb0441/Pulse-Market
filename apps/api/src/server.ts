import express from 'express';
import { env, hasCloudinary, hasSupabase, isProd } from './config.js';
import { audit } from './middleware/audit.js';
import { authenticate, requireAdmin, requireUser, supabase } from './middleware/auth.js';
import { openRealtimeStream, realtimeSubscriberCount, startRealtime } from './services/realtime.js';
import { AppError, asyncHandler, errorHandler, notFoundHandler } from './middleware/errors.js';
import {
  authFailureLimiter,
  authTotalLimiter,
  corsMiddleware,
  devHeaderOverrides,
  expensiveLimiter,
  globalLimiter,
  securityHeaders,
  validate,
  validated,
  writeLimiter,
} from './middleware/security.js';
import { assertRealImages, uploadImages } from './middleware/upload.js';
import {
  createListingSchema,
  createReportSchema,
  createReviewSchema,
  listListingsQuerySchema,
  loginSchema,
  profileUpdateSchema,
  publicIdParam,
  sendMessageSchema,
  signupSchema,
  startConversationSchema,
  updateListingSchema,
  uuidParam,
} from './schemas.js';
import { belongsToUser, destroyImage, storeImages } from './services/images.js';
import {
  assertCanStartConversation,
  assertParticipant,
  counterpartId,
  lastMessage,
  unreadCount,
} from './services/chat.js';

const app = express();

// Behind a proxy/load balancer: needed for correct req.ip and rate limiting.
app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
app.disable('x-powered-by');

// --- security stack (order matters) ----------------------------------------
app.use(securityHeaders());
app.use(devHeaderOverrides);
app.use(corsMiddleware());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(globalLimiter);

/**
 * API versioning: `/api/v1/...` is rewritten onto the unversioned handlers and
 * tagged `X-API-Version`; plain `/api/...` still works but is marked deprecated.
 */
app.use((req, res, next) => {
  const match = /^\/api\/v(\d+)(?=\/|\?|$)/.exec(req.url);
  if (!match) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', '</api/v1>; rel="successor-version"');
    return next();
  }
  // Express routes on req.url: rewriting only req.path leaves the versioned URL matched, 404.
  const versioned = req as { url: string };
  versioned.url = versioned.url.replace(/^\/api\/v\d+/, '/api');
  res.setHeader('X-API-Version', match[1]);
  next();
});

// --- realtime ---------------------------------------------------------------

/**
 * SSE stream for listing/conversation changes. Registered unversioned because
 * the version middleware rewrites `/api/v1/...` first; auth required, limiter-exempt.
 */
app.get('/api/realtime', authenticate, (req, res) => {
  openRealtimeStream(req, requireUser(req).id, res);
});

// --- health ----------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  // Minimal by design: provider or demo-mode state here would be unauthenticated
  // fingerprinting of which integrations (and service_role key) are live.
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Admin-only diagnostics: env, wired-up providers, uptime.
 */
app.get('/api/health/details', authenticate, requireAdmin, (_req, res) => {
  res.json({
    status: 'ok',
    env: env.NODE_ENV,
    services: { supabase: hasSupabase, cloudinary: hasCloudinary },
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// --- auth ------------------------------------------------------------------

  app.post(
  '/api/auth/signup',
  authTotalLimiter,
  authFailureLimiter,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const { email, password, username, lat, lng, location } = req.body;

    // Email verification is required - accounts must confirm their email before signing in
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      // Metadata feeds the handle_new_user trigger so the pin lands on the profile
      // row atomically; `location` is the typed area label, not an address.
      user_metadata: { username, lat, lng, location },
      email_confirm: false,
    });

    if (error) {
      audit.auth.failure(error.message, 'signup', { email: maskEmail(email) });
      // Do not echo provider internals; normalize the common case.
      const exists = /already|registered|exists/i.test(error.message);
      throw AppError.badRequest(
        exists ? 'An account with that email already exists' : 'Could not create account',
        exists ? 'EMAIL_TAKEN' : 'SIGNUP_FAILED',
      );
    }

    const user = data.user!;

    audit.auth.success(user.id, 'signup');
    res.status(201).json({
      user: { id: user.id, email: user.email },
      message: 'Check your email to verify your account before signing in',
    });
  }),
);

app.post(
  '/api/auth/login',
  authTotalLimiter,
  authFailureLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      audit.auth.failure('bad_credentials', 'password', { email: maskEmail(email) });
      // Uniform message: never reveal whether the email exists.
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    audit.auth.success(data.user.id, 'password');
    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: { id: data.user.id, email: data.user.email },
    });
  }),
);

app.post('/api/auth/logout', authenticate, (req, res) => {
  audit.auth.success((req as any).user.id, 'logout');
  res.json({ success: true });
});

/**
 * Exchanges a refresh token for a new session (access tokens last an hour).
 * Unauthenticated because the refresh token is the credential; rate-limited like one.
 */
app.post(
  '/api/auth/refresh',
  authTotalLimiter,
  authFailureLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = req.body?.refresh_token;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw AppError.badRequest('A refresh token is required', 'INVALID_REFRESH_TOKEN');
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      // Rejected refresh means the session is genuinely over (expired, revoked,
      // or rotated): a 401, not a 500 - the client can only sign in again.
      audit.auth.failure('refresh_rejected', 'refresh_token');
      throw AppError.unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        // Supabase rotates refresh tokens; the new one must be returned or replay fails.
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: { id: data.user?.id, email: data.user?.email },
    });
  }),
);

app.get(
  '/api/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const [{ data, error }, { data: received, error: reviewsError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url, bio, location, lat, lng, created_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('reviews').select('rating').eq('target_user_id', user.id).limit(500),
    ]);

    if (error) throw AppError.internal('Could not load profile');
    // Ratings are an enhancement: a deployment without migration 009 still serves the profile.
    if (reviewsError && !notInstalled(reviewsError)) audit.warn('profile_ratings_load_failed', { userId: user.id });

    const ratings = (received ?? []).map((row) => Number(row.rating)).filter(Number.isFinite);
    const rating = ratings.length
      ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
      : undefined;

    res.json({
      user: {
        ...(data ?? { id: user.id, email: user.email }),
        ...(rating !== undefined ? { rating, reviewsCount: ratings.length } : {}),
      },
    });
  }),
);

app.patch(
  '/api/auth/me',
  authenticate,
  validate(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await supabase
      .from('profiles')
      .update(req.body)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw AppError.badRequest('Could not update profile');
    audit.info('profile_updated', { userId: user.id });
    res.json({ user: data });
  }),
);

// --- uploads ---------------------------------------------------------------

app.post(
  '/api/upload',
  authenticate,
  expensiveLimiter,
  uploadImages,
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw AppError.badRequest('No files uploaded', 'NO_FILES');

    assertRealImages(files);

    const userId = requireUser(req).id;
    const stored = await storeImages(files, userId);
    if (!stored.length && hasCloudinary) throw AppError.internal('Upload failed');

    audit.info('images_uploaded', { userId, count: stored.length });
    res.status(201).json({ images: stored });
  }),
);

app.delete(
  '/api/upload/:publicId',
  authenticate,
  writeLimiter,
  validate(publicIdParam, 'params'),
  asyncHandler(async (req, res) => {
    const { publicId } = validated(req, publicIdParam, 'params');
    const userId = requireUser(req).id;

    // Ownership is a per-user folder, so another user's public_id fails here.
    if (!belongsToUser(publicId, userId)) {
      audit.warn('upload_delete_scope_violation', { userId, path: req.path });
      throw AppError.forbidden('Asset does not belong to this account');
    }

    const outcome = await destroyImage(publicId, userId);
    if (outcome === 'missing') {
      audit.warn('image_delete_not_found', { userId, publicId });
      throw AppError.notFound('Image not found');
    }
    audit.info('image_deleted', { userId, publicId });
    res.json({ success: true });
  }),
);

// --- listings --------------------------------------------------------------

/** Metres in a degree of latitude, at the equator. Distance shrinks by cos(lat). */
const KM_PER_DEGREE_LAT = 110.574;

/** Used when the caller sends a position but no radius. */
const DEFAULT_RADIUS_KM = 5;

/**
 * Lat/lng box containing a circle of `radiusKm`, so the range filter can use an
 * index (no PostGIS here); the client re-filters with exact haversine distance.
 */
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  // Longitude degrees shrink towards the poles: scale by cos(lat) and clamp,
  // since dividing by ~0 would turn the filter into a full-table scan.
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = radiusKm / (KM_PER_DEGREE_LAT * Math.max(Math.abs(cos), 0.01));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Statuses a listing is visible under. Sold and reserved stay visible so a sold
 * item doesn't vanish from the feed or dashboard; `archived` stays hidden.
 */
const VISIBLE_STATUSES = ['active', 'reserved', 'sold'] as const;

/** Columns every listing read returns. Kept in one place so routes cannot drift. */
const LISTING_COLUMNS =
  'id, title, description, price, category, images, location, lat, lng, status, created_at, user_id, profiles(username, avatar_url)';

/**
 * Coordinate precision on a listing the caller does not own: 3 decimals (~110 m)
 * hides the exact pin from tokenless `/api/listings[/:id]`; `/api/me/listings` keeps it.
 */
const PUBLIC_COORD_DECIMALS = 3;

export function blurCoords<T extends Record<string, unknown>>(row: T): T {
  if (typeof row.lat !== 'number' && typeof row.lng !== 'number') return row;

  const round = (value: unknown) =>
    typeof value === 'number' ? Number(value.toFixed(PUBLIC_COORD_DECIMALS)) : value;

  return { ...row, lat: round(row.lat), lng: round(row.lng) } as T;
}

app.get(
  '/api/listings',
  asyncHandler(async (req, res) => {
    const { limit, category, lat, lng, radius } = validated(req, listListingsQuerySchema);

    let query = supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .in('status', [...VISIBLE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(limit);
    // No `{ count: 'exact' }`: this route returns rows only, so a COUNT per feed
    // load bought a total nobody read. Re-add it if pagination needs one.

    if (category) query = query.eq('category', category);

    // Only narrow by position when the viewer supplied one; otherwise newest-first.
    if (lat !== undefined && lng !== undefined) {
      const box = boundingBox(lat, lng, radius ?? DEFAULT_RADIUS_KM);
      query = query
        .gte('lat', box.minLat)
        .lte('lat', box.maxLat)
        .gte('lng', box.minLng)
        .lte('lng', box.maxLng);
    }

    const { data, error } = await query;
    if (error) throw AppError.internal('Could not load listings');
    res.json((data ?? []).map(blurCoords));
  }),
);

// --- favorites --------------------------------------------------------------

/**
 * Saved items as full listing rows rather than bare ids, so a saved item
 * survives the feed changing (sold, out of radius, aged out); rows come only
 * from the viewer's own favorites table.
 */
app.get(
  '/api/favorites',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await supabase
      .from('favorites')
      .select(`listing_id, created_at, listings(${LISTING_COLUMNS})`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw AppError.internal('Could not load saved items');

    // The join is null if the listing was deleted after being saved; drop those
    // dangling rows instead of sending the client a hole.
    const rows = (data ?? [])
      .map((row) => {
        const listing = row.listings as unknown as Record<string, unknown> | null;
        if (!listing || !listing.id) return null;
        return { savedAt: row.created_at, listing: blurCoords(listing) };
      })
      .filter((row): row is { savedAt: string; listing: Record<string, unknown> } => row !== null);

    res.json(rows);
  }),
);

/**
 * Saves an item. Idempotent: the unique (user_id, listing_id) index plus upsert
 * make a double tap or retry a no-op that still returns success.
 */
app.post(
  '/api/favorites/:id',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id: listingId } = validated(req, uuidParam, 'params');

    const { data: listing } = await supabase
      .from('listings')
      .select('id, user_id')
      .eq('id', listingId)
      .maybeSingle();

    if (!listing) throw AppError.notFound('Listing not found');

    // Owners cannot save their own item: a save count is a demand signal, so it
    // is rejected here, not just hidden in the UI.
    if (listing.user_id === user.id) {
      throw AppError.badRequest('You cannot save your own listing');
    }

    const { error } = await supabase
      .from('favorites')
      .upsert({ user_id: user.id, listing_id: listingId }, { onConflict: 'user_id,listing_id' });

    if (error) throw AppError.internal('Could not save this item');
    audit.info('listing_favorited', { userId: user.id, listingId });
    res.status(201).json({ listingId });
  }),
);

/** Unsaves an item; removing one that was never saved is a no-op, not a 404. */
app.delete(
  '/api/favorites/:id',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id: listingId } = validated(req, uuidParam, 'params');

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', listingId);

    if (error) throw AppError.internal('Could not remove this item');
    res.status(204).end();
  }),
);

/**
 * The caller's own listings, for the dashboard. Separate from the feed so its
 * radius can't hide the seller's own items and public feed requests skip auth;
 * excludes `archived`, includes sold/reserved so completed sales stay on record.
 */
app.get(
  '/api/me/listings',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('user_id', user.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) throw AppError.internal('Could not load your listings');
    res.json(data);
  }),
);

app.get(
  '/api/listings/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = validated(req, uuidParam, 'params');

    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw AppError.internal('Could not load listing');
    if (!data) throw AppError.notFound('Listing not found');
    res.json(blurCoords(data as Record<string, unknown>));
  }),
);

// --- chat -------------------------------------------------------------------

/** Maps a message row to the wire shape so a future internal column can't leak. */
function mapMessage(row: {
  id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** First https image in a listing's `images` JSONB array, or ''. */
function firstImage(images: unknown): string {
  if (!Array.isArray(images)) return '';
  return images.find((u): u is string => typeof u === 'string' && u.startsWith('https://')) ?? '';
}

/**
 * Collapses a possibly-array relation to a single row: without generated DB
 * types supabase-js types to-one relations as arrays, so this avoids a cast.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Loads a conversation and enforces the participant rule for every
 * `/api/chats/:id` route; a missing row and a non-participant both return 404.
 */
async function requireConversation(id: string, userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw AppError.internal('Could not load conversation');
  if (!data) throw AppError.notFound('Conversation not found');
  assertParticipant(data, userId);
  return data;
}

/**
 * Migration 009 not applied yet: a 503 the UI can render as an empty state,
 * rather than a 500 that looks like an outage.
 */
function notInstalled(error: { code?: string } | null): AppError | null {
  return error?.code === '42P01' ? AppError.serviceUnavailable('This feature is not available yet') : null;
}

/** The member's display name from the JWT; the profile is the fallback-free path. */
function displayName(user: { user_metadata?: Record<string, unknown> }): string {
  const name = user.user_metadata?.username;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'A neighbor';
}

type NotificationRow = {
  user_id: string;
  type: 'message' | 'listing' | 'status' | 'system';
  title: string;
  body?: string;
  listing_id?: string | null;
  conversation_id?: string | null;
  actor_id?: string | null;
};

/**
 * Best-effort inbox write: a notification never fails the action that produced
 * it, and a missing table is logged rather than thrown.
 */
async function notify(row: NotificationRow): Promise<void> {
  const { error } = await supabase.from('notifications').insert({ ...row, body: row.body ?? '' });
  if (error) audit.warn('notification_write_failed', { userId: row.user_id, type: row.type, code: error.code });
}

const REVIEW_COLUMNS =
  'id, conversation_id, listing_title, reviewer_id, target_user_id, rating, comment, created_at';

function mapReview(row: {
  id: string;
  conversation_id: string;
  listing_title: string;
  reviewer_id: string;
  target_user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer?: { username?: string | null; avatar_url?: string | null } | { username?: string | null; avatar_url?: string | null }[];
}) {
  const reviewer = Array.isArray(row.reviewer) ? row.reviewer[0] : row.reviewer;
  return {
    id: row.id,
    transactionId: row.conversation_id,
    reviewerId: row.reviewer_id,
    reviewerName: reviewer?.username ?? 'A neighbor',
    reviewerAvatar: reviewer?.avatar_url ?? '',
    targetUserId: row.target_user_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    itemTitle: row.listing_title,
  };
}

/** The caller's conversation list, newest activity first, messages included. */
app.get(
  '/api/chats',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(
        `id, listing_id, buyer_id, seller_id, last_message_at,
         listings(id, title, price, status, images),
         buyer:profiles!conversations_buyer_id_fkey(id, username, avatar_url),
         seller:profiles!conversations_seller_id_fkey(id, username, avatar_url)`,
      )
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    if (error) throw AppError.internal('Could not load conversations');
    if (!conversations || conversations.length === 0) return res.json([]);

    // One query for all messages rather than one per thread, bounded by the
    // messages this user is party to; fetch last-message-only if threads grow.
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, body, read_at, created_at')
      .in(
        'conversation_id',
        conversations.map((c) => c.id),
      )
      .order('created_at', { ascending: true });

    if (messagesError) throw AppError.internal('Could not load messages');

    const grouped = new Map<string, typeof messages>();
    for (const m of messages ?? []) {
      const list = grouped.get(m.conversation_id) ?? [];
      list.push(m);
      grouped.set(m.conversation_id, list);
    }

    res.json(
      conversations.map((c) => {
        const thread = grouped.get(c.id) ?? [];
        const last = lastMessage(thread);
        const listing = one(c.listings);
        const buyer = one(c.buyer);
        const seller = one(c.seller);
        return {
          id: c.id,
          listingId: c.listing_id,
          listingTitle: listing?.title ?? '',
          listingImage: firstImage(listing?.images),
          listingPrice: Number(listing?.price ?? 0),
          listingStatus: listing?.status ?? 'active',
          buyerId: c.buyer_id,
          buyerName: buyer?.username ?? 'Member',
          buyerAvatar: buyer?.avatar_url ?? null,
          sellerId: c.seller_id,
          sellerName: seller?.username ?? 'Member',
          sellerAvatar: seller?.avatar_url ?? null,
          lastMessage: last?.body ?? '',
          lastMessageTime: last?.created_at ?? '',
          unreadCount: unreadCount(thread, user.id),
          messages: thread.map(mapMessage),
        };
      }),
    );
  }),
);

/**
 * Starts or reopens the caller's conversation about a listing; the unique
 * (listing_id, buyer_id) constraint makes a second tap return the same thread.
 */
app.post(
  '/api/chats',
  authenticate,
  writeLimiter,
  validate(startConversationSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { listingId } = req.body as { listingId: string };

    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, user_id')
      .eq('id', listingId)
      .maybeSingle();

    if (error) throw AppError.internal('Could not load listing');
    if (!listing) throw AppError.notFound('Listing not found');

    // Checked before any write: the owner is not a buyer of their own item.
    assertCanStartConversation(listing.user_id, user.id);

    const { data: conversation, error: upsertError } = await supabase
      .from('conversations')
      .upsert(
        { listing_id: listingId, buyer_id: user.id, seller_id: listing.user_id },
        { onConflict: 'listing_id,buyer_id', ignoreDuplicates: false },
      )
      .select('id, listing_id, buyer_id, seller_id, created_at, last_message_at')
      .single();

    if (upsertError) throw AppError.badRequest('Could not start conversation');
    audit.info('conversation_started', {
      userId: user.id,
      conversationId: conversation.id,
      listingId,
    });
    res.status(201).json(conversation);
  }),
);

app.get(
  '/api/chats/:id/messages',
  authenticate,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');
    await requireConversation(id, user.id);

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, body, read_at, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) throw AppError.internal('Could not load messages');
    res.json((messages ?? []).map(mapMessage));
  }),
);

app.post(
  '/api/chats/:id/messages',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');
    const { body } = req.body as { body: string };
    const conversation = await requireConversation(id, user.id);

    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({ conversation_id: id, sender_id: user.id, body })
      .select('id, conversation_id, sender_id, body, read_at, created_at')
      .single();

    if (error) throw AppError.badRequest('Could not send message');

    void notify({
      user_id: counterpartId(conversation, user.id),
      type: 'message',
      title: `New message from ${displayName(user)}`,
      body: body.slice(0, 140),
      conversation_id: id,
      actor_id: user.id,
    });

    res.status(201).json(mapMessage(message));
  }),
);

/**
 * Marks messages the caller received in this thread as read, scoped to the
 * other participant's messages: `read_at IS NULL` is what the unread badge counts.
 */
app.post(
  '/api/chats/:id/read',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');
    await requireConversation(id, user.id);

    const { error } = await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
      .is('read_at', null);

    if (error) throw AppError.badRequest('Could not mark messages as read');
    res.json({ success: true });
  }),
);

/**
 * Files a report against a listing: one per person (unique constraint makes a
 * retry return the existing report), no self-reports, snapshot resolved
 * server-side, and no read route - RLS shows only the reporter's own row.
 */
app.post(
  '/api/listings/:id/reports',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  validate(createReportSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');
    const { reason, details } = validated(req, createReportSchema);

    // Resolve the listing server-side so the snapshot can't be forged, and an
    // unknown listing is a 404 rather than a row pointing at nothing.
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, title, user_id')
      .eq('id', id)
      .maybeSingle();

    if (listingError) throw AppError.internal('Could not load listing');
    if (!listing) throw AppError.notFound('Listing not found');

    if (listing.user_id === user.id) {
      throw AppError.badRequest('You cannot report your own listing');
    }

    const { data, error } = await supabase
      .from('listing_reports')
      .insert({
        listing_id: listing.id,
        reporter_id: user.id,
        reason,
        details: details ?? '',
        listing_title: listing.title,
        reported_seller_id: listing.user_id,
      })
      .select('id, reason, created_at')
      .single();

    // Unique-constraint collision means they already reported it: treat it as
    // success rather than an error.
    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({ alreadyReported: true });
      }
      throw AppError.internal('Could not file report');
    }

    // Report volume per listing is the moderation signal; 'spam'/'scam' need a human.
    audit.warn('listing_reported', {
      userId: user.id,
      listingId: listing.id,
      reason,
    });
    res.status(201).json({ id: data.id, reason: data.reason, createdAt: data.created_at });
  }),
);

app.post(
  '/api/listings',
  authenticate,
  writeLimiter,
  validate(createListingSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const payload = req.body;

    const { data, error } = await supabase
      .from('listings')
      .insert({ ...payload, user_id: user.id, status: 'active' })
      .select()
      .single();

    if (error) throw AppError.badRequest('Could not create listing');
    audit.info('listing_created', { userId: user.id, listingId: data.id });

    void notify({
      user_id: user.id,
      type: 'listing',
      title: 'Listing published',
      body: `Your item "${data.title}" is now live on the neighborhood map.`,
      listing_id: data.id,
      actor_id: user.id,
    });

    res.status(201).json(data);
  }),
);

app.patch(
  '/api/listings/:id',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  validate(updateListingSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');

    // Ownership check before mutation (RLS is a second line of defence).
    const { data: existing } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw AppError.notFound('Listing not found');
    if (existing.user_id !== user.id) {
      audit.warn('listing_update_forbidden', { userId: user.id, listingId: id });
      throw AppError.forbidden('You can only edit your own listings');
    }

    const { data, error } = await supabase
      .from('listings')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw AppError.badRequest('Could not update listing');
    audit.info('listing_updated', { userId: user.id, listingId: id });

    // Reserved/sold is the news a waiting buyer wants; other edits are not worth a ping.
    const status = (req.body as { status?: string }).status;
    if (status === 'reserved' || status === 'sold') {
      const { data: waiting } = await supabase
        .from('conversations')
        .select('buyer_id')
        .eq('listing_id', id)
        .neq('buyer_id', user.id);

      for (const row of waiting ?? []) {
        void notify({
          user_id: row.buyer_id,
          type: 'status',
          title: status === 'sold' ? 'An item you wanted sold' : 'An item you wanted was reserved',
          body: `"${data.title}" is now ${status}.`,
          listing_id: id,
          actor_id: user.id,
        });
      }
    }

    res.json(data);
  }),
);

app.delete(
  '/api/listings/:id',
  authenticate,
  writeLimiter,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { id } = validated(req, uuidParam, 'params');

    const { data: existing } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw AppError.notFound('Listing not found');
    if (existing.user_id !== user.id) {
      audit.warn('listing_delete_forbidden', { userId: user.id, listingId: id });
      throw AppError.forbidden('You can only delete your own listings');
    }

    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) throw AppError.badRequest('Could not delete listing');

    audit.info('listing_deleted', { userId: user.id, listingId: id });
    res.json({ success: true });
  }),
);

// --- reviews ----------------------------------------------------------------

/** The caller's reviews in both directions: received (dashboard) and given (prompt guard). */
app.get(
  '/api/reviews',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await supabase
      .from('reviews')
      .select(
        `${REVIEW_COLUMNS}, reviewer:profiles!reviews_reviewer_id_fkey(username, avatar_url)`,
      )
      .or(`target_user_id.eq.${user.id},reviewer_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw notInstalled(error) ?? AppError.internal('Could not load reviews');
    res.json((data ?? []).map(mapReview));
  }),
);

/**
 * One review per person per conversation, and only after the item is sold.
 * Reviewer, target and listing title are resolved server-side from the token,
 * so none of them can be forged by the client.
 */
app.post(
  '/api/reviews',
  authenticate,
  writeLimiter,
  validate(createReviewSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { conversationId, rating, comment } = validated(req, createReviewSchema);
    const conversation = await requireConversation(conversationId, user.id);
    const targetId = counterpartId(conversation, user.id);

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, title, status')
      .eq('id', conversation.listing_id)
      .maybeSingle();

    if (listingError) throw AppError.internal('Could not load listing');
    if (!listing) throw AppError.notFound('Listing not found');
    if (listing.status !== 'sold') {
      throw AppError.badRequest('You can only review a completed sale', 'NOT_SOLD');
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        conversation_id: conversationId,
        reviewer_id: user.id,
        target_user_id: targetId,
        listing_id: listing.id,
        listing_title: listing.title,
        rating,
        comment,
      })
      .select(REVIEW_COLUMNS)
      .single();

    if (error) {
      // A second review in the same thread is the same row, not a new one.
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('reviews')
          .select(REVIEW_COLUMNS)
          .eq('conversation_id', conversationId)
          .eq('reviewer_id', user.id)
          .maybeSingle();
        if (existing) return res.json(mapReview(existing));
      }
      throw notInstalled(error) ?? AppError.badRequest('Could not save review');
    }

    void notify({
      user_id: targetId,
      type: 'status',
      title: `${displayName(user)} left you a review`,
      body: `${rating} out of 5${comment ? ` \u00b7 ${comment.slice(0, 140)}` : ''}`,
      conversation_id: conversationId,
      listing_id: listing.id,
      actor_id: user.id,
    });

    audit.info('review_created', { userId: user.id, conversationId, rating });
    res.status(201).json(mapReview(data));
  }),
);

// --- notifications ----------------------------------------------------------

/** The caller's inbox, newest first. Only their own rows exist to this route. */
app.get(
  '/api/notifications',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, conversation_id, listing_id, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw notInstalled(error) ?? AppError.internal('Could not load notifications');

    res.json(
      (data ?? []).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.body,
        conversationId: row.conversation_id,
        listingId: row.listing_id,
        read: row.read_at !== null,
        createdAt: row.created_at,
      })),
    );
  }),
);

app.post(
  '/api/notifications/read-all',
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (error) throw notInstalled(error) ?? AppError.badRequest('Could not mark notifications read');
    res.json({ success: true });
  }),
);

// --- errors ----------------------------------------------------------------

app.use(notFoundHandler);
app.use(errorHandler);

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Bind a port only when this file is the process entrypoint: tests import `app`
 * and listen on an ephemeral port themselves, so importing must not take PORT.
 */
if (import.meta.main) {
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    audit.info('server_started', {
      port: env.PORT,
      env: env.NODE_ENV,
      services: { supabase: hasSupabase, cloudinary: hasCloudinary },
    });
  });

  // Subscribe to Postgres changes after the port is up; failure isn't fatal -
  // the browser keeps polling, so it costs latency rather than breaking the app.
  startRealtime();

  // Give in-flight requests a chance to finish before the container exits.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      audit.info('server_stopping', { signal, realtimeStreams: realtimeSubscriberCount() });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}

// Start realtime in serverless context (Vercel may reuse lambdas)
if (process.env.VERCEL) {
  startRealtime();
}

export { app };


