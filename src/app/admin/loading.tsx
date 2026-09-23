import { PageSkeleton } from "@/components/ui/skeleton";

/** Streaming fallback for every /admin route. */
export default function AdminLoading() {
  return <PageSkeleton title="Loading admin data" />;
}
