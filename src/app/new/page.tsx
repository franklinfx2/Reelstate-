"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createProperty, type CreatePropertyState } from "./actions";
import {
  FURNISHING_OPTIONS,
  LISTING_PURPOSES,
  PRICE_PERIODS,
  PROPERTY_TYPES,
} from "@/lib/property-types";

const initialState: CreatePropertyState = { error: null };

export default function NewPropertyPage() {
  const [state, formAction] = useActionState(createProperty, initialState);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-accent">Reelstate</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          New property
        </h1>
        <p className="mt-2 text-muted">
          Upload your raw video and photos — we&apos;ll turn it into a
          professional listing, ready to share.
        </p>
      </header>

      <form action={formAction} className="space-y-10">
        <Section title="Agent details">
          <Field label="Your name" name="agentName" required />
          <Field
            label="WhatsApp number"
            name="agentPhone"
            required
            placeholder="024 123 4567"
          />
        </Section>

        <Section title="Property details">
          <Field label="Listing title" name="title" required placeholder="Cozy 2 bedroom apartment" />
          <SelectField label="Property type" name="propertyType" required>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bedrooms" name="bedrooms" type="number" min={0} />
            <SelectField label="Furnishing" name="furnishing">
              <option value="">Not specified</option>
              {FURNISHING_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField label="Description" name="description" />
        </Section>

        <Section title="Price & location">
          <SelectField label="Listing purpose" name="listingPurpose" required>
            {LISTING_PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Price (GH₵)"
              name="priceAmount"
              type="number"
              min={0}
              required
            />
            <SelectField label="Per" name="pricePeriod">
              <option value="">—</option>
              {PRICE_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Area" name="locationArea" required placeholder="East Legon" />
            <Field label="City" name="locationCity" required placeholder="Accra" />
          </div>
        </Section>

        <Section title="Media">
          <FileField
            label="Raw property video"
            name="video"
            accept="video/*"
            required
            hint="One video from your phone — we'll crop it vertical and add your price, location and WhatsApp on it."
          />
          <FileField
            label="Photos"
            name="photos"
            accept="image/*"
            multiple
            required
            hint="Add as many as you have — these go on the property page."
          />
        </Section>

        {state.error && (
          <p className="rounded-control border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-6 space-y-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-control border border-border bg-background px-3.5 py-2.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
  min,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-accent"> *</span>}
      </Label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        className={inputClass}
      />
    </div>
  );
}

function TextAreaField({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea name={name} rows={3} className={inputClass} />
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-accent"> *</span>}
      </Label>
      <select name={name} required={required} className={inputClass} defaultValue="">
        {required && (
          <option value="" disabled hidden>
            Select…
          </option>
        )}
        {children}
      </select>
    </div>
  );
}

function FileField({
  label,
  name,
  accept,
  required,
  multiple,
  hint,
}: {
  label: string;
  name: string;
  accept: string;
  required?: boolean;
  multiple?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-accent"> *</span>}
      </Label>
      <input
        name={name}
        type="file"
        accept={accept}
        required={required}
        multiple={multiple}
        className="block w-full text-sm text-muted file:mr-4 file:rounded-control file:border-0 file:bg-accent file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-accent-foreground"
      />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground transition disabled:opacity-50"
    >
      {pending ? "Creating your marketing content…" : "Generate marketing content"}
    </button>
  );
}
