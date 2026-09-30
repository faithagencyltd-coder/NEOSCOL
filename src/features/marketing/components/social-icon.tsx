import { AtSign, Globe, Send } from "lucide-react";

/** Icône d'un réseau social (formes simples, sans logo de marque déposé). */
export function SocialIcon({ network, className }: { network: string; className?: string }) {
  const letters: Record<string, string> = { facebook: "f", instagram: "IG", tiktok: "TT", youtube: "▶", linkedin: "in", x: "X", whatsapp: "WA" };
  if (network === "telegram") return <Send className={className} aria-hidden />;
  if (network === "other") return <Globe className={className} aria-hidden />;
  if (letters[network]) {
    return (
      <span className={className} aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.8rem", lineHeight: 1 }}>
        {letters[network]}
      </span>
    );
  }
  return <AtSign className={className} aria-hidden />;
}
