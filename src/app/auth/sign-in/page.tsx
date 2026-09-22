import { safeNext } from "@/lib/utils/redirect";
import { SignInForm } from "@/components/customer/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignInForm next={safeNext(next, "/account")} />;
}
