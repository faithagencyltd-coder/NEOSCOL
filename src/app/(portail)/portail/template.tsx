import { AnimatedPage } from "@/components/motion/animated-page";

/** Transition entre les pages (fondu + léger glissement, respecte le mouvement réduit). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <AnimatedPage>{children}</AnimatedPage>;
}
