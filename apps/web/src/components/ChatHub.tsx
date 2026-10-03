import React, { useEffect, useRef, useState } from 'react';
import { ChatThread, ItemStatus } from '../types';
import { MessageSquare, Send, Star, ArrowLeft, MoreVertical, ExternalLink, Link2, CheckCheck, Bookmark, BadgeCheck } from 'lucide-react';
import { formatPrice } from '../lib/format';
import { listingUrl, shareListing, shareText } from '../lib/share';
import { notifySuccess, notifyError } from '../stores/useToasts';
import { ListingImage } from './ListingImage';

interface ChatHubProps {
  chats: ChatThread[];
  /** The signed-in user's real id, used to decide which messages are "mine". */
  currentUserId: string;
  onSendMessage: (chatId: string, text: string) => void;
  /**
   * Clears the server-side unread badge for a thread; the count lives in the database.
   */
  onMarkRead: (chatId: string) => void;
  /**
   * Reserve / Mark sold for this thread's listing; rendered only for the item's seller.
   */
  onUpdateListingStatus: (listingId: string, status: ItemStatus) => void;
  onOpenReviewModal: (chat: ChatThread) => void;
  /**
   * Opens the listing this thread is about, resolved through the API rather than chat data.
   */
  onViewListing?: (listingId: string) => void;
  /**
   * Listing whose conversation was just started, so the hub selects that thread.
   */
  openListingId?: string | null;
  /** Called once that thread is on screen, so the parent can clear `openListingId`. */
  onChatOpened?: () => void;
  theme: 'dark' | 'light';
}

/** A chat stores a single image URL, which is '' when the listing had no photo. */
const chatImages = (url: string): string[] => (url ? [url] : []);

export const ChatHub: React.FC<ChatHubProps> = ({
  chats,
  currentUserId,
  onSendMessage,
  onMarkRead,
  onUpdateListingStatus,
  onOpenReviewModal,
  onViewListing,
  openListingId,
  onChatOpened,
}) => {
  const [activeChatId, setActiveChatId] = useState<string>(chats[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mobileMessagesContainerRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  // `chats` is empty on first paint, so the initial state captured no id.
  // Adopt the newest thread once it lands; a lazy initializer would not re-run.
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  // Jump to a conversation the user just started. Keyed on the listing id, which
  // is stable, rather than on the callback, which is re-created every render.
  useEffect(() => {
    if (!openListingId) return;
    const thread = chats.find((c) => c.listingId === openListingId);
    if (!thread) return;
    setActiveChatId(thread.id);
    setMobileChatOpen(true);
    onChatOpened?.();
  }, [openListingId, chats, onChatOpened]);

  // Opening a thread marks it read on the server so the badge survives a refresh.
  // Keyed on thread id and unread count, not on `chats`, which changes identity per fetch.
  const activeUnread = activeChat?.unreadCount ?? 0;
  useEffect(() => {
    if (activeChat) onMarkRead(activeChat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, activeUnread]);

  // Scroll only the message scroller — scrollIntoView can walk up to <main> and
  // yank the thread header off-screen on mobile.
  useEffect(() => {
    const scroller = mobileChatOpen
      ? mobileMessagesContainerRef.current
      : messagesContainerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [activeChat?.messages.length, activeChatId, mobileChatOpen]);

  // A menu belongs to one thread. Left open across a selection change it would
  // offer the previous conversation's actions against the next one.
  useEffect(() => {
    setShowThreadMenu(false);
  }, [activeChatId]);

  // Full-screen thread should feel like its own app scene: no document bounce
  // and no accidental scroll of the hub underneath.
  useEffect(() => {
    if (!mobileChatOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [mobileChatOpen]);

  /**
   * Prompt for a review when a deal closes while the buyer is reading; only on an edge into `sold`.
   */
  const activeStatus = activeChat?.listingStatus;
  const previousStatus = useRef<{ id: string; status: ItemStatus | undefined } | null>(null);
  useEffect(() => {
    const status = activeStatus;
    const before = previousStatus.current;
    previousStatus.current = { id: activeChatId, status };
    if (status !== 'sold' || !activeChat) return;
    // No edge within this thread: unchanged, already sold, or carried over from
    // the thread just left, which is a switch rather than a change.
    if (!before || before.id !== activeChatId || before.status === undefined || before.status === 'sold') {
      return;
    }
    onOpenReviewModal(activeChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, activeStatus]);

  const handleViewListing = () => {
    setShowThreadMenu(false);
    if (activeChat) onViewListing?.(activeChat.listingId);
  };

  const handleMarkRead = () => {
    setShowThreadMenu(false);
    if (activeChat) onMarkRead(activeChat.id);
  };

  const handleCopyListingLink = async () => {
    setShowThreadMenu(false);
    if (!activeChat) return;
    const url = listingUrl(activeChat.listingId);
    const text = shareText(activeChat.listingTitle, formatPrice(activeChat.listingPrice));
    const result = await shareListing(url, text);
    if (result === 'copied') notifySuccess('Listing link copied to your clipboard.');
    // 'shared' means the OS sheet already confirmed it to the user, so no
    // separate success toast is shown for that result.
    if (result === 'failed') notifyError('We could not copy the link.');
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;
    onSendMessage(activeChat.id, inputText.trim());
    setInputText('');
  };

  const handleStatusChange = (s: ItemStatus) => {
    if (activeChat) {
      onUpdateListingStatus(activeChat.listingId, s);
      setShowThreadMenu(false);
    }
  };

  if (!chats.length) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-sand grid place-items-center mb-4">
          <MessageSquare className="w-8 h-8 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h3 className="font-display text-xl font-bold text-ink">No conversations yet</h3>
        <p className="mt-1 text-sm text-ink-soft">Message a neighbor from the feed or map to get started.</p>
      </div>
    );
  }

  const isSeller = !!activeChat && activeChat.sellerId === currentUserId;

  // Desktop keeps Reserve / Sold in the header; mobile puts them in the ⋮ menu
  // so the top bar stays a single native-style nav row with real touch targets.
  const StatusActions = () => (
    <div className="flex items-center gap-2 shrink-0">
      {isSeller && activeChat.listingStatus === 'active' && (
        <button
          onClick={() => handleStatusChange('reserved')}
          className="h-9 px-4 text-xs rounded-full border border-ink font-semibold hover:bg-mustard hover:border-mustard hover:text-white transition-colors touch-manipulation focus-ring"
        >
          Reserve
        </button>
      )}
      {isSeller && activeChat.listingStatus !== 'sold' && (
        <button
          onClick={() => handleStatusChange('sold')}
          className="h-9 px-4 text-xs rounded-full bg-moss text-white font-semibold hover:opacity-90 transition-opacity touch-manipulation focus-ring"
        >
          Mark sold
        </button>
      )}
      {activeChat.listingStatus === 'sold' && !activeChat.reviewCompleted && (
        <button
          onClick={() => onOpenReviewModal(activeChat)}
          className="h-9 px-4 text-xs rounded-full bg-clay text-white font-semibold flex items-center gap-1.5 touch-manipulation focus-ring"
        >
          <Star className="w-3 h-3 fill-current" aria-hidden="true" />
          Review
        </button>
      )}
    </div>
  );

  const Messages = ({
    maxW,
    scrollerRef,
  }: {
    maxW: string;
    scrollerRef: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div
      ref={scrollerRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-none no-scrollbar px-4 sm:px-5 py-4 space-y-3"
      role="log"
      aria-live="polite"
      aria-label="Messages"
    >
      {activeChat.messages.map((msg) => {
        const isMe = msg.senderId === currentUserId;
        if (msg.isSystemAction) {
          return (
            <div key={msg.id} className="flex justify-center py-1 animate-fade-in">
              <span className="px-3.5 py-1 rounded-full bg-sand text-[11px] font-medium text-ink-soft">
                {msg.text} · {msg.timestamp}
              </span>
            </div>
          );
        }
        return (
          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-rise`} style={{ animationDelay: '50ms' }}>
            <div
              className={`${maxW} px-4 py-2.5 text-sm leading-relaxed ${
                isMe
                  ? 'bg-ink text-paper rounded-2xl rounded-br-sm shadow-sm'
                  : 'bg-card border border-line rounded-2xl rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
            <span className="mt-1 px-1 text-[10px] text-ink-soft">
              {isMe ? 'You' : msg.senderName} · {msg.timestamp}
            </span>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );

  const Composer = ({ mobile = false }: { mobile?: boolean }) => (
    <form
      onSubmit={handleSend}
      className={`shrink-0 px-3 sm:px-4 pt-3 border-t border-line bg-card flex items-center gap-2 ${
        mobile ? 'safe-pb-3' : 'pb-3'
      }`}
    >
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Write a message..."
        enterKeyHint="send"
        autoComplete="off"
        className="flex-1 h-12 min-h-12 px-4 rounded-full border border-line bg-paper text-base sm:text-sm placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth"
        aria-label="Message"
      />
      <button
        type="submit"
        disabled={!inputText.trim()}
        aria-label="Send message"
        className="w-12 h-12 min-w-12 rounded-full bg-clay hover:bg-clay-hover disabled:bg-sand disabled:text-ink-muted disabled:cursor-not-allowed text-white grid place-items-center transition-colors touch-manipulation focus-ring active:scale-95"
      >
        <Send className="w-5 h-5" aria-hidden="true" />
      </button>
    </form>
  );

  const ThreadMenu = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="relative shrink-0">
      <button
        onClick={() => setShowThreadMenu((v) => !v)}
        className="w-11 h-11 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={showThreadMenu}
      >
        <MoreVertical className="w-5 h-5" aria-hidden="true" />
      </button>

      {showThreadMenu && (
        <>
          {/* Click-away layer; Escape alone is not discoverable on touch screens. */}
          <div className="fixed inset-0 z-10" onClick={() => setShowThreadMenu(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Conversation options"
            className="absolute right-0 top-full mt-1 z-20 w-56 py-1 rounded-xl border border-line bg-card shadow-lg animate-scale-in origin-top-right"
          >
            {mobile && isSeller && activeChat.listingStatus === 'active' && (
              <button
                role="menuitem"
                onClick={() => handleStatusChange('reserved')}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
              >
                <Bookmark className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
                Reserve listing
              </button>
            )}
            {mobile && isSeller && activeChat.listingStatus !== 'sold' && (
              <button
                role="menuitem"
                onClick={() => handleStatusChange('sold')}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
              >
                <BadgeCheck className="w-4 h-4 text-moss shrink-0" aria-hidden="true" />
                Mark as sold
              </button>
            )}
            {mobile && activeChat.listingStatus === 'sold' && !activeChat.reviewCompleted && (
              <button
                role="menuitem"
                onClick={() => {
                  setShowThreadMenu(false);
                  onOpenReviewModal(activeChat);
                  setMobileChatOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
              >
                <Star className="w-4 h-4 text-clay shrink-0" aria-hidden="true" />
                Leave a review
              </button>
            )}
            {onViewListing && (
              <button
                role="menuitem"
                onClick={handleViewListing}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
              >
                <ExternalLink className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
                View listing
              </button>
            )}
            <button
              role="menuitem"
              onClick={() => { void handleCopyListingLink(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
            >
              <Link2 className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
              Copy listing link
            </button>
            <button
              role="menuitem"
              onClick={handleMarkRead}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
            >
              <CheckCheck className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
              Mark as read
            </button>
          </div>
        </>
      )}
    </div>
  );

  const ChatHeader = ({ back = false }: { back?: boolean }) => (
    <div
      className={`shrink-0 px-3 sm:px-4 pb-3 border-b border-line flex items-center justify-between gap-2 bg-card ${
        back ? 'safe-pt-header' : 'pt-3'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {back && (
          <button
            onClick={() => setMobileChatOpen(false)}
            aria-label="Back to conversations"
            className="w-11 h-11 -ml-1 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring shrink-0"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <ListingImage
          images={chatImages(activeChat.listingImage)}
          alt=""
          className="w-10 h-10 rounded-lg shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div
            id={back ? 'mobile-chat-title' : undefined}
            className="font-semibold text-sm truncate text-ink"
          >
            {activeChat.listingTitle}
          </div>
          <div className="text-xs text-ink-soft flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-ink shrink-0">{formatPrice(activeChat.listingPrice)}</span>
            <span className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded-full bg-clay/10 text-clay shrink-0">
              {activeChat.listingStatus}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!back && <StatusActions />}
        <ThreadMenu mobile={back} />
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 sm:py-6 h-full min-h-0">
      <div className="h-full min-h-0 sm:border border-line sm:rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-card">
        <div className={`md:col-span-4 md:border-r border-line flex flex-col h-full min-h-0 ${mobileChatOpen ? 'max-md:invisible' : ''}`}>
          <div className="px-5 py-4 sm:py-5 border-b border-line shrink-0">
            <h2 className="font-display text-2xl font-bold text-ink">Messages</h2>
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto overscroll-none no-scrollbar" role="list" aria-label="Conversations">
            {chats.map((chat) => {
              const active = activeChatId === chat.id;
              // The other party is whichever side is not the signed-in user, so each
              // conversation shows the opposite side's name.
              const other = chat.sellerId === currentUserId ? chat.buyerName : chat.sellerName;
              return (
                <li key={chat.id}>
                  <button
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setMobileChatOpen(true);
                    }}
                    className={`w-full text-left px-5 py-4 flex items-center gap-3 border-b border-line/60 transition-colors touch-manipulation min-h-[72px] ${
                      active ? 'md:bg-sand' : 'hover:bg-paper'
                    }`}
                    aria-current={active ? 'true' : 'false'}
                  >
                    <ListingImage
                      images={chatImages(chat.listingImage)}
                      alt=""
                      className="w-12 h-12 rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-sm truncate ${chat.unreadCount ? 'font-bold' : 'font-semibold'} text-ink`}>{other}</span>
                        <span className="text-[10px] text-ink-soft shrink-0">{chat.lastMessageTime}</span>
                      </div>
                      <div className="text-xs font-medium text-clay truncate">{chat.listingTitle}</div>
                      <p className={`text-xs truncate mt-0.5 ${chat.unreadCount ? 'text-ink' : 'text-ink-soft'}`}>{chat.lastMessage}</p>
                    </div>
                    {chat.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-clay text-white text-[10px] font-bold grid place-items-center animate-scale-in" aria-label={`${chat.unreadCount} unread messages`}>
                        {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hidden md:flex md:col-span-8 flex-col h-full min-h-0 bg-paper">
          {activeChat && (
            <>
              <ChatHeader />
              <Messages maxW="max-w-md" scrollerRef={messagesContainerRef} />
              <Composer />
            </>
          )}
        </div>
      </div>

      {mobileChatOpen && activeChat && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex flex-col md:hidden bg-paper app-height overscroll-none animate-slide-up"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-chat-title"
        >
          <ChatHeader back />
          <Messages maxW="max-w-[85%]" scrollerRef={mobileMessagesContainerRef} />
          <Composer mobile />
        </div>
      )}
    </div>
  );
};
