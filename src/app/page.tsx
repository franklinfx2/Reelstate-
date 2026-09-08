import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-accent">Reelstate</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Turn every property into
        <br />
        professional marketing content.
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted">
        Upload a raw phone video and a few photos — get a polished vertical
        video, ready-to-post captions, and a shareable listing page with your
        WhatsApp on it.
      </p>
      <Link
        href="/new"
        className="mt-8 rounded-control bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground"
      >
        Create a listing
      </Link>
    </main>
  );
}
