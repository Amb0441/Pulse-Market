import { z } from 'zod';

// --- primitives -------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);

/** Only https Cloudinary/CDN URLs are accepted as stored image references. */
const httpsUrl = z.string().trim().url().max(2048).refine(
  (u) => u.startsWith('https://'),
  'Image URLs must use https',
);

export const uuidParam = z.object({ id: z.string().uuid('Invalid identifier') });

// --- coordinates ------------------------------------------------------------

// Coordinate as text or JSON; blank/non-finite normalizes to `undefined` so errors read plainly.
// Range check lives in z.number(): NaN would make a chained .refine() unreachable.
const coordinate = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    },
    z
      .number()
      .min(min, `${label} must be between ${min} and ${max}`)
      .max(max, `${label} must be between ${min} and ${max}`)
      .optional(),
  );

/** A latitude, by itself. Paired with `lngField` - see `latLngPair`. */
const latField = coordinate(-90, 90, 'Latitude');

/** A longitude, by itself. Paired with `latField` - see `latLngPair`. */
const lngField = coordinate(-180, 180, 'Longitude');

/**
 * Loose Philippines bounding box: rejects 0,0 and mid-ocean pins while accepting any real town.
 */
const withinPhilippines = (v: { lat: number; lng: number }, ctx: z.RefinementCtx) => {
  if (v.lat >= 4.5 && v.lat <= 21.5 && v.lng >= 116.5 && v.lng <= 126.5) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['lat'],
    message: 'That point is outside the Philippines. Please pick a spot inside the country.',
  });
};

/**
 * `lat` and `lng` are present together or not at all, and inside the Philippines when present.
 */
const latLngPair = (
  v: { lat?: number | null; lng?: number | null },
  ctx: z.RefinementCtx,
) => {
  if ((v.lat === undefined || v.lat === null) !== (v.lng === undefined || v.lng === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [v.lat === undefined || v.lat === null ? 'lat' : 'lng'],
      message: 'Provide both a latitude and a longitude, or neither.',
    });
    return;
  }
  if (typeof v.lat === 'number' && typeof v.lng === 'number') {
    withinPhilippines({ lat: v.lat, lng: v.lng }, ctx);
  }
};

/**
 * Signup must have a pin: an absent pair fails here with one sentence, not two "is not a number" errors.
 */
const requirePin = (
  v: { lat?: number | null; lng?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (v.lat === undefined || v.lat === null || v.lng === undefined || v.lng === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lat'],
      message: 'Drop a pin on the map so people nearby can find your items.',
    });
    return;
  }
  latLngPair(v, ctx);
};

// --- auth -------------------------------------------------------------------

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const signupSchema = z
  .object({
    email,
    password,
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, _ . and -'),
    // Required: proximity search needs real coordinates, not free-text city.
    lat: latField,
    lng: lngField,
    // Display label for the pin, e.g. "Baguio City, Benguet". Never used to
    // compute distance; shown beside the logo instead of raw coordinates.
    location: trimmed(80).optional(),
  })
  .superRefine(requirePin);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, _ . and -')
      .optional(),
    avatar_url: httpsUrl.nullable().optional(),
    bio: trimmed(500).optional(),
    location: trimmed(120).optional(),
    lat: latField.optional(),
    lng: lngField.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No valid fields to update' })
  .superRefine(latLngPair);

// --- listings ---------------------------------------------------------------

export const listingStatus = z.enum(['active', 'reserved', 'sold', 'archived']);

/**
 * Canonical categories; src/lib/listing.ts must mirror this list. `archived` covers hidden rows.
 */
export const categorySchema = z.enum([
  'Furniture',
  'Electronics',
  'Home & Garden',
  'Clothing & Kids',
  'Sports & Outdoors',
  'Books & Media',
  'Free & Giveaway',
  'Other',
]);

export const createListingSchema = z
  .object({
    title: trimmed(120).min(3, 'Title must be at least 3 characters'),
    description: trimmed(4000).max(4000).optional().default(''),
    price: z.coerce.number().min(0, 'Price cannot be negative').max(1_000_000),
    category: categorySchema,
    images: z.array(httpsUrl).max(5, 'A maximum of 5 images is allowed').optional().default([]),
    location: trimmed(120).optional(),
    // Optional, but the pair rule still applies, so no half-position lands.
    lat: latField.optional(),
    lng: lngField.optional(),
  })
  .strict()
  .superRefine(latLngPair);

/**
 * Partial update, still `.strict()` - this is what blocks mass assignment of `user_id`/`status`/`id`.
 */
export const updateListingSchema = z
  .object({
    title: trimmed(120).min(3).optional(),
    description: trimmed(4000).optional(),
    price: z.coerce.number().min(0).max(1_000_000).optional(),
    category: categorySchema.optional(),
    images: z.array(httpsUrl).max(5).optional(),
    location: trimmed(120).optional(),
    lat: latField.optional(),
    lng: lngField.optional(),
    status: listingStatus.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No valid fields to update' })
  .superRefine(latLngPair);

/**
 * Feed query; viewer `lat`/`lng` narrow the DB to a bounding box - see KM_PER_DEGREE_LAT in server.ts.
 */
export const listListingsQuerySchema = z
  .object({
    radius: z.coerce
      .number()
      .min(0.5, 'Radius must be at least 0.5 km')
      .max(50, 'Radius cannot be more than 50 km')
      .optional(),
    lat: latField.optional(),
    lng: lngField.optional(),
    category: categorySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    cursor: z.string().uuid().optional(),
  })
  .superRefine(latLngPair);

// --- chat -------------------------------------------------------------------

/**
 * Start (or reopen) a conversation; buyer and seller are resolved server-side, never from the client.
 */
export const startConversationSchema = z
  .object({ listingId: z.string().uuid('Invalid listing') })
  .strict();

/**
 * Message body, trimmed before length is measured so whitespace cannot pass as empty; max 2000.
 */
export const sendMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Message cannot be empty')
      .max(2000, 'Message must be at most 2000 characters'),
  })
  .strict();

// --- reports ----------------------------------------------------------------

/**
 * Matches the CHECK on `listing_reports.reason` (else a DB 500); client renders these six.
 */
export const reportReason = z.enum([
  'spam',
  'scam',
  'prohibited',
  'duplicate',
  'inappropriate',
  'other',
]);

export const createReportSchema = z
  .object({
    reason: reportReason,
    // Optional but bounded: untrusted free text, so one client cannot write an
    // unbounded blob per report.
    details: z.string().trim().max(1000, 'Details must be at most 1000 characters').optional(),
  })
  .strict();

// --- reviews ----------------------------------------------------------------

/**
 * Rating bounds mirror the CHECK on `reviews.rating` (else a DB 500). The
 * conversation, reviewer and target are resolved server-side from the token.
 */
export const createReviewSchema = z
  .object({
    conversationId: z.string().uuid('Invalid conversation'),
    rating: z.number().int().min(1, 'Pick a star rating').max(5, 'Rating must be 1 to 5'),
    comment: z
      .string()
      .trim()
      .max(500, 'Comment must be at most 500 characters')
      .optional()
      .default(''),
  })
  .strict();

// --- uploads ----------------------------------------------------------------

/** Cloudinary public_id: folder/name with a restricted charset. */
export const publicIdParam = z.object({
  publicId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_/-]+$/, 'Invalid asset identifier'),
});

export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
