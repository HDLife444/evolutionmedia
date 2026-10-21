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
  if (error) redirect("/?notice=sign-in-failed");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/?notice=sign-out-failed");
  (await cookies()).set(CONNECTION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
  redirect("/");
}
