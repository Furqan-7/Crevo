import ContactUsPage from "@/src/views/ContactUsPage";
import { pageMetadata } from "@/lib/site";
import "@/src/styles/contact-us.css";

export const metadata = pageMetadata("/contact-us", "Contact Crevo", "Questions about Crevo? Send the team a note.");

export default function Page() {
  return <ContactUsPage />;
}
