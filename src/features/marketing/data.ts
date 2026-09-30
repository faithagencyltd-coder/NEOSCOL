import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { publicEnv } from "@/lib/env";
import { SITE_SETTINGS_TAG } from "@/lib/site-settings";
import type { Database } from "@/types/database";

export type SiteCountry = {
  code: string;
  name: string;
  name_en: string | null;
  currency: string;
  languages: string[];
  timezone: string;
  date_format: string;
  grading_scale: string | null;
  school_periods: string | null;
  availability: "configurable" | "preparing" | "available";
  education_context: string | null;
  education_context_en: string | null;
  academic_structure: string | null;
  academic_structure_en: string | null;
  marketing_text: string | null;
  marketing_text_en: string | null;
  institutional_systems: { name: string; description: string | null }[];
};

export type SiteContent = {
  settings: {
    slogan: string | null;
    slogan_en: string | null;
    seo_description: string | null;
    seo_description_en: string | null;
    whatsapp: string | null;
    whatsapp_message: string | null;
    whatsapp_label: string | null;
    whatsapp_position: "right" | "left";
    home_sections: Record<string, boolean>;
  };
  social_links: { network: string; label: string; url: string }[];
  countries: SiteCountry[];
  videos: { id: string; topic: string; title: string; title_en: string | null; description: string | null; video_url: string; poster_url: string | null }[];
  testimonials: { author_name: string; author_role: string | null; organization: string | null; quote: string; photo_url: string | null }[];
};

const EMPTY: SiteContent = {
  settings: {
    slogan: null,
    slogan_en: null,
    seo_description: null,
    seo_description_en: null,
    whatsapp: null,
    whatsapp_message: null,
    whatsapp_label: null,
    whatsapp_position: "right",
    home_sections: {},
  },
  social_links: [],
  countries: [],
  videos: [],
  testimonials: [],
};

/** Contenu public du site (réglé par le Super Admin), en cache et rafraîchi à chaque modification. */
export const getSiteContent = unstable_cache(
  async (): Promise<SiteContent> => {
    if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return EMPTY;
    try {
      const client = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
      const { data } = await client.rpc("site_public_content");
      if (!data) return EMPTY;
      const c = data as unknown as SiteContent;
      return { ...EMPTY, ...c, settings: { ...EMPTY.settings, ...(c.settings ?? {}), home_sections: c.settings?.home_sections ?? {} } };
    } catch {
      return EMPTY;
    }
  },
  ["site-public-content"],
  { tags: [SITE_SETTINGS_TAG], revalidate: 600 },
);

/** Section de l'accueil affichée ? (toutes le sont par défaut ; le Super Admin peut en masquer). */
export const sectionOn = (content: SiteContent, key: string) => content.settings.home_sections[key] !== false;
