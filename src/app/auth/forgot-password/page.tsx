import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/customer/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — Panda Wok",
  description: "Request a password reset for your Panda Wok account by phone or email.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="font-display text-xl font-semibold text-ink-900">
        Reset your password
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-700/80">
        Enter your phone number or email. If you signed up with an email, we
        will send you a reset link. Phone-first accounts are verified by the
        kitchen directly so no one can reset your account.

      </p>
      <ForgotPasswordForm />
      <Link
        href="/auth/sign-in"
        className="mt-6 inline-flex items-center text-sm font-medium text-plum-600 hover:text-plum-700"
      >
        Back to sign in
      </Link>
    </div>
  );
}