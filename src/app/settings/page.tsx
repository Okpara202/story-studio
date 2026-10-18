import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getStore } from "@/server/storage";
import { getStyle } from "@/server/jobs";
import { StyleForm } from "./style-form";

export const metadata: Metadata = { title: "Channel style" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div aria-busy className="mx-auto h-96 max-w-3xl animate-pulse px-6 py-10" />}>
      <StyleLoader />
    </Suspense>
  );
}

async function StyleLoader() {
  await connection();
  const store = getStore();
  const style = await getStyle(store);
  const musicUrl = style.music.file ? await store.presignGet(style.music.file) : null;
  return <StyleForm saved={style} musicUrl={musicUrl} />;
}
