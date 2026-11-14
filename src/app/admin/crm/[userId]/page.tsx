import { CrmCustomerPage } from "@/components/admin/pages/crm-customer";

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <CrmCustomerPage userId={userId} />;
}
