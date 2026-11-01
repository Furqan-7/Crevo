import { notFound } from "next/navigation";

// Any /dashboard/<unknown> path shows the workspace 404 inside the shell.
export default function Missing() {
  notFound();
}
