import { textBlocks } from "@/features/platform/brand";

/** Texte saisi par le Super Admin, affiché sans HTML (intertitres « ## », paragraphes). */
export function LegalText({ text }: { text: string }) {
  return (
    <div className="grid gap-3 text-sm leading-relaxed">
      {textBlocks(text).map((b, i) =>
        b.kind === "h2" ? (
          <h2 key={i} className="mt-3 text-lg font-bold">
            {b.text}
          </h2>
        ) : (
          <p key={i} className="whitespace-pre-line text-foreground/90">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
