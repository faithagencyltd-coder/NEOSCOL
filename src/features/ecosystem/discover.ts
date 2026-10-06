/** Discover : types et chemins partagés (pages publiques, portail). */
export type DiscoverCard = {
  slug: string;
  name: string;
  type: string;
  country: string;
  city: string | null;
  tagline: string | null;
  verified: boolean;
  featured: boolean;
  has_logo: boolean;
  cover_file_id: string | null;
  programs: { name: string; description?: string | null }[];
  code: string;
  total: number;
};

export type DiscoverProfile = {
  id: string;
  slug: string;
  name: string;
  code: string;
  type: string;
  country: string;
  city: string | null;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socials: Record<string, string>;
  admission: string | null;
  enrollment_period: string | null;
  start_date: string | null;
  extra: string | null;
  programs: { name: string; description?: string | null }[];
  cover_file_id: string | null;
  gallery: string[];
  translations: { en?: { tagline?: string; description?: string; admission?: string } };
  enrollment_url: string | null;
  verified: boolean;
  updated_at: string;
  has_logo: boolean;
  leads_open: boolean;
  campaigns: { id: string; title: string; description: string | null; objective: string; target: string | null; starts_on: string | null; ends_on: string | null; media: string[]; destination_url: string | null }[];
};

export const mediaUrl = (id: string) => `/decouvrir/media/${id}`;
export const logoUrl = (code: string) => `/acces/${code}/logo`;
export const LEAD_SOURCE_PARAMS = ["discover", "profile", "campaign", "qr", "facebook", "instagram", "tiktok", "whatsapp", "link", "other"] as const;
export const sourceOf = (value: string | undefined, fallback: string) => ((LEAD_SOURCE_PARAMS as readonly string[]).includes(value ?? "") ? value! : fallback);

export type OpportunityAuthor = { kind: "organization" | "individual"; name: string; verified: boolean; profile_slug?: string | null };
export type OpportunityCard = {
  id: string;
  category: string;
  category_label: string;
  kind: string;
  title: string;
  excerpt: string;
  country: string;
  city: string | null;
  subject: string | null;
  level: string | null;
  compensation: string | null;
  contract: string | null;
  published_at: string;
  expires_at: string;
  featured: boolean;
  author: OpportunityAuthor;
  total: number;
};
export type OpportunityDetail = Omit<OpportunityCard, "excerpt" | "featured" | "total"> & {
  description: string;
  location: string | null;
  schedule: string | null;
  starts_on: string | null;
  mine: boolean;
  favorite: boolean;
  my_application: { id: string; status: string } | null;
};
