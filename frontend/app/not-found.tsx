import NotFoundPage from "@/src/views/NotFoundPage";
import { pageMetadata } from "@/lib/site";
import "@/src/styles/not-found.css";
import "@/src/styles/reveal.css";
import ScrollReveal from "@/src/components/ScrollReveal";
import SiteInteractions from "@/src/components/SiteInteractions";

export const metadata = { ...pageMetadata("/404", "Page Not Found — Crevo", "This page doesn't exist. Head back to Crevo."), alternates: undefined, robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <NotFoundPage />
      <ScrollReveal />
      <SiteInteractions />
    </>
  );
}
