/**
 * Badge system for user profiles
 * Provides functionality to calculate and display user achievement badges
 */

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earned: boolean;
};

export type BadgeCategory = 'products' | 'tenure';

/**
 * Calculate product-based badges
 */
export function getProductBadges(productCount: number): Badge[] {
  const badges: Badge[] = [
    {
      id: 'product_bronze',
      name: 'Bronze Contributor',
      description: 'Added 1+ products',
      icon: 'medal',
      color: '#CD7F32',
      earned: productCount >= 1,
    },
    {
      id: 'product_silver',
      name: 'Silver Contributor',
      description: 'Added 5+ products',
      icon: 'medal',
      color: '#C0C0C0',
      earned: productCount >= 5,
    },
    {
      id: 'product_gold',
      name: 'Gold Contributor',
      description: 'Added 10+ products',
      icon: 'medal',
      color: '#FFD700',
      earned: productCount >= 10,
    },
    {
      id: 'product_platinum',
      name: 'Platinum Contributor',
      description: 'Added 25+ products',
      icon: 'medal',
      color: '#E5E4E2',
      earned: productCount >= 25,
    },
    {
      id: 'product_diamond',
      name: 'Diamond Contributor',
      description: 'Added 50+ products',
      icon: 'diamond-stone',
      color: '#B9F2FF',
      earned: productCount >= 50,
    },
  ];

  return badges;
}

/**
 * Calculate tenure-based badges
 */
export function getTenureBadges(createdAt?: string | Date): Badge[] {
  if (!createdAt) return [];

  const accountDate = new Date(createdAt);
  const now = new Date();
  const yearsSinceCreation = (now.getTime() - accountDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

  const badges: Badge[] = [
    {
      id: 'tenure_1',
      name: 'One Year',
      description: 'Member for 1+ year',
      icon: 'calendar-star',
      color: '#4CAF50',
      earned: yearsSinceCreation >= 1,
    },
    {
      id: 'tenure_2',
      name: 'Two Years',
      description: 'Member for 2+ years',
      icon: 'calendar-star',
      color: '#2196F3',
      earned: yearsSinceCreation >= 2,
    },
    {
      id: 'tenure_3',
      name: 'Three Years',
      description: 'Member for 3+ years',
      icon: 'calendar-star',
      color: '#9C27B0',
      earned: yearsSinceCreation >= 3,
    },
    {
      id: 'tenure_5',
      name: 'Five Years',
      description: 'Member for 5+ years',
      icon: 'calendar-star',
      color: '#FF9800',
      earned: yearsSinceCreation >= 5,
    },
  ];

  return badges;
}

/**
 * Get all earned badges for a user
 */
export function getEarnedBadges(productCount: number, createdAt?: string | Date): Badge[] {
  const productBadges = getProductBadges(productCount).filter((b) => b.earned);
  const tenureBadges = getTenureBadges(createdAt).filter((b) => b.earned);

  return [...productBadges, ...tenureBadges];
}

/**
 * Get all badges (earned and unearned) for a user
 */
export function getAllBadges(productCount: number, createdAt?: string | Date): Badge[] {
  const productBadges = getProductBadges(productCount);
  const tenureBadges = getTenureBadges(createdAt);

  return [...productBadges, ...tenureBadges];
}

/**
 * Get the highest product badge earned
 */
export function getHighestProductBadge(productCount: number): Badge | null {
  const productBadges = getProductBadges(productCount).filter((b) => b.earned);
  return productBadges.length > 0 ? productBadges[productBadges.length - 1] : null;
}

/**
 * Get the highest tenure badge earned
 */
export function getHighestTenureBadge(createdAt?: string | Date): Badge | null {
  const tenureBadges = getTenureBadges(createdAt).filter((b) => b.earned);
  return tenureBadges.length > 0 ? tenureBadges[tenureBadges.length - 1] : null;
}
