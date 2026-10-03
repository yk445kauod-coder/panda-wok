import { safeNext } from "@/lib/utils/redirect";
import { SignUpForm } from "@/components/customer/sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignUpForm next={safeNext(next, "/account")} />;
}
