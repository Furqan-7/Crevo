import HomePage from "@/src/views/HomePage";
import { pageMetadata } from "@/lib/site";
import "@/src/styles/home.css";
import StepHighlight from "@/src/components/StepHighlight";

export const metadata = pageMetadata("/", "Crevo — The AI Operating System for Creators", "Crevo brings a creator’s inbox, brand deals, content and schedule into one place, and uses AI to do the busywork so creators can spend more time creating.");

export default function Page() {
  return (
    <>
      <HomePage />
      <StepHighlight />
    </>
  );
}
