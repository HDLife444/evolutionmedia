"use server";

import { cookies } from "next/headers";
import { CONNECTION_COOKIE } from "@/utils/generation-server";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function signIn(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    redirect("/?notice=missing-credentials");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // Use fixed messages only. Auth error bodies can contain private inputs.
    if (error.code === "invalid_credentials") redirect("/?notice=sign-in-invalid");
    if (error.code === "email_not_confirmed") redirect("/?notice=sign-in-unconfirmed");
    if (error.status === 429) redirect("/?notice=sign-in-rate-limited");
    if (error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500) {
      redirect("/?notice=sign-in-unavailable");
    }
    redirect("/?notice=sign-in-failed");
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/?notice=sign-out-failed");
  (await cookies()).set(CONNECTION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
  redirect("/");
}
