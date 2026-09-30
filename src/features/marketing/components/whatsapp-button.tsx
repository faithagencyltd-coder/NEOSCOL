import { whatsappLink } from "@/features/platform/brand";
import { cn } from "@/lib/utils/cn";

/** Bouton WhatsApp flottant : numéro, texte, message et position réglés par le Super Admin. */
export function WhatsAppButton({ number, label, message, position }: { number: string | null; label: string; message: string; position: "right" | "left" }) {
  if (!number) return null;
  const href = `${whatsappLink(number)}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-button"
      className={cn(
        "group fixed bottom-5 z-50 flex items-center gap-2 rounded-full bg-[#25d366] py-3 pl-3 pr-4 text-sm font-semibold text-[#073b1c] shadow-[0_12px_30px_-8px_rgba(7,59,28,0.55)] transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4",
        position === "left" ? "left-5" : "right-5",
      )}
    >
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <path
          fill="currentColor"
          d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.1c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.7 12.7-12.7S23 3 16 3Zm0 23.2c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-4.1 1.2 1.2-4-.3-.4a10.5 10.5 0 1 1 9 4.9Zm5.8-7.8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.6 8.6 0 0 1-4.3-3.7c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.5l-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3.1 2.1 3.2 5.1 4.5c1.9.8 2.6.9 3.6.7.6-.1 1.9-.8 2.1-1.5s.3-1.3.2-1.5-.2-.2-.5-.3Z"
        />
      </svg>
      <span className="max-sm:sr-only">{label}</span>
    </a>
  );
}
