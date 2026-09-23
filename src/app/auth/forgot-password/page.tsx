import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/customer/forgot-password-form";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(await getLocale());
  return {
    title: `${t("auth.forgot.title")} — Panda Wok`,
    description: t("auth.forgot.subtitle"),
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage() {
  const t = await getT(await getLocale());

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="font-display text-xl font-semibold text-ink-900">
        {t("auth.forgot.title")}
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-700/80">
        {t("auth.forgot.subtitle")}
      </p>
      <ForgotPasswordForm />
      <Link
        href="/auth/sign-in"
        className="mt-6 inline-flex items-center text-sm font-medium text-plum-600 hover:text-plum-700"
      >
        {t("auth.forgot.backToSignIn")}
      </Link>
    </div>
  );
}
