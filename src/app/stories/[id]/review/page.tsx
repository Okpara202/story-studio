import { Suspense } from "react";
import { connection } from "next/server";
import { getStore } from "@/server/storage";
import { getStory, getStyle, keys, NotFoundError } from "@/server/jobs";
import { sceneImageViews } from "@/server/scene-images";
import { fastImageProviders } from "@/server/images";
import { generationView } from "@/server/generation";
import { parseScript } from "@/shared/script/parse";
import { suggestPublishText } from "@/shared/publish";
import { ButtonLink, EmptyState } from "@/components/ui";
import { ReviewScreen } from "./review-screen";

export default function ReviewPage({ params }: PageProps<"/stories/[id]/review">) {
  return (
    <Suspense fallback={<div aria-busy className="mx-auto h-96 max-w-6xl animate-pulse px-6 py-10" />}>
      <ReviewLoader params={params} />
    </Suspense>
  );
}

async function ReviewLoader({ params }: { params: Promise<{ id: string }> }) {
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
  const [style, images, view] = await Promise.all([
    getStyle(store),
    sceneImageViews({ store, prefix: keys.jobDir(id) }),
    generationView(store, id),
  ]);
  return (
    // Remount after "Mark as downloaded" so every panel starts from the fresh server state.
    <ReviewScreen
      key={story.job.downloadedAt ?? "live"}
      job={story.job}
      status={story.storyStatus}
      initialView={view}
      images={images}
      artStyle={style.artStyle}
      canGenerateImages={fastImageProviders().length > 0}
      suggested={suggestPublishText(parseScript(story.job.script))}
    />
  );
}
