"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createReelProject, startReelGeneration, uploadReelPhoto } from "@/lib/reel-api";

const MIN_PHOTOS = 5;

export default function NewReelPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const images = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => [...prev, ...images]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !location.trim()) {
      setError("Please enter a property title and location.");
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setError(`Please upload at least ${MIN_PHOTOS} photos (you have ${photos.length}).`);
      return;
    }

    setSubmitting(true);
    try {
      const projectId = crypto.randomUUID();

      setProgress(`Uploading photos (0/${photos.length})`);
      const photoPaths: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const path = await uploadReelPhoto(projectId, photos[i], i);
        photoPaths.push(path);
        setProgress(`Uploading photos (${i + 1}/${photos.length})`);
      }

      setProgress("Saving property details");
      await createReelProject({
        projectId,
        title: title.trim(),
        location: location.trim(),
        agentName: agentName.trim() || undefined,
        agentPhone: agentPhone.trim() || undefined,
        photoPaths,
      });

      setProgress("Starting video generation");
      await startReelGeneration(projectId);

      router.push(`/reel/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
      setProgress("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <p className="text-sm font-medium text-accent">Generate from photos</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Upload your property photos
      </h1>
      <p className="mt-2 text-muted">
        No video needed — upload {MIN_PHOTOS}+ photos and we&apos;ll generate a
        cinematic property video automatically.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragActive ? "border-accent bg-accent/5" : "border-border bg-surface"
          }`}
        >
          <p className="font-medium">Drag & drop photos here, or click to browse</p>
          <p className="mt-1 text-sm text-muted">
            {photos.length} of {MIN_PHOTOS}+ photos selected
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photos.map((photo, i) => (
              <div key={`${photo.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-control bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(photo)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Property title (e.g. Executive 5-Bedroom House)"
            className="w-full rounded-control border border-border bg-background px-4 py-3"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. Adjringanor, Accra)"
            className="w-full rounded-control border border-border bg-background px-4 py-3"
          />
          <div className="grid grid-cols-2 gap-4">
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent name (optional)"
              className="w-full rounded-control border border-border bg-background px-4 py-3"
            />
            <input
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              placeholder="Agent phone (optional)"
              className="w-full rounded-control border border-border bg-background px-4 py-3"
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground disabled:opacity-60"
        >
          {submitting ? progress || "Working..." : "Generate video"}
        </button>
      </form>
    </main>
  );
}
