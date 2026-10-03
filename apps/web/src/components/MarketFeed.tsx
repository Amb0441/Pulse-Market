import React, { useState, useMemo } from 'react';
import { Listing, Category } from '../types';
import { Search, MapPin, Eye, ArrowUpDown, Heart, PackageOpen, Filter, X, Loader2 } from 'lucide-react';
import { formatRelative, formatDistance, formatPrice } from '../lib/format';
import { friendlyError } from '../lib/errors';
import { ListingImage } from './ListingImage';
import { Avatar } from './Avatar';

interface MarketFeedProps {
  listings: Listing[];
  isLoading?: boolean;
  isError?: boolean;
  /** The failure behind `isError`, so the message can explain what went wrong. */
  error?: unknown;
  onRetry?: () => void;
  onOpenSellModal?: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string) => void;
  /**
   * Ids of the signed-in member's saved items; a listing row has no saved state of its own.
   */
  savedListingIds: string[];
  /** The signed-in member's id, so the heart is hidden on their own items. */
  currentUserId?: string;
  selectedRadiusKm: number;
  setSelectedRadiusKm: (r: number) => void;
  /** When the viewer has a pin, listings split into within vs outside the selected radius. */
  hasPin?: boolean;
  theme: 'dark' | 'light';
}

const CATEGORIES: Category[] = [
  'All',
  'Furniture',
  'Electronics',
  'Home & Garden',
  'Clothing & Kids',
  'Sports & Outdoors',
  'Books & Media',
  'Free & Giveaway',
  'Other',
];

const RADIUS_OPTIONS = [1, 3, 5, 10] as const;

export const MarketFeed: React.FC<MarketFeedProps> = ({
  listings,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  onOpenSellModal,
  onSelectListing,
  onToggleSave,
  savedListingIds,
  currentUserId,
  selectedRadiusKm,
  setSelectedRadiusKm,
  hasPin = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [sortBy, setSortBy] = useState<'nearest' | 'newest' | 'price-low'>('nearest');
  const [showFilters, setShowFilters] = useState(false);

  const filteredListings = useMemo(() => {
    return listings
      .filter((item) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'nearest') {
          // Unknown distance sorts last rather than pretending to be 0 km away.
          if (a.distanceKm === undefined && b.distanceKm === undefined) return 0;
          if (a.distanceKm === undefined) return 1;
          if (b.distanceKm === undefined) return -1;
          return a.distanceKm - b.distanceKm;
        }
        if (sortBy === 'price-low') return a.price - b.price;
        // Rows with no usable createdAt sort last rather than poisoning the
        // comparison with NaN, which would make the sort non-deterministic.
        const at = Date.parse(a.createdAt);
        const bt = Date.parse(b.createdAt);
        if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        return bt - at;
      });
  }, [listings, searchQuery, selectedCategory, sortBy]);

  const withinListings = useMemo(
    () =>
      hasPin
        ? filteredListings.filter(
            (item) => item.distanceKm !== undefined && item.distanceKm <= selectedRadiusKm,
          )
        : filteredListings,
    [filteredListings, hasPin, selectedRadiusKm],
  );
  const fartherListings = useMemo(
    () =>
      hasPin
        ? filteredListings.filter(
            (item) => item.distanceKm === undefined || item.distanceKm > selectedRadiusKm,
          )
        : [],
    [filteredListings, hasPin, selectedRadiusKm],
  );

  const hasActiveFilters = selectedCategory !== 'All' || searchQuery;

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-6 sm:pb-10 mobile-content-pad">
      <div className="mb-5 sm:mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-ink">Around you</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {hasPin ? (
              <>
                {withinListings.length === 0
                  ? `No items within ${selectedRadiusKm} km`
                  : `${withinListings.length} ${withinListings.length === 1 ? 'item' : 'items'} within ${selectedRadiusKm} km`}
                {fartherListings.length > 0 && (
                  <span className="text-clay ml-1">
                    · {fartherListings.length} {fartherListings.length === 1 ? 'item' : 'items'} not within {selectedRadiusKm} km
                  </span>
                )}
              </>
            ) : (
              <>
                {filteredListings.length === 0
                  ? 'No items yet'
                  : `${filteredListings.length} ${filteredListings.length === 1 ? 'item' : 'items'}`}
              </>
            )}
            {searchQuery && <span className="text-clay ml-1">· "{searchQuery}"</span>}
            {selectedCategory !== 'All' && <span className="text-clay ml-1">· {selectedCategory}</span>}
          </p>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 text-sm font-medium text-clay hover:text-clay-hover transition-colors touch-manipulation"
            aria-label="Clear all filters"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>

      <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8">
        <div className="relative">
          <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-soft" aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chairs, bikes, espresso machines..."
            className="w-full h-12 sm:h-14 pl-12 sm:pl-14 pr-12 sm:pr-14 rounded-full border border-line bg-card text-base placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth"
            aria-label="Search listings"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full text-ink-soft hover:text-clay hover:bg-sand transition-colors touch-manipulation"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter controls in a single scrollable row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap flex-nowrap -mx-4 px-4 pb-2 sm:mx-0 sm:px-0 sm:pb-0" role="group" aria-label="Filter controls" style={{ minWidth: 0 }}>
          {/* Radius selector */}
          <div className="flex items-center h-12 rounded-full border border-line bg-card p-1 shrink-0" role="group" aria-label="Distance filter">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRadiusKm(r)}
                className={`h-full px-3.5 rounded-full text-xs font-semibold transition-smooth touch-manipulation focus-ring shrink-0 ${
                  selectedRadiusKm === r ? 'bg-ink text-paper shadow-sm' : 'text-ink-soft hover:text-ink hover:bg-sand'
                }`}
                aria-pressed={selectedRadiusKm === r}
                aria-label={`${r} km radius`}
              >
                {r} km
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <label className="flex items-center gap-2 h-12 px-4 rounded-full border border-line bg-card text-ink-soft cursor-pointer shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer appearance-none"
              aria-label="Sort by"
            >
              <option value="nearest">Nearest</option>
              <option value="price-low">Lowest price</option>
              <option value="newest">Newest</option>
            </select>
          </label>

          {/* Filter/Categories button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 h-12 px-4 rounded-full border border-line bg-card text-ink-soft hover:text-ink hover:bg-sand transition-colors touch-manipulation focus-ring shrink-0"
            aria-expanded={showFilters}
            aria-controls="category-filters"
          >
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-semibold">Categories</span>
          </button>
        </div>

        {/* Category filters dropdown */}
        {showFilters && (
          <div id="category-filters" className="animate-slide-down" role="region" aria-label="Category filters">
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 h-9 px-4 rounded-full text-xs font-semibold border transition-smooth touch-manipulation focus-ring ${
                    selectedCategory === cat
                      ? 'bg-ink border-ink text-paper shadow-sm'
                      : 'bg-transparent border-line text-ink-soft hover:border-ink hover:text-ink'
                  }`}
                  aria-pressed={selectedCategory === cat}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-sm text-ink-soft">Loading listings…</p>
        </div>
      ) : isError ? (
        <div className="text-center py-20 border border-dashed border-rose/40 rounded-2xl animate-fade-in" role="alert">
          <PackageOpen className="w-12 h-12 mx-auto text-rose" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-bold text-ink">Could not load listings</h3>
          <p className="mt-1 text-sm text-ink-soft max-w-xs mx-auto">
            {/* The real cause in plain words, not a generic connection error. */}
            {error ? friendlyError(error) : 'The marketplace could not be reached. Check your connection and try again.'}
          </p>
          <button
            type="button"
            onClick={() => { onRetry?.(); }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-paper text-sm font-semibold hover:bg-clay transition-colors touch-manipulation focus-ring"
          >
            Try again
          </button>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-2xl animate-fade-in">
          <PackageOpen className="w-12 h-12 mx-auto text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-bold text-ink">
            {hasActiveFilters ? 'Nothing matches those filters' : 'No listings yet'}
          </h3>
          <p className="mt-1 text-sm text-ink-soft max-w-xs mx-auto">
            {hasActiveFilters
              ? 'Try a different search or clearing your filters.'
              : 'Nothing has been listed in this area yet. Be the first to post something.'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-clay text-white text-sm font-semibold hover:bg-clay-hover transition-colors touch-manipulation focus-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Clear filters
            </button>
          ) : onOpenSellModal ? (
            <button
              type="button"
              onClick={onOpenSellModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-clay text-white text-sm font-semibold hover:bg-clay-hover transition-colors touch-manipulation focus-ring"
            >
              Post a listing
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-10">
          {hasPin ? (
            <>
              {withinListings.length > 0 && (
                <ListingGrid
                  title={`Within ${selectedRadiusKm} km`}
                  label="Listings within range"
                  items={withinListings}
                  savedListingIds={savedListingIds}
                  currentUserId={currentUserId}
                  onSelectListing={onSelectListing}
                  onToggleSave={onToggleSave}
                  farther={false}
                />
              )}
              {fartherListings.length > 0 && (
                <ListingGrid
                  title={`Not within ${selectedRadiusKm} km`}
                  subtitle="These listings are farther than your selected radius."
                  label="Listings outside range"
                  items={fartherListings}
                  savedListingIds={savedListingIds}
                  currentUserId={currentUserId}
                  onSelectListing={onSelectListing}
                  onToggleSave={onToggleSave}
                  farther
                />
              )}
            </>
          ) : (
            <ListingGrid
              label="Marketplace listings"
              items={filteredListings}
              savedListingIds={savedListingIds}
              currentUserId={currentUserId}
              onSelectListing={onSelectListing}
              onToggleSave={onToggleSave}
              farther={false}
            />
          )}
        </div>
      )}
    </div>
  );
};

const ListingGrid: React.FC<{
  title?: string;
  subtitle?: string;
  label: string;
  items: Listing[];
  savedListingIds: string[];
  currentUserId?: string;
  onSelectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string) => void;
  farther: boolean;
}> = ({
  title,
  subtitle,
  label,
  items,
  savedListingIds,
  currentUserId,
  onSelectListing,
  onToggleSave,
  farther,
}) => (
  <section>
    {title && (
      <div className="mb-4">
        <h2 className="font-display text-lg sm:text-xl font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10" role="list" aria-label={label}>
      {items.map((item, i) => {
        const sold = item.status === 'sold';
        const itemIsSaved = savedListingIds.includes(item.id);
        return (
          <article
            key={item.id}
            onClick={() => onSelectListing(item)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectListing(item); } }}
            tabIndex={0}
            role="listitem"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            className="group cursor-pointer animate-rise hover-lift active-scale touch-manipulation"
            aria-label={`${item.title}, ${formatPrice(item.price)}${formatDistance(item.distanceKm) ? `, ${formatDistance(item.distanceKm)}` : ''}${sold ? ', sold' : ''}`}
          >
            <div className="relative aspect-4/3 rounded-xl overflow-hidden bg-sand">
              <ListingImage
                images={item.images}
                alt=""
                className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${sold ? 'grayscale opacity-70' : ''}`}
              />

              {item.sellerId !== currentUserId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onToggleSave(item.id);
                  }}
                  aria-label={itemIsSaved ? 'Remove from saved' : 'Save item'}
                  aria-pressed={itemIsSaved}
                  className={`absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center transition-smooth touch-manipulation focus-ring ${
                    itemIsSaved ? 'bg-clay text-white shadow-md' : 'bg-card/90 text-ink hover:bg-card'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${itemIsSaved ? 'fill-current' : ''}`} aria-hidden="true" />
                </button>
              )}

              {item.status !== 'active' && (
                <span
                  className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    sold ? 'bg-ink text-paper' : 'bg-mustard text-ink'
                  }`}
                  aria-label={`Status: ${item.status}`}
                >
                  {item.status}
                </span>
              )}

              {(item.activeViewers ?? 0) > 0 && item.status === 'active' && (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/95 text-[11px] font-semibold" aria-label={`${item.activeViewers} people viewing`}>
                  <Eye className="w-3 h-3 text-clay" aria-hidden="true" />
                  {item.activeViewers} {item.activeViewers === 1 ? 'viewer' : 'viewers'}
                </span>
              )}
            </div>

            <div className="pt-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 group-hover:text-clay transition-colors text-ink">
                  {item.title}
                </h3>
                <div className="shrink-0 flex items-baseline gap-1.5">
                  {item.originalPrice && (
                    <span className="text-xs text-ink-soft line-through">{formatPrice(item.originalPrice)}</span>
                  )}
                  <span className="font-display text-lg font-bold text-ink">
                    {formatPrice(item.price)}
                  </span>
                </div>
              </div>

              <p className="mt-1 text-sm text-ink-soft line-clamp-2">{item.description}</p>

              <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar
                    url={item.sellerAvatar}
                    name={item.sellerName}
                    className="w-5 h-5 rounded-full shrink-0"
                  />
                  <span className="truncate font-medium text-ink">{item.sellerName}</span>
                  {item.createdAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <time dateTime={item.createdAt} className="text-ink-muted">{formatRelative(item.createdAt)}</time>
                    </>
                  )}
                </span>
                {formatDistance(item.distanceKm) && (
                  <span className={`shrink-0 flex items-center gap-1 font-semibold ${farther ? 'text-clay' : 'text-moss'}`}>
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    {formatDistance(item.distanceKm)}
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  </section>
);