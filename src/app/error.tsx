'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 text-muted">The request could not be completed. No partial change was shown as successful.</p>
      <button className="btn btn-secondary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
