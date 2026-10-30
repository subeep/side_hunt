'use server';
import { headers } from 'next/headers';
import { clientIp } from '@/lib/http';
import { leadFormState } from '@/lib/public/leads';
import type { LeadFormState } from '@/lib/public/lead-schema';

export async function submitDemoAction(_prev: LeadFormState, fd: FormData): Promise<LeadFormState> {
  return leadFormState('demo', fd, clientIp(await headers()));
}
