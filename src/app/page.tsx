import { Suspense } from "react";
import { connection } from "next/server";
import { getStore } from "@/server/storage";
import { listStories } from "@/server/jobs";
import { Dashboard, DashboardSkeleton } from "./dashboard";

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <StoriesLoader />
    </Suspense>
  );
}

async function StoriesLoader() {
  await connection();
  const store = getStore();
  return <Dashboard stories={await listStories(store)} storageKind={store.kind} />;
}
