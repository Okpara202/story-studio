import type { Metadata } from "next";
import { UsageDashboard } from "./usage-dashboard";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return <UsageDashboard />;
}
