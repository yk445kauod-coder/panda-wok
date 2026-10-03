import { PageSkeleton } from "@/components/ui/skeleton";
import { getAdminLocale, getT } from "@/lib/i18n/server";

/** Streaming fallback for every /admin route. */
export default async function AdminLoading() {
  const t = await getT(await getAdminLocale());
  return <PageSkeleton title={t("common.loadingAdmin")} />;
}
