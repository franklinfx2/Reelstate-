"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrder, type CreateOrderState } from "./actions";
import { MIN_ORDER_PHOTOS, quoteForPhotoCount, formatGHS } from "@/lib/pricing";

const initialState: CreateOrderState = { error: null };

export default function OrderPage() {
  const [state, formAction] = useActionState(createOrder, initialState);
  const [photoCount, setPhotoCount] = useState(0);
  const [wantsCustom, setWantsCustom] = useState(false);

  const quote = wantsCustom ? null : quoteForPhotoCount(photoCount);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-accent">Reelstate</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Order a property video
        </h1>
        <p className="mt-2 text-muted">
          Upload your property photos, see your price instantly, and we
          hand-edit a professional reel for you.
        </p>
      </header>

      <form action={formAction} className="space-y-10">
        <Section title="Your details">
          <Field label="Your name" name="clientName" required />
          <Field
            label="WhatsApp number"
            name="clientPhone"
            required
            placeholder="024 123 4567"
          />
        </Section>

        <Section title="Photos">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Property photos (minimum {MIN_ORDER_PHOTOS})
            </label>
            <input
              type="file"
              name="photos"
              accept="image/*"
              multiple
              required
              onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
              className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm"
            />
          </div>

          <PriceDisplay
            photoCount={photoCount}
            wantsCustom={wantsCustom}
            quote={quote}
          />
        </Section>

        <Section title="Music">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Have a specific track? (optional)
            </label>
            <input
              type="file"
              name="musicFile"
              accept="audio/*"
              className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm"
            />
            <p className="mt-1.5 text-xs text-muted">
              Leave this empty and we&apos;ll pick licensed background music
              for you.
            </p>
          </div>
        </Section>

        <Section title="Custom edit">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="wantsCustom"
              checked={wantsCustom}
              onChange={(e) => setWantsCustom(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I want a custom edit — describe exactly how I want the video
              styled (priced separately, we&apos;ll confirm by WhatsApp).
            </span>
          </label>
          {wantsCustom && (
            <textarea
              name="customInstructions"
              required
              rows={4}
              placeholder="Describe the style, pacing, or shots you want..."
              className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm"
            />
          )}
        </Section>

        {state.error && (
          <p className="rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </main>
  );
}

function PriceDisplay({
  photoCount,
  wantsCustom,
  quote,
}: {
  photoCount: number;
  wantsCustom: boolean;
  quote: ReturnType<typeof quoteForPhotoCount>;
}) {
  if (photoCount === 0) return null;

  if (wantsCustom) {
    return (
      <p className="rounded-control bg-surface px-3.5 py-3 text-sm text-muted">
        Custom pricing — we&apos;ll confirm your price by WhatsApp after
        reviewing your brief.
      </p>
    );
  }

  if (!quote) {
    return (
      <p className="rounded-control bg-danger/10 px-3.5 py-3 text-sm text-danger">
        Upload at least {MIN_ORDER_PHOTOS} photos to get a price.
      </p>
    );
  }

  if (quote.kind === "custom") {
    return (
      <p className="rounded-control bg-surface px-3.5 py-3 text-sm text-muted">
        {photoCount} photos is above our standard tiers — this becomes a
        custom quote, we&apos;ll confirm your price by WhatsApp.
      </p>
    );
  }

  return (
    <div className="rounded-control bg-surface px-3.5 py-3">
      <p className="text-sm text-muted">
        {quote.band.label} tier ({quote.band.minPhotos}–{quote.band.maxPhotos}{" "}
        photos)
      </p>
      <p className="mt-1 text-xl font-semibold">
        {formatGHS(quote.priceGHS)}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm"
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground disabled:opacity-60"
    >
      {pending ? "Submitting..." : "Place order"}
    </button>
  );
}
