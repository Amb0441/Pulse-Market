import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError, clearToken, getToken, setSession, type ApiConversation, type ApiListing, type ApiNotification, type ApiReview } from '../lib/api';
import { toListing, toListings, toUserProfile } from '../lib/listing';
import { toChatThreads } from '../lib/chat';
import { toNotification, toReview } from '../lib/activity';
import { formatRelative } from '../lib/format';
import type { AppNotification, ChatThread, Listing, Message, Review, UserProfile } from '../types';

export interface ListingsParams {
  radius?: number;
  lat?: number;
  lng?: number;
  category?: string;
}

export function useListings(params?: ListingsParams) {
  return useQuery<Listing[]>({
    // Params are in the key, so widening the radius re-queries; `keepPreviousData`
    // holds the list on screen while it does, so the feed never blanks to a spinner.
  queryKey: ['listings', params ?? null],
  queryFn: async () => toListings((await api.listings.list(params)) as ApiListing[]),
  placeholderData: keepPreviousData,
  // Polls rather than subscribing: no Supabase client in the browser, so this is the
  // only live channel; 15s balances feeling live against hammering the API.
  refetchInterval: 15_000,
  // Without it, switching tabs pauses the interval and a backgrounded tab can
  // sit on a stale feed indefinitely.
  refetchIntervalInBackground: false,
  });
}

export function useListing(id: string) {
  return useQuery<Listing>({
    queryKey: ['listing', id],
    queryFn: async () => toListing((await api.listings.get(id)) as ApiListing),
    enabled: !!id,
  });
}

export function useMyListings() {
  return useQuery<Listing[]>({
    queryKey: ['myListings'],
    queryFn: async () => toListings((await api.listings.mine()) as ApiListing[]),
    enabled: !!getToken(),
    // Matches the feed's 15s so a seller sees their item go live with the buyers;
    // the interval only catches changes made on another device.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Listing>) => api.listings.create(data),
    // The sell form shows its own inline message, so skip the global toast.
    meta: { inline: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      // The API writes the "listing published" notification; this only refetches it.
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Listing> }) => api.listings.update(id, data),
    onSuccess: (_, { id }) => {
      // The feed shows this row to other people and "my listings" shows it to the
      // seller, so both caches need invalidating.
      void qc.invalidateQueries({ queryKey: ['listings'] });
      void qc.invalidateQueries({ queryKey: ['myListings'] });
      void qc.invalidateQueries({ queryKey: ['listing', id] });
      // Conversations embed the listing's status, so thread headers and their
      // Reserve/Mark sold buttons must refetch off the same row.
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.listings.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useUploadImages() {
  return useMutation({
    mutationFn: (files: File[]) => api.upload.images(files),
    // The sell form shows its own inline message, so skip the global toast.
    meta: { inline: true },
  });
}

/**
 * Edit the member's profile: pin, name, area or bio; refetches listings that embed the seller and distances.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      username?: string;
      avatar_url?: string | null;
      bio?: string;
      location?: string;
      lat?: number;
      lng?: number;
    }) => api.auth.updateProfile(patch),
    // The navbar shows the result inline next to the control the user just used.
    meta: { inline: true },
    onSuccess: (data) => {
      qc.setQueryData(['auth', 'me'], toUserProfile(data.user));
      // Every card embeds the seller's name and every distance used the old pin, so
      // a rename or a moved pin leaves the feed stale; refetch both caches.
      void qc.invalidateQueries({ queryKey: ['listings'] });
      void qc.invalidateQueries({ queryKey: ['myListings'] });
    },
  });
}

// --- favorites --------------------------------------------------------------

/**
 * The signed-in user's saved items as full listing rows, the single source for every heart.
 */
export function useFavorites() {
  return useQuery<{ savedAt: string; listing: Listing }[]>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const rows = await api.favorites.list();
      return rows.map((row) => ({ savedAt: row.savedAt, listing: toListing(row.listing) }));
    },
    // Saving needs an identity, and there is nothing to show signed out, so the
    // query stays disabled without a token.
    enabled: !!getToken(),
  });
}

/**
 * Saves or unsaves optimistically (hand-written cache, rolled back on failure) so the heart reacts on tap.
 */
export function useToggleFavorite() {
  const qc = useQueryClient();

  return useMutation<void, unknown, { listingId: string; saved: boolean }, { previous?: { savedAt: string; listing: Listing }[] }>({
    mutationFn: async ({ listingId, saved }) => {
      if (saved) await api.favorites.remove(listingId);
      else await api.favorites.add(listingId);
    },

    onMutate: async ({ listingId, saved }) => {
      await qc.cancelQueries({ queryKey: ['favorites'] });
      const previous = qc.getQueryData<{ savedAt: string; listing: Listing }[]>(['favorites']);

      qc.setQueryData<{ savedAt: string; listing: Listing }[]>(['favorites'], (old) => {
        const rest = (old ?? []).filter((row) => row.listing.id !== listingId);
        if (saved) return rest;

        // The row may only exist in a feed cache, stored under ['listings', params];
        // `getQueryData` matches exactly and misses it, `getQueriesData` by prefix.
        const cachedFeeds = qc.getQueriesData<Listing[]>({ queryKey: ['listings'] });
        const fromFeed = cachedFeeds
          .flatMap(([, data]) => data ?? [])
          .find((l) => l.id === listingId);

        const listing = (old ?? []).find((row) => row.listing.id === listingId)?.listing ?? fromFeed;
        return listing ? [{ savedAt: new Date().toISOString(), listing }, ...rest] : rest;
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['favorites'], context.previous);
    },

    onSettled: () => {
      // Reconciles with the server either way, but the UI has already moved, so
      // this is a quiet correction rather than the thing the user waits on.
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// --- chat -------------------------------------------------------------------

/**
 * The signed-in user's conversation list; disabled without a token, since it could only 401.
 */
export function useChats() {
  return useQuery<ChatThread[]>({
    queryKey: ['chats'],
    queryFn: async () => toChatThreads((await api.chats.list()) as ApiConversation[]),
    enabled: !!getToken(),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
}

/**
 * Start or reopen the thread about a listing; the server is idempotent, so it returns the existing thread.
 */
export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => api.chats.start(listingId),
    meta: { inline: true },
    onSuccess: (row, listingId) => {
      const me = qc.getQueryData<UserProfile>(['auth', 'me']);
      const listing =
        qc.getQueriesData<Listing[]>({ queryKey: ['listings'] })
          .flatMap(([, rows]) => rows ?? [])
          .find((l) => l.id === listingId) ??
        qc.getQueryData<Listing[]>(['myListings'])?.find((l) => l.id === listingId);

      qc.setQueryData<ChatThread[]>(['chats'], (old) => {
        const list = old ?? [];
        if (list.some((t) => t.id === row.id || t.listingId === listingId)) {
          return list;
        }
        const stub: ChatThread = {
          id: row.id,
          listingId: row.listing_id || listingId,
          listingTitle: listing?.title ?? 'Listing',
          listingImage: listing?.images?.[0] ?? '',
          listingPrice: listing?.price ?? 0,
          listingStatus: listing?.status ?? 'active',
          buyerId: row.buyer_id,
          buyerName: me?.name ?? 'You',
          sellerId: row.seller_id,
          sellerName: listing?.sellerName ?? 'Seller',
          lastMessage: '',
          lastMessageTime: '',
          unreadCount: 0,
          messages: [],
        };
        return [stub, ...list];
      });
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

/**
 * Sends a message, appended to the cache first so it shows on tap rather than after a refetch.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: string; body: string }) =>
      api.chats.send(conversationId, body),
    meta: { inline: true },
    onMutate: async ({ conversationId, body }) => {
      await qc.cancelQueries({ queryKey: ['chats'] });
      const previous = qc.getQueryData<ChatThread[]>(['chats']);
      const me = qc.getQueryData<UserProfile>(['auth', 'me']);

      // Without a senderId the bubble renders on the wrong side, so skip the
      // optimistic append if the session has not resolved (a guard, not a path).
      if (me?.id) {
        qc.setQueryData<ChatThread[]>(['chats'], (old) =>
          (old ?? []).map((thread) => {
            if (thread.id !== conversationId) return thread;

            const pending: Message = {
              id: `pending-${Date.now()}`,
              chatId: thread.id,
              senderId: me.id,
              senderName: me.name,
              text: body,
              timestamp: formatRelative(new Date().toISOString()),
            };

            return {
              ...thread,
              messages: [...thread.messages, pending],
              lastMessage: body,
              lastMessageTime: pending.timestamp,
            };
          }),
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['chats'], context.previous);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

/**
 * Reports a listing; invalidates nothing, since a report changes nothing in the reporter's own UI.
 */
export function useReportListing() {
  return useMutation({
    mutationFn: ({ id, reason, details }: { id: string; reason: string; details?: string }) =>
      api.listings.report(id, { reason, details }),
    meta: { inline: true },
  });
}

/**
 * Marks a thread read by writing the badge into the cache; refetching `['chats']` would reload every thread.
 */
export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => api.chats.markRead(conversationId),
    meta: { inline: true },
    onMutate: async (conversationId) => {
      await qc.cancelQueries({ queryKey: ['chats'] });
      const previous = qc.getQueryData<ChatThread[]>(['chats']);

      qc.setQueryData<ChatThread[]>(['chats'], (old) =>
        (old ?? []).map((t) => (t.id === conversationId ? { ...t, unreadCount: 0 } : t)),
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['chats'], context.previous);
    },
  });
}

/** The caller's reviews in both directions: received by the dashboard, given to block a second prompt. */
export function useReviews() {
  return useQuery<Review[]>({
    queryKey: ['reviews'],
    queryFn: async () => ((await api.reviews.list()) as ApiReview[]).map(toReview),
    enabled: !!getToken(),
  });
}

/** Only the conversation, rating and comment travel; reviewer and target are resolved server-side. */
export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; rating: number; comment: string }) =>
      api.reviews.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      // The profile header shows the new average, which this write just changed.
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/** The caller's own inbox, polled like the other live surfaces. */
export function useNotifications() {
  return useQuery<AppNotification[]>({
    queryKey: ['notifications'],
    queryFn: async () => ((await api.notifications.list()) as ApiNotification[]).map(toNotification),
    enabled: !!getToken(),
    refetchInterval: 30_000,
  });
}

/** Clears the badge optimistically, so it does not wait on a round trip. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.readAll(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const previous = qc.getQueryData<AppNotification[]>(['notifications']);
      qc.setQueryData<AppNotification[]>(['notifications'], (old) =>
        (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['notifications'], context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useAuth() {
  return useQuery<UserProfile | null>({
    queryKey: ['auth', 'me'],    // With no token, report "signed out" instead of a request that can only 401.
    queryFn: async (): Promise<UserProfile | null> => {
      if (!getToken()) return null;
      try {
        const res = await api.auth.me();
        return toUserProfile(res.user);
      } catch (err) {
        // A 401 that survived fetchJson's refresh-and-retry means the session is dead:
        // clear it and report "signed out" - the one place a 401 is a sign-out.
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 10,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.auth.login(email, password),
    // The auth form renders its own inline message; suppress the global toast so a
    // wrong password is reported once, not twice.
    meta: { inline: true },
    onSuccess: (data) => {
      // Store the whole session; without the refresh token it dies with the access token.
      setSession(data.session);
      qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: () => {
      // Never leave a stale token behind after a failed sign-in.
      clearToken();
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      username,
      lat,
      lng,
      location,
    }: {
      email: string;
      password: string;
      username: string;
      lat: number;
      lng: number;
      location?: string;
    }) => api.auth.signup(email, password, username, lat, lng, location),
    meta: { inline: true },
    onSuccess: (data) => {
      // Signup usually returns a session, so store it and skip asking for the same
      // credentials again.
      if (data.session) {
        setSession(data.session);
      } else {
        // No session: the account was created but not signed in; drop any stale session.
        clearToken();
      }
      qc.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    // Clear local auth whether or not the server call succeeded: the user asked to
    // sign out, so a failed request must not leave them logged in.
    onSettled: () => {
      clearToken();
      qc.clear();
    },
  });
}