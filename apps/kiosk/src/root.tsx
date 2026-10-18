import { CustomerDisplay } from "@/display/customer-display";
import { useSession } from "@/lib/session";
import { StaffApp } from "@/staff/staff-app";

/** Two windows from one app: the staff screen at "/", the customer screen at "/display". */
const isDisplay = window.location.pathname.startsWith("/display");

export function Root() {
  const { ready } = useSession();
  if (!ready) return null;
  return isDisplay ? <CustomerDisplay /> : <StaffApp />;
}
