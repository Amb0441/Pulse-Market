import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LandingPage } from './components/LandingPage';
import { Navbar } from './components/Navbar';
import { MapView } from './components/MapView';
import { MarketFeed } from './components/MarketFeed';
import { ListingDetailModal } from './components/ListingDetailModal';
import { SellModal } from './components/SellModal';
import { ChatHub } from './components/ChatHub';
import { Dashboard } from './components/Dashboard';
import { ReviewModal } from './components/ReviewModal';
import { SettingsModal } from './components/SettingsModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { NotificationCenter } from './components/NotificationCenter';
import { OfflineBanner } from './components/OfflineBanner';
import { LegalPage } from './components/LegalPage';
import { Toaster } from './components/Toaster';
import { Loader2 } from 'lucide-react';

import { useAuth, useListings, useMyListings, useUpdateListing, useDeleteListing, useLogout, useUpdateProfile, useChats, useStartConversation, useSendMessage, useMarkChatRead, useFavorites, useToggleFavorite, useReviews, useCreateReview, useNotifications, useMarkNotificationsRead } from './hooks/useQueries';
import { getToken, api, type ApiListing } from './lib/api';
import { useRealtimeSync } from './lib/useRealtimeSync';
import { toListing } from './lib/listing';
import { notifyError } from './stores/useToasts';
import { distanceKm } from './lib/geo';
import { Listing, UserProfile, ChatThread, Review, AppNotification, ItemStatus } from './types';

/**
 * Static legal routes from the pathname; no router, nginx serves index.html for them.
 */
const LEGAL_ROUTES: Record<string, 'privacy' | 'terms' | 'faq'> = {
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/faq': 'faq',
};

export default function App() {
  const [theme] = useState<'light'>('light');
  const [activeTab, setActiveTab] = useState<'map' | 'feed' | 'chats' | 'dashboard'>('feed');
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const legal = LEGAL_ROUTES[path];

  // Declared before useListings below, which reads it to build the request.
  const [selectedRadiusKm, setSelectedRadiusKm] = useState(3);

  // Real data only: no mock dataset, so an empty database renders empty states
  // rather than placeholder listings.
  const { data: user, isLoading: authLoading, isError: authError, refetch: refetchAuth } = useAuth();

  // Live push instead of waiting for the next poll. Needs `user` because the
  // stream is authenticated; opening it early would only spend a reconnect.
  useRealtimeSync(!!user);

  /**
   * Narrowed server-side by the viewer's pin and radius; without a pin it returns the newest listings.
   */
  const hasPin = user?.lat !== undefined && user?.lng !== undefined;
  const listingsQuery = useListings(
    hasPin
      ? { radius: selectedRadiusKm, lat: user.lat, lng: user.lng }
      : undefined,
  );
  const { data: fetchedListings, isLoading, isError, error: listingsError, refetch } =
    listingsQuery;

  /**
   * Haversine distance from the viewer's pin; no pin means `distanceKm` stays undefined ("unknown").
   */
  const listings: Listing[] = useMemo(() => {
    const rows: Listing[] = fetchedListings ?? [];
    const origin =
      user?.lat !== undefined && user?.lng !== undefined ? { lat: user.lat, lng: user.lng } : null;
    if (!origin) return rows;
    return rows.map((l) =>
      l.lat !== undefined && l.lng !== undefined
        ? { ...l, distanceKm: distanceKm(origin, { lat: l.lat, lng: l.lng }) }
        : l,
    );
  }, [fetchedListings, user?.lat, user?.lng]);

  // Mutations go through the API, which invalidates the cache; there is no local
  // copy of listings that could drift from the database.
  const { mutate: updateListing } = useUpdateListing();
  const { mutate: removeListing } = useDeleteListing();
  // The seller's own items from their own endpoint rather than the radius-filtered
  // feed, so a sold item still appears on their record.
  const { data: myListings = [] } = useMyListings();
  const { mutate: signOut } = useLogout();
  const { mutate: updateProfile } = useUpdateProfile();

  // Conversations are server-backed; the mutations invalidate `['chats']` and the
  // thread list re-renders from the database.
  const { data: chats = [] } = useChats();
  const { mutate: startConversation } = useStartConversation();
  const { mutate: sendMessage } = useSendMessage();
  const { mutate: markChatRead } = useMarkChatRead();

  // The area line under the logo opens the location popup; it is also the only
  // way a member who signed up before coordinates existed can get a pin.
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');

  const openLocationEditor = () => {
    setLocationLabel(user?.neighborhood?.trim() ?? '');
    setIsLocationOpen(true);
  };

  // Stable identity for the popup's `value`: memoised so an unrelated re-render
  // does not hand it a new object, but a lat/lng change still does.
  const userPin = useMemo(
    () =>
      user?.lat !== undefined && user?.lng !== undefined ? { lat: user.lat, lng: user.lng } : null,
    [user?.lat, user?.lng],
  );

  /**
   * Saved items from the server, the single source for card hearts, the modal heart and the Saved tab.
   */
  const { data: favorites = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const savedListingIds = useMemo(() => favorites.map((row) => row.listing.id), [favorites]);
  const savedListings = useMemo(() => favorites.map((row) => row.listing), [favorites]);

  // Reviews and notifications are server rows, so a reload keeps both. The
  // local list only tracks "already asked this session" - closing the modal counts.
  const { data: reviews = [] } = useReviews();
  const { data: notifications = [] } = useNotifications();
  const { mutateAsync: createReview } = useCreateReview();
  const { mutate: markNotificationsRead } = useMarkNotificationsRead();
  const [reviewPrompted, setReviewPrompted] = useState<string[]>([]);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reviewChat, setReviewChat] = useState<ChatThread | null>(null);
  // The listing whose thread the ChatHub should open next, set when the user
  // taps "Message seller". Cleared once the hub has shown that thread.
  const [openChatListingId, setOpenChatListingId] = useState<string | null>(null);
  const unreadMessagesCount = chats.reduce((acc, c) => acc + c.unreadCount, 0);
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  // Reads `saved` from the server-backed set rather than the listing, so the
  // card heart and the modal heart cannot disagree about the current state.
  const handleToggleSave = (listingId: string) => {
    toggleFavorite.mutate({ listingId, saved: savedListingIds.includes(listingId) });
  };

  /**
   * Opens the review modal once, from either side: the seller's "Mark sold" or the buyer's thread.
   */
  const promptReview = (chat: ChatThread) => {
    if (reviewPrompted.includes(chat.id)) return;
    // Only sold items prompt; an unopened thread from a stranger is not one.
    if (chat.listingStatus !== 'sold') return;
    // Already rated in an earlier session: the server row is the record, not this list.
    if (reviews.some((r) => r.transactionId === chat.id && r.reviewerId === user?.id)) return;
    setReviewPrompted((prev) => [...prev, chat.id]);
    setReviewChat(chat);
  };

  const handleUpdateListingStatus = (listingId: string, status: ItemStatus) => {
    // Invalidates the listings, my-listings and chats caches, so the feed, the
    // seller's dashboard and the thread's status badge settle together.
    updateListing({ id: listingId, data: { status } });

    // Marking sold is the one moment to ask the seller for a review; the buyer
    // is prompted when their thread sees the same status change.
    if (status === 'sold') {
      const thread = chats.find((c) => c.listingId === listingId);
      if (thread) promptReview(thread);
    }
  };

  const handleDeleteListing = (listingId: string) => {
    removeListing(listingId);
  };

  const handleStartChatFromListing = (listing: Listing) => {
    // Guard: chat requires a signed-in identity.
    if (!user) return;
    // Cannot message yourself about your own listing; the database also enforces
    // `buyer_id <> seller_id`.
    if (listing.sellerId === user.id) return;
    // Idempotent on the server, so this reopens the existing thread rather than forking.
    // The listing id lets the hub jump to it once the fetched list arrives.
    setOpenChatListingId(listing.id);
    startConversation(listing.id);
    setActiveTab('chats');
  };

  // Stable identity so the hub's jump effect does not re-run on every render of
  // this component, which would fight the user's own thread selection.
  const handleChatOpened = useCallback(() => setOpenChatListingId(null), []);

  const handleSendMessage = (chatId: string, text: string) => {
    if (!user) return;
    sendMessage({ conversationId: chatId, body: text });
  };

  const handleMarkChatRead = (chatId: string) => {
    // Only bother the server about a thread that actually has something unread.
    const thread = chats.find((c) => c.id === chatId);
    if (!thread || thread.unreadCount === 0) return;
    markChatRead(chatId);
  };

  /**
   * Opens the listing behind a conversation: cache first, API only when the row is genuinely missing.
   */
  const handleViewListingFromChat = async (listingId: string) => {
    const cached =
      listings.find((l) => l.id === listingId) ?? myListings.find((l) => l.id === listingId);
    if (cached) {
      setSelectedListing(cached);
      return;
    }
    try {
      setSelectedListing(toListing((await api.listings.get(listingId)) as ApiListing));
    } catch (err) {
      notifyError(err, 'We could not open that listing.');
    }
  };

  /**
   * Sends the three fields the API accepts; reviewer, target and listing title
   * are resolved there. The rejection is toasted by the mutation cache, and the
   * modal closes itself through `onClose`.
   */
  const handleSubmitReview = (input: { conversationId: string; rating: number; comment: string }) =>
    createReview(input);

  // Checked here rather than at the top of the component: every hook above must
  // run unconditionally, or the hook count changes and React crashes.
  if (legal) {
    return <LegalPage kind={legal} />;
  }

  // With a stored token, loading or a transient auth error is not a sign-out: show
  // the splash and let the retry resolve. LandingPage is for the no-token case.
  if (!user) {
    if (getToken() && (authLoading || authError)) {
      return (
        <div className="h-screen grid place-items-center bg-paper">
          <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
            <Loader2 className="w-6 h-6 animate-spin text-clay" aria-hidden="true" />
            <p className="text-sm text-ink-soft">
              {authError ? 'Reconnecting\u2026' : 'Loading Pulse Market\u2026'}
            </p>
          </div>
        </div>
      );
    }
    return (
      <LandingPage
        onAuthenticated={() => { void refetchAuth(); }}
        theme={theme}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col transition-colors bg-paper">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          onEditLocation={openLocationEditor}
        unreadMessagesCount={unreadMessagesCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenSellModal={() => setIsSellModalOpen(true)}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        onSignOut={() => signOut()}
        theme={theme}
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0 relative no-scrollbar">
        <div className={activeTab === 'feed' ? 'block' : 'hidden'}>
          <MarketFeed
            listings={listings}
            isLoading={isLoading}
            isError={isError}
            error={listingsError}
            onRetry={() => { void refetch(); }}
            onOpenSellModal={() => setIsSellModalOpen(true)}
            onSelectListing={(listing) => setSelectedListing(listing)}
            onToggleSave={handleToggleSave}
            savedListingIds={savedListingIds}
            currentUserId={user.id}
            selectedRadiusKm={selectedRadiusKm}
            setSelectedRadiusKm={setSelectedRadiusKm}
            theme={theme}
          />
        </div>

        <div className={activeTab === 'map' ? 'block h-full w-full flex' : 'hidden'}>
          <MapView
            listings={listings}
            onSelectListing={(listing) => setSelectedListing(listing)}
            selectedRadiusKm={selectedRadiusKm}
            setSelectedRadiusKm={setSelectedRadiusKm}
            origin={
              user?.lat !== undefined && user?.lng !== undefined
                ? { lat: user.lat, lng: user.lng }
                : null
            }
          />
        </div>

        <div className={activeTab === 'chats' ? 'h-full' : 'hidden'}>
          <ChatHub
            chats={chats}
            currentUserId={user.id}
            onSendMessage={handleSendMessage}
            onMarkRead={handleMarkChatRead}
            onUpdateListingStatus={handleUpdateListingStatus}
            onOpenReviewModal={promptReview}
            onViewListing={handleViewListingFromChat}
            openListingId={openChatListingId}
            onChatOpened={handleChatOpened}
            theme={theme}
          />
        </div>

        <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
          <Dashboard
              user={user}
              listings={listings}
              myListings={myListings}
              savedListingIds={savedListingIds}
              savedRows={savedListings}
            reviews={reviews}
            onUpdateStatus={handleUpdateListingStatus}
            onDeleteListing={handleDeleteListing}
            onToggleSave={handleToggleSave}
            onSelectListing={(listing) => setSelectedListing(listing)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenSellModal={() => setIsSellModalOpen(true)}
            theme={theme}
          />
        </div>
      </main>

      {/* Modals */}
        <ListingDetailModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onToggleSave={handleToggleSave}
          savedListingIds={savedListingIds}
          onStartChat={handleStartChatFromListing}
          currentUserId={user?.id}
          theme={theme}
        />

      <SellModal
        isOpen={isSellModalOpen}
        onClose={() => setIsSellModalOpen(false)}
        theme={theme}
      />

      <NotificationCenter
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => markNotificationsRead()}
        theme={theme}
      />

      <ReviewModal
        chat={reviewChat}
        currentUser={user}
        onClose={() => setReviewChat(null)}
        onSubmitReview={handleSubmitReview}
        theme={theme}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        user={user}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
      />

      {/* Portal-mounted, so it escapes the sticky header's backdrop-blur. */}
      {user && (
        <LocationPickerModal
          open={isLocationOpen}
          // Memoised: an inline `{ lat, lng }` would be a new object every render
          // and re-seed the popup on each keystroke.
          value={userPin}
          label={locationLabel}
          onLabelChange={setLocationLabel}
          onConfirm={(next) =>
            updateProfile({ lat: next.lat, lng: next.lng, location: locationLabel.trim() || undefined })
          }
          onClose={() => setIsLocationOpen(false)}
          title="Update your area"
        />
      )}

      <OfflineBanner />

      {/* Surfaces failed requests as toasts rather than console-only errors. */}
      <Toaster />
    </div>
  );
}