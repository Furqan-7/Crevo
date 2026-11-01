import type { ReactNode } from "react";
import "@/src/styles/reveal.css";
import ScrollReveal from "@/src/components/ScrollReveal";
import SiteInteractions from "@/src/components/SiteInteractions";

/** Marketing pages: entrance and scroll animations, menu, FAQ and forms. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ScrollReveal />
      <SiteInteractions />
      <noscript>
        <style>{"[data-scroll-reveal]{opacity:1}"}</style>
      </noscript>
    </>
  );
}
