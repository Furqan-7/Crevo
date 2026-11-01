import TermsOfServicePage from "@/src/views/TermsOfServicePage";
import { pageMetadata } from "@/lib/site";
import "@/src/styles/terms-of-service.css";

export const metadata = pageMetadata("/terms-of-service", "Terms of Service — Crevo", "The terms for using Crevo.");

export default function Page() {
  return <TermsOfServicePage />;
}
