"use server";

import { redirect } from "next/navigation";
import { EMAIL_PATTERN, appOrigin, serverSupabase } from "./supabase";

// Form handlers for the auth pages. Each one redirects back with ?error= or
// ?notice= on failure (the page shows the matching message) and on to the
// workspace on success. Inputs are sent back too, so the form stays filled.

function back(path: string, params: Record<string, string>): never {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  redirect(`${path}?${query}`);
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function signUp(form: FormData) {
  const name = field(form, "name").slice(0, 60);
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  const invalid = !name ? "name" : !EMAIL_PATTERN.test(email) ? "email" : password.length < 8 ? "password" : null;
  if (invalid) back("/auth/signup", { error: invalid, name, email });

  const supabase = await serverSupabase();
  if (!supabase) back("/auth/signup", { notice: "auth-unavailable", name, email });

  const firstName = name.split(" ")[0];
  const onboarding = `/dashboard/onboarding?name=${encodeURIComponent(firstName)}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${await appOrigin()}/auth/confirm?next=${encodeURIComponent(onboarding)}`,
    },
  });
  if (error) {
    const code = error.code === "user_already_exists" ? "exists" : error.code === "weak_password" ? "password" : "failed";
    back("/auth/signup", { error: code, name, email });
  }
  // With "Confirm email" on in Supabase, there's no session until the link is clicked.
  if (!data.session) back("/auth/signin", { notice: "confirm", email });
  redirect(onboarding);
}

export async function signIn(form: FormData) {
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  const supabase = await serverSupabase();
  if (!supabase) back("/auth/signin", { notice: "auth-unavailable", email });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) back("/auth/signin", error.code === "email_not_confirmed" ? { notice: "confirm", email } : { error: "credentials", email });
  redirect("/dashboard");
}

/** Always answers the same way whether or not the email has an account, so
 *  the form can't be used to find out who has signed up. */
export async function requestPasswordReset(form: FormData) {
  const email = field(form, "email");
  if (!EMAIL_PATTERN.test(email)) back("/auth/forgot", { error: "email", email });

  const supabase = await serverSupabase();
  if (!supabase) back("/auth/forgot", { notice: "auth-unavailable", email });

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await appOrigin()}/auth/confirm?next=/auth/reset`,
  });
  back("/auth/forgot", { notice: "sent", email });
}

export async function updatePassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) back("/auth/reset", { error: "password" });

  const supabase = await serverSupabase();
  if (!supabase) back("/auth/reset", { error: "failed" });

  const { data } = await supabase.auth.getUser();
  if (!data.user) back("/auth/signin", { notice: "link-expired" });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    back("/auth/reset", { error: error.code === "same_password" ? "same" : error.code === "weak_password" ? "password" : "failed" });
  }
  redirect("/dashboard?notice=password-updated");
}
