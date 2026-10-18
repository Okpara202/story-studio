import { Suspense } from "react";
import { connection } from "next/server";
import { getStore } from "@/server/storage";
import { getStory, NotFoundError } from "@/server/jobs";
import { generationView } from "@/server/generation";
import { ButtonLink, EmptyState } from "@/components/ui";
import { SnippetsScreen } from "./snippets-screen";

export default function SnippetsPage({ params }: PageProps<"/stories/[id]/snippets">) {
  return (
    <Suspense fallback={<div aria-busy className="mx-auto h-96 max-w-6xl animate-pulse px-6 py-10" />}>
      <SnippetsLoader params={params} />
    </Suspense>
  );
}

async function SnippetsLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const store = getStore();
  const story = await getStory(store, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) return null;
    throw err;
  });
  if (!story) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState title="Story not found" action={<ButtonLink href="/">Back to stories</ButtonLink>}>
          It may have been deleted, or the link is wrong.
        </EmptyState>
      </div>
    );
  }
  return <SnippetsScreen job={story.job} status={story.storyStatus} initialView={await generationView(store, id)} />;
}
