import PrivacyPolicyPage from "@/src/views/PrivacyPolicyPage";
import { pageMetadata } from "@/lib/site";
import "@/src/styles/privacy-policy.css";

export const metadata = pageMetadata("/privacy-policy", "Privacy Policy — Crevo", "How Crevo collects, uses and protects your data.");

export default function Page() {
  return <PrivacyPolicyPage />;
}
