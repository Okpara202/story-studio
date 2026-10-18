import { Suspense } from "react";
import { connection } from "next/server";
import { getStore } from "@/server/storage";
import { getStory, getStyle, keys, NotFoundError } from "@/server/jobs";
import { sceneImageViews } from "@/server/scene-images";
import { portraitViews } from "@/server/characters";
import { parseScript } from "@/shared/script/parse";
import { fastImageProviders } from "@/server/images";
import { ButtonLink, EmptyState } from "@/components/ui";
import { StoryEditor } from "./story-editor";

export default function StoryPage({ params }: PageProps<"/stories/[id]">) {
  return (
    <Suspense fallback={<div aria-busy className="mx-auto h-96 max-w-6xl animate-pulse px-6 py-10" />}>
      <StoryLoader params={params} />
    </Suspense>
  );
}

async function StoryLoader({ params }: { params: Promise<{ id: string }> }) {
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
  const files = { store, prefix: keys.jobDir(id) };
  const [style, images, portraits] = await Promise.all([
    getStyle(store),
    sceneImageViews(files),
    portraitViews(files, parseScript(story.job.script).looks),
  ]);
  return (
    <StoryEditor
      job={story.job}
      status={story.storyStatus}
      narratorVoice={style.narratorVoice}
      artStyle={style.artStyle}
      images={images}
      portraits={portraits}
      canGenerateImages={fastImageProviders().length > 0}
    />
  );
}
