"use server";

import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/admin-auth";

export async function logout(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}
