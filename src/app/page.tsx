import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-accent">Reelstate</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Turn your property photos into
        <br />
        a professional marketing video.
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted">
        Upload your photos, see your price instantly, and pay by Mobile
        Money. We hand-edit your reel and you track its progress right here.
      </p>
      <Link
        href="/order"
        className="mt-8 rounded-control bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground"
      >
        Order your video
      </Link>
    </main>
  );
}
