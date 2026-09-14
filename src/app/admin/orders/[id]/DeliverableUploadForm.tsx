"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { uploadDeliverable, type UploadDeliverableState } from "./actions";

const initialState: UploadDeliverableState = { error: null };

export function DeliverableUploadForm({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState(uploadDeliverable, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input
        type="file"
        name="video"
        accept="video/*"
        required
        className="w-full rounded-control border border-border bg-background px-3.5 py-2.5 text-sm"
      />
      {state.error && (
        <p className="rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-control bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
    >
      {pending ? "Uploading..." : "Upload finished video & mark ready"}
    </button>
  );
}
