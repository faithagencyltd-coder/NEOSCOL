import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export const SITE_SETTINGS_TAG = "site-settings";

export type SiteSettings = {
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  address: string | null;
  support_hours: string | null;
  faq: { q: string; a: string }[];
  terms: string | null;
  privacy: string | null;
  terms_updated_at: string | null;
  privacy_updated_at: string | null;
  primary_color: string | null;
  logo_path: string | null;
  logo_url: string | null;
};

const EMPTY: SiteSettings = {
  contact_email: null,
  contact_phone: null,
  whatsapp: null,
  address: null,
  support_hours: null,
  faq: [],
  terms: null,
  privacy: null,
  terms_updated_at: null,
  privacy_updated_at: null,
  primary_color: null,
  logo_path: null,
  logo_url: null,
};

/**
 * Textes, coordonnées et image de marque réglés par le Super Admin (lecture
 * publique, sans cookie, mise en cache ; rafraîchis dès leur modification).
 */
export const getSiteSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return EMPTY;
    try {
      const client = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
      const { data } = await client.rpc("site_settings");
      if (!data) return EMPTY;
      const s = data as unknown as Omit<SiteSettings, "logo_url">;
      const logoUrl = s.logo_path ? client.storage.from("platform-assets").getPublicUrl(s.logo_path).data.publicUrl : null;
      return { ...EMPTY, ...s, faq: Array.isArray(s.faq) ? s.faq : [], logo_url: logoUrl };
    } catch {
      return EMPTY;
    }
  },
  ["site-settings"],
  { tags: [SITE_SETTINGS_TAG], revalidate: 600 },
);
