"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getReelStatus, type ReelStatus } from "@/lib/reel-api";

const STATUS_LABELS: Record<ReelStatus["status"], string> = {
  pending: "Preparing your photos...",
  analyzing: "Analyzing your photos...",
  prompting: "Writing the story for your video...",
  generating: "Generating cinematic clips...",
  assembling: "Assembling your final video...",
  ready: "Done",
  failed: "Something went wrong",
};

const POLL_INTERVAL_MS = 4000;

export default function ReelStatusPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [status, setStatus] = useState<ReelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const data = await getReelStatus(projectId);
        if (cancelled) return;
        setStatus(data);
        setError(null);
        if (data.status !== "ready" && data.status !== "failed") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load status");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId]);

  if (error && !status) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-10 text-center">
        <p className="text-danger">{error}</p>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-10 text-center">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  if (status.status === "ready" && status.finalVideoUrl) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-10">
        <div className="mx-auto mb-6 aspect-video w-full overflow-hidden rounded-card bg-black">
          <video
            src={status.finalVideoUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{status.title}</h1>
        <p className="mt-1 text-muted">{status.location}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={status.finalVideoUrl}
            download
            className="flex flex-1 items-center justify-center rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground"
          >
            Download video
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="flex flex-1 items-center justify-center rounded-control border border-border px-5 py-3.5 text-base font-semibold"
          >
            Copy share link
          </button>
        </div>

        <Link
          href="/reel/new"
          className="mt-6 block text-center text-sm font-medium text-accent"
        >
          Create another video
        </Link>
      </main>
    );
  }

  if (status.status === "failed") {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-danger">
          {status.errorMessage || "Video generation failed. Please try again."}
        </p>
        <Link
          href="/reel/new"
          className="mt-6 inline-block rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground"
        >
          Try again
        </Link>
      </main>
    );
  }

  const readyClips = status.clips.filter((c) => c.status === "ready").length;
  const totalClips = status.clips.length;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-accent" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {STATUS_LABELS[status.status]}
      </h1>
      {status.status === "generating" && totalClips > 0 && (
        <p className="mt-2 text-muted">
          {readyClips}/{totalClips} clips complete
        </p>
      )}
      <p className="mt-2 text-sm text-muted">This usually takes a few minutes.</p>
    </main>
  );
}
