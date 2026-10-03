// VITE_API_URL is the API origin (no path); /api is appended here and trailing
// slashes stripped. Unset means same-origin, as a reverse-proxied build wants.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_BASE = `${API_ORIGIN}/api`;

/**
 * Access token for authenticated calls, kept in sessionStorage so it dies with the tab.
 */
let memoryToken: string | null = null;

/**
 * Refresh token and access token expiry; Supabase access tokens last one hour.
 */
let memoryRefreshToken: string | null = null;
let memoryExpiresAt: number | null = null;

/** Refresh this far ahead of the real deadline, to absorb clock skew and latency. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Converts an expiry to ms: Supabase reports seconds; values >= 1e12 already are ms.
 */
function toMillis(exp: number): number {
  return exp < 1e12 ? exp * 1000 : exp;
}

function readStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = sessionStorage.getItem('pm_access_token');
    memoryRefreshToken = sessionStorage.getItem('pm_refresh_token');
    const exp = sessionStorage.getItem('pm_expires_at');
    memoryExpiresAt = exp ? toMillis(Number(exp)) : null;
  } catch {
    // Private mode / disabled storage: fall back to memory-only auth.
    memoryToken = null;
  }
  return memoryToken;
}

export function getToken(): string | null {
  return readStoredToken();
}

/** True when a stored token is near expiry, so a refresh is due. */
export function needsRefresh(): boolean {
  readStoredToken();
  if (!memoryToken) return false;
  // No expiry recorded (older session): refresh rather than assume it is good.
  if (memoryExpiresAt === null) return true;
  return Date.now() >= memoryExpiresAt - REFRESH_MARGIN_MS;
}

export function setToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem('pm_access_token', token);
    else sessionStorage.removeItem('pm_access_token');
  } catch {
    // Ignore: the in-memory copy above still works for this page's lifetime.
  }
}

/**
 * Records a full session; both tokens are cleared together so a later sign-in cannot inherit it.
 */
export function setSession(session: {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}): void {
  memoryToken = session.access_token;
  memoryRefreshToken = session.refresh_token ?? null;
  memoryExpiresAt = session.expires_at != null ? toMillis(session.expires_at) : null;
  try {
    sessionStorage.setItem('pm_access_token', session.access_token);
    if (session.refresh_token) sessionStorage.setItem('pm_refresh_token', session.refresh_token);
    else sessionStorage.removeItem('pm_refresh_token');
    if (memoryExpiresAt != null) sessionStorage.setItem('pm_expires_at', String(memoryExpiresAt));
    else sessionStorage.removeItem('pm_expires_at');
  } catch {
    // Ignore: memory-only auth still works for this page's lifetime.
  }
}

export function getRefreshToken(): string | null {
  readStoredToken();
  return memoryRefreshToken;
}

export function clearToken(): void {
  setToken(null);
  // The refresh token goes too, so a later sign-in cannot resume this session.
  memoryRefreshToken = null;
  memoryExpiresAt = null;
  try {
    sessionStorage.removeItem('pm_access_token');
    sessionStorage.removeItem('pm_refresh_token');
    sessionStorage.removeItem('pm_expires_at');
  } catch {
    // Ignore.
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { field: string; message: string }[];

  constructor(
    message: string,
    status: number,
    code = 'UNKNOWN',
    details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: { field: string; message: string }[];
  };
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: ErrorEnvelope = {};
  try {
    body = (await res.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error body (proxy error page, 502, etc.)
  }
  const { code, message, details } = body.error ?? {};
  return new ApiError(
    message || `Request failed with status ${res.status}`,
    res.status,
    code || `HTTP_${res.status}`,
    details,
  );
}

async function rawFetch(path: string, options?: RequestInit, token?: string | null): Promise<Response> {
  const headers = new Headers(options?.headers);

  // JSON Content-Type only for non-FormData bodies; setting it on FormData
  // breaks the multipart boundary the browser must generate.
  if (options?.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

/**
 * Refreshes the access token with the stored refresh token; de-duplicated via a shared in-flight promise.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await rawFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        session: { access_token: string; refresh_token?: string; expires_at?: number };
      };
      setSession(data.session);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Returns a valid token, refreshing first when near expiry; the realtime stream has no pre-flight refresh.
 */
export async function getFreshToken(): Promise<string | null> {
  if (needsRefresh()) {
    const refreshed = await refreshSession();
    if (!refreshed) return null;
  }
  return readStoredToken();
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  // Refresh before the call when nearly expired rather than waiting for a 401.
  // `/auth/*` is excluded so login and refresh cannot recurse into a refresh.
  const isAuthRoute = path.startsWith('/auth/');
  if (!isAuthRoute && needsRefresh()) {
    await refreshSession();
  }

  let res = await rawFetch(path, options, readStoredToken());

  // 401 despite the check: refresh once and replay. A second failure means the
  // session is genuinely over.
  if (res.status === 401 && !isAuthRoute) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await rawFetch(path, options, readStoredToken());
    }
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toApiError(res);

  return (await res.json()) as T;
}

export interface ApiListing {
    id: string;
    title: string;
    description?: string;
    price: number;
    category: string;
    images: string[];
    location: string;
    /** Absent for listings posted before they were pinned. */
    lat?: number;
    lng?: number;
    user_id?: string;
    profiles?: { username: string; avatar_url?: string } | null;
    created_at?: string;
    status?: string;
    }

export interface ApiProfile {
    id: string;
    username?: string;
    avatar_url?: string;
    bio?: string;
    location?: string;
    /** Set once the user has dropped a pin; the basis for "near me" browsing. */
    lat?: number;
    lng?: number;
    created_at?: string;
    email?: string;
    /** Average rating received, and how many reviews that average is built from. */
    rating?: number;
    reviewsCount?: number;
    }

/** One message row, as returned by every chat endpoint. */
export interface ApiMessage {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * A conversation as the list endpoint returns it: thread, participants, listing summary and messages.
 */
export interface ApiConversation {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  listingPrice: number;
  listingStatus: string;
  buyerId: string;
  buyerName: string;
  buyerAvatar: string | null;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: ApiMessage[];
}

/** A review as `/api/reviews` returns it: the same shape the UI renders. */
export interface ApiReview {
  id: string;
  transactionId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar: string;
  targetUserId: string;
  targetName: string;
  targetAvatar: string;
  rating: number;
  comment: string;
  /** ISO timestamp; format it for display. */
  createdAt: string;
  itemTitle: string;
}

/** An inbox row as `/api/notifications` returns it. */
export interface ApiNotification {
  id: string;
  type: 'message' | 'listing' | 'status' | 'system';
  title: string;
  message: string;
  conversationId: string | null;
  listingId: string | null;
  read: boolean;
  /** ISO timestamp; format it for display. */
  createdAt: string;
}

export const api = {
  listings: {
    list: (params?: { radius?: number; lat?: number; lng?: number; category?: string; limit?: number }) => {
      const search = new URLSearchParams();
      // lat/lng are the viewer's pin; sent so the API narrows the search itself.
      if (params?.radius !== undefined) search.set('radius', String(params.radius));
      if (params?.lat !== undefined) search.set('lat', String(params.lat));
      if (params?.lng !== undefined) search.set('lng', String(params.lng));
      if (params?.limit !== undefined) search.set('limit', String(params.limit));
      if (params?.category && params.category !== 'All') search.set('category', params.category);
      const qs = search.toString();
      return fetchJson<ApiListing[]>(`/listings${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => fetchJson<ApiListing>(`/listings/${encodeURIComponent(id)}`),
    /**
     * The signed-in user's own listings, including sold and reserved; separate from the radius-narrowed feed.
     */
    mine: () => fetchJson<ApiListing[]>('/me/listings'),
    create: (data: unknown) => fetchJson<ApiListing>('/listings', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) =>
      fetchJson<ApiListing>(`/listings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchJson<{ success?: boolean }>(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    /**
     * Files a report; `alreadyReported: true` means this caller already reported it, which counts as success.
     */
    report: (id: string, report: { reason: string; details?: string }) =>
      fetchJson<{ id?: string; reason?: string; createdAt?: string; alreadyReported?: boolean }>(
        `/listings/${encodeURIComponent(id)}/reports`,
        { method: 'POST', body: JSON.stringify(report) },
      ),
  },

  favorites: {
    /**
     * Saved items as full listing rows, newest first - rows rather than ids, so sold items stay visible.
     */
    list: () => fetchJson<{ savedAt: string; listing: ApiListing }[]>('/favorites'),
    add: (listingId: string) =>
      fetchJson<{ listingId: string }>(`/favorites/${encodeURIComponent(listingId)}`, {
        method: 'POST',
      }),
    remove: (listingId: string) =>
      fetchJson<void>(`/favorites/${encodeURIComponent(listingId)}`, { method: 'DELETE' }),
  },

  auth: {
    // No `demo` flag: demo mode is gone, so the server never reports one. If it
    // ever reappears, that is a bug worth failing on rather than ignoring.
    me: () => fetchJson<{ user: ApiProfile; reviews?: ApiReview[] }>('/auth/me'),
    // Sets or moves the member's pin and edits name and bio. PATCH so only the
    // supplied fields change: editing a location cannot blank a bio.
    updateProfile: (patch: {
      username?: string;
      avatar_url?: string | null;
      bio?: string;
      location?: string;
      lat?: number;
      lng?: number;
    }) =>
      fetchJson<{ user: ApiProfile; reviews?: ApiReview[] }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    login: (email: string, password: string) =>
      fetchJson<{
        session: { access_token: string; refresh_token?: string; expires_at?: number };
        user: unknown;
      }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    // Returns a session when the server signs the new account in immediately;
    // optional otherwise. lat/lng come from the LocationPicker.
    signup: (
      email: string,
      password: string,
      username: string,
      lat?: number,
      lng?: number,
      location?: string,
    ) =>
      fetchJson<{
        user: unknown;
        session?: { access_token: string; refresh_token?: string; expires_at?: number };
      }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, username, lat, lng, location: location || undefined }),
      }),
    logout: () => fetchJson<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },

  upload: {
    images: (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      return fetchJson<{ images: { url: string; public_id: string }[] }>('/upload', {
        method: 'POST',
        body: formData,
      });
    },
    // public_id contains slashes ("pulse-market/<uid>/<name>"); without
    // encoding they become extra path segments and the route never matches.
    remove: (publicId: string) =>
      fetchJson<{ success?: boolean }>(`/upload/${encodeURIComponent(publicId)}`, { method: 'DELETE' }),
  },

  chats: {
    /** Every thread the caller is in, with messages, newest activity first. */
    list: () => fetchJson<ApiConversation[]>('/chats'),
    /**
     * Start or reopen the caller's thread about a listing; the server decides buyer and seller. Idempotent.
     */
    start: (listingId: string) =>
      fetchJson<{
        id: string;
        listing_id: string;
        buyer_id: string;
        seller_id: string;
      }>('/chats', {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      }),
    messages: (conversationId: string) =>
      fetchJson<ApiMessage[]>(`/chats/${encodeURIComponent(conversationId)}/messages`),
    send: (conversationId: string, body: string) =>
      fetchJson<ApiMessage>(`/chats/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    markRead: (conversationId: string) =>
      fetchJson<{ success?: boolean }>(`/chats/${encodeURIComponent(conversationId)}/read`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  reviews: {
    /** The caller's reviews in both directions, received first. */
    list: () => fetchJson<ApiReview[]>('/reviews'),
    create: (data: { conversationId: string; rating: number; comment: string }) =>
      fetchJson<ApiReview>('/reviews', { method: 'POST', body: JSON.stringify(data) }),
  },

  notifications: {
    /** The caller's own inbox, newest first. */
    list: () => fetchJson<ApiNotification[]>('/notifications'),
    readAll: () => fetchJson<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
  },

  health: () => fetchJson<{ status: string; timestamp: string }>('/health'),
};

