import { DebtorPortal } from "@/components/debtor-portal";
import { loadAccountContext } from "@/lib/account/load";

export const runtime = "nodejs";
// Always render the freshest persisted account (no static caching).
export const dynamic = "force-dynamic";

const ACCOUNT_ID = "acc_standard_001";

export default async function PortalPage() {
  const account = await loadAccountContext(ACCOUNT_ID);
  return <DebtorPortal initialAccount={account} />;
}
