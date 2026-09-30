import React, { useState } from 'react';
import { Listing, UserProfile, Review, ItemStatus } from '../types';
import { Package, Heart, Star, Trash2, Eye, Clock, Settings, Plus, MapPin } from 'lucide-react';
import { formatRelative, formatDistance, formatPrice, formatYear } from '../lib/format';
import { ListingImage } from './ListingImage';

interface DashboardProps {
    user: UserProfile;
    /** The public feed, used for the "Saved" tab. */
    listings: Listing[];
    /**
     * The user's own listings, from `GET /api/me/listings`, kept separate from the radius-limited feed.
     */
    myListings: Listing[];
    savedListingIds: string[];
  /**
   * The saved items themselves, from `GET /api/favorites`; a saved item is often not in the feed.
   */
  savedRows: Listing[];
  reviews: Review[];
  onUpdateStatus: (id: string, status: ItemStatus) => void;
  onDeleteListing: (id: string) => void;
  /** Saves or unsaves an item, driven by the server-backed saved set. */
  onToggleSave: (listingId: string) => void;
  onSelectListing: (listing: Listing) => void;
  /** Opens account settings, where name, photo and bio are edited. */
  onOpenSettings: () => void;
  /** Opens the sell form, used by the empty state on the listings tab. */
  onOpenSellModal?: () => void;
  theme: 'dark' | 'light';
}

type Tab = 'listings' | 'saved' | 'reviews';

/** Profile entries for the help/legal row at the bottom of the page. */
const HELP_LINKS: { href: string; label: string }[] = [
  { href: '/faq', label: 'FAQ' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
];

const STATUS_STYLE: Record<ItemStatus, string> = {
  active: 'bg-moss text-white',
  reserved: 'bg-mustard text-ink',
  sold: 'bg-ink text-paper',
};

const Empty: React.FC<{ Icon: React.ElementType; title: string; text: string; action?: React.ReactNode }> = ({ Icon, title, text, action }) => (
  <div className="py-16 text-center bg-card rounded-2xl animate-fade-in">
    <div className="w-16 h-16 mx-auto rounded-2xl bg-sand grid place-items-center mb-4">
      <Icon className="w-8 h-8 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
    </div>
    <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
    <p className="mt-1 text-sm text-ink-soft max-w-xs mx-auto">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const StatCard: React.FC<{ label: string; value: string; icon: React.ElementType; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="px-5 py-5">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} aria-hidden="true" />
      </div>
    </div>
    <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</dt>
    <dd className="mt-1 font-display text-3xl font-bold text-ink">{value}</dd>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  listings,
  myListings,
  savedListingIds,
  savedRows,
  reviews,
  onUpdateStatus,
  onDeleteListing,
  onToggleSave,
  onSelectListing,
  onOpenSettings,
  onOpenSellModal,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  // Both arrive from the server already scoped to this account; the feed is not
  // filtered here, because it is radius-limited and hides sold items.
  /**
   * Saved items as the rows the server returned; the feed cannot back this list.
   */
  const savedListings = savedRows;
  const myReviews = reviews.filter((r) => r.targetUserId === user.id);

  // Derived only from rows the user owns, so an account that has sold nothing
  // shows zeros rather than placeholder figures.
  const totalSolds = myListings.filter((l) => l.status === 'sold').length;
  const totalEarnings = myListings
    .filter((l) => l.status === 'sold')
    .reduce((acc, l) => acc + l.price, 0);
  const totalActive = myListings.filter((l) => l.status === 'active').length;
  const totalSaves = savedListings.length;

  const stats = [
    { label: 'Active', value: totalActive.toString(), icon: Eye, color: 'var(--color-clay)' },
    { label: 'Items sold', value: totalSolds.toString(), icon: Package, color: 'var(--color-moss)' },
    { label: 'Earned', value: formatPrice(totalEarnings), icon: Star, color: 'var(--color-mustard)' },
    { label: 'Saves', value: totalSaves.toString(), icon: Heart, color: 'var(--color-rose)' },
  ];

  const tabs: { id: Tab; label: string; count: number; Icon: React.ElementType }[] = [
    { id: 'listings', label: 'My listings', count: myListings.length, Icon: Package },
    { id: 'saved', label: 'Saved', count: savedListings.length, Icon: Heart },
    { id: 'reviews', label: 'Reviews', count: myReviews.length, Icon: Star },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 md:pb-10 no-scrollbar">
      <header className="flex items-start gap-5 mb-8 animate-rise p-5 sm:p-6 bg-card rounded-2xl shadow-sm">
        <div className="relative">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-2 ring-ink ring-offset-4 ring-offset-paper"
            />
          ) : (
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-sand grid place-items-center font-display text-3xl font-bold text-ink-soft ring-2 ring-ink ring-offset-4 ring-offset-paper"
              aria-hidden="true"
            >
              {user.name.charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink truncate">{user.name}</h1>
          </div>
          <p className="mt-1.5 text-sm text-ink-soft flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-clay flex-shrink-0" aria-hidden="true" />
            {user.neighborhood || 'Location not set'}
            {formatYear(user.joinedDate) && <> · Member since {formatYear(user.joinedDate)}</>}
          </p>
          {user.rating !== undefined && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <Star className="w-4 h-4 fill-mustard text-mustard" aria-hidden="true" />
              <span className="text-ink">{user.rating}</span>
              <span className="font-normal text-ink-soft">({user.reviewsCount ?? 0} reviews)</span>
            </p>
          )}
          {user.rating === undefined && (
            <p className="mt-1.5 text-sm text-ink-soft">No reviews yet.</p>
          )}
          {user.bio && (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft whitespace-pre-line">
              {user.bio}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full grid place-items-center text-ink-soft hover:text-clay hover:bg-sand transition-colors touch-manipulation focus-ring"
            aria-label="Settings"
            title="Account settings"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <dl className="mt-2 grid grid-cols-2 lg:grid-cols-4 bg-card rounded-xl divide-line max-lg:divide-y lg:divide-x overflow-hidden animate-rise" style={{ animationDelay: '100ms' }} role="list" aria-label="Account statistics">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} />
        ))}
      </dl>

      <div className="mt-8 border-b border-line" role="tablist" aria-label="Dashboard sections">
        <nav className="flex gap-6 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Dashboard tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              role="tab"
              aria-selected={activeTab === t.id}
              aria-controls={`${t.id}-panel`}
              id={`${t.id}-tab`}
              className={`relative pb-3 text-sm font-semibold whitespace-nowrap transition-colors touch-manipulation ${
                activeTab === t.id ? 'text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <t.Icon className={`w-4 h-4 ${activeTab === t.id ? 'stroke-[2.5]' : 'stroke-2'}`} aria-hidden="true" />
                {t.label}
                <span className="text-ink-soft font-normal">{t.count}</span>
              </span>
              <span
                className={`absolute inset-x-0 -bottom-px h-0.5 bg-clay transition-transform origin-center ${activeTab === t.id ? 'scale-x-100' : 'scale-x-0'}`}
                aria-hidden="true"
              />
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6" role="tabpanel" aria-labelledby={`${activeTab}-tab`} id={`${activeTab}-panel`}>
        {activeTab === 'listings' && (
          <div className="animate-fade-in">
            {myListings.length === 0 ? (
              <Empty
                Icon={Package}
                title="Nothing posted yet"
                text="Tap Sell to list your first item and start earning."
                action={
                  <button
                    onClick={onOpenSellModal}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-clay text-white font-semibold text-sm hover:bg-clay-hover transition-colors touch-manipulation focus-ring"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Create listing
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" role="list" aria-label="Your listings">
                {myListings.map((item) => (
                  <article key={item.id} className="group bg-card rounded-2xl overflow-hidden hover-lift active-scale transition-smooth shadow-sm" role="listitem">
                    <div className="relative aspect-4/3 rounded-t-xl overflow-hidden bg-sand cursor-pointer" onClick={() => onSelectListing(item)}>
                      <ListingImage
                        images={item.images}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[item.status]}`} aria-label={`Status: ${item.status}`}>
                        {item.status}
                      </span>
                      <span
                        className={`absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/95 text-[11px] font-semibold ${item.createdAt ? '' : 'hidden'}`}
                        aria-label={item.createdAt ? `Listed ${item.createdAt}` : undefined}
                      >
                        <Clock className="w-3 h-3 text-clay" aria-hidden="true" />
                        {item.createdAt ? formatRelative(item.createdAt) : ''}
                      </span>
                    </div>

                    <div className="p-4 bg-card/50">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-semibold text-[15px] cursor-pointer hover:text-clay transition-colors line-clamp-1 text-ink" onClick={() => onSelectListing(item)}>
                          {item.title}
                        </h3>
                        <span className="font-display text-lg font-bold text-ink">{formatPrice(item.price)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <select
                          value={item.status}
                          onChange={(e) => onUpdateStatus(item.id, e.target.value as ItemStatus)}
                          className="flex-1 h-9 px-3 rounded-full border border-line bg-paper text-xs font-semibold cursor-pointer focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth appearance-none"
                          aria-label={`Change status for ${item.title}`}
                        >
                          <option value="active">Active</option>
                          <option value="reserved">Reserved</option>
                          <option value="sold">Sold</option>
                        </select>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this listing?')) onDeleteListing(item.id);
                          }}
                          title="Delete listing"
                          className="w-9 h-9 rounded-full grid place-items-center text-ink-soft hover:text-rose hover:bg-rose-light transition-colors touch-manipulation focus-ring"
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="animate-fade-in">
            {savedListings.length === 0 ? (
              <Empty
                Icon={Heart}
                title="No saved items"
                text="Tap the heart on any listing to keep it here for later."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" role="list" aria-label="Saved listings">
                {savedListings.map((item) => (
                  <article key={item.id} className="group relative cursor-pointer hover-lift active-scale touch-manipulation" role="listitem" onClick={() => onSelectListing(item)}>
                    <div className="aspect-4/3 rounded-xl overflow-hidden bg-sand">
                      <ListingImage
                        images={item.images}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {/* Sold and reserved items stay visible here rather than being filtered out. */}
                      {item.status !== 'active' && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-ink text-paper">
                          {item.status}
                        </span>
                      )}
                      {/* Unsave from the list itself, without reopening the item. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onToggleSave(item.id);
                        }}
                        aria-label={`Remove ${item.title} from saved`}
                        aria-pressed
                        className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center bg-clay text-white shadow-md transition-smooth touch-manipulation focus-ring"
                      >
                        <Heart className="w-4 h-4 fill-current" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="pt-3 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[15px] truncate group-hover:text-clay transition-colors text-ink">{item.title}</h3>
                        <p className="text-xs text-ink-soft mt-0.5">
                          {item.category}{formatDistance(item.distanceKm) ? ` · ${formatDistance(item.distanceKm)}` : ''}
                        </p>
                      </div>
                      <span className="font-display text-lg font-bold text-ink shrink-0">{formatPrice(item.price)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="animate-fade-in">
            {myReviews.length === 0 ? (
              <Empty
                Icon={Star}
                title="No reviews yet"
                text="Finish a handover to receive your first review."
              />
            ) : (
              <ul className="divide-y divide-line rounded-xl bg-card overflow-hidden" role="list" aria-label="Your reviews">
                {myReviews.map((rev) => (
                  <li key={rev.id} className="py-5 px-4 flex gap-4 hover:bg-paper/50 transition-colors">
                    <img
                      src={rev.reviewerAvatar}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-ink">{rev.reviewerName}</div>
                        <div className="flex gap-0.5" aria-label={`${rev.rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`w-3.5 h-3.5 ${n <= rev.rating ? 'fill-mustard text-mustard' : 'text-line'}`}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">{rev.itemTitle} · {formatRelative(rev.createdAt)}</div>
                      <p className="mt-2 text-sm leading-relaxed text-ink">{rev.comment}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <footer className="mt-10 pt-6 border-t border-line">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Help & legal</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {HELP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-4 py-2 rounded-full border border-line bg-card text-sm font-semibold text-ink-soft hover:text-clay hover:border-clay transition-colors touch-manipulation focus-ring"
            >
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
};