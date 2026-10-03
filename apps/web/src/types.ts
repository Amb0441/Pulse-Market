export type Category = 'All' | 'Furniture' | 'Electronics' | 'Home & Garden' | 'Clothing & Kids' | 'Sports & Outdoors' | 'Books & Media' | 'Free & Giveaway' | 'Other';

export type ItemCondition = 'Brand New' | 'Like New' | 'Good' | 'Fair';

export type ItemStatus = 'active' | 'reserved' | 'sold';

/**
 * A listing as the UI consumes it: only fields the `listings` table stores are required.
 */
export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: Category;
  status: ItemStatus;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  createdAt: string;
  location: string;
  isSaved?: boolean;

  // Not yet modelled in the database.
  originalPrice?: number;
  condition?: ItemCondition;
  sellerRating?: number;
  sellerBadge?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number; // e.g. 0.4 km away (blurred)
  exactLocationNote?: string; // e.g. "Near Maple Street Park (blurred ~300m)"
  activeViewers?: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isSystemAction?: boolean;
}

export interface ChatThread {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  listingPrice: number;
  listingStatus: ItemStatus;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
  reviewCompleted?: boolean;
}

export interface Review {
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
  createdAt: string;
  itemTitle: string;
}

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    avatar: string;
    /** Free-text self description, edited in account settings. */
    bio?: string;
    neighborhood: string;
    joinedDate: string;
    lat?: number;
    lng?: number;
    
    // Not modelled in the database yet; optional so the UI can say "no reviews yet".
    rating?: number;
    reviewsCount?: number;
    }

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'message' | 'listing' | 'status' | 'system';
}
