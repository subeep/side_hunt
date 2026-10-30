'use client';
import { useFormStatus } from 'react-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export function SubmitButton({ children, className, pendingText = 'Working…' }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx('btn btn-primary', className)}>
      {pending ? pendingText : children}
    </button>
  );
}
