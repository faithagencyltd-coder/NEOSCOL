import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { whatsappLink } from "@/features/platform/brand";
import type { SiteSettings } from "@/lib/site-settings";

/** Coordonnées de NeoScool réglées par le Super Admin (rien n'est affiché s'il n'y en a pas). */
export function SiteContacts({ site, className }: { site: SiteSettings; className?: string }) {
  const items = [
    site.whatsapp ? { icon: MessageCircle, label: "WhatsApp", value: `+${site.whatsapp}`, href: whatsappLink(site.whatsapp) } : null,
    site.contact_email ? { icon: Mail, label: "E-mail", value: site.contact_email, href: `mailto:${site.contact_email}` } : null,
    site.contact_phone ? { icon: Phone, label: "Téléphone", value: site.contact_phone, href: `tel:${site.contact_phone.replace(/[^+0-9]/g, "")}` } : null,
    site.address ? { icon: MapPin, label: "Adresse", value: site.address, href: null } : null,
    site.support_hours ? { icon: Clock, label: "Horaires", value: site.support_hours, href: null } : null,
  ].filter((x) => x !== null);
  if (!items.length) return null;
  return (
    <ul className={className} data-testid="site-contacts">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2">
          <item.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="sr-only">{item.label} : </span>
            {item.href ? (
              <a href={item.href} className="font-medium hover:underline" {...(item.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {item.value}
              </a>
            ) : (
              item.value
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
