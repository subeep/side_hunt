import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, fmtDay } from '@/components/ui';
import { Prose } from '@/components/public/Prose';
import { getPrincipal } from '@/lib/auth/session';
import { getContentForPrincipal } from '@/lib/public/content';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const i = await getContentForPrincipal(await getPrincipal(), 'perspective', (await params).slug);
  return i ? { title: i.title, description: i.summary ?? undefined } : { title: 'Perspectives' };
}

export default async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const i = await getContentForPrincipal(await getPrincipal(), 'perspective', (await params).slug);
  if (!i) notFound(); // draft, archived, non-public audience and missing audience metadata all look identical
  return (
    <article className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm"><Link href="/perspectives">&larr; Perspectives</Link></p>
      <div className="mb-3 flex flex-wrap items-center gap-2">{i.audienceKind === 'employees' && <Badge tone="clay">Employees only</Badge>}{i.tags.map((t) => <Badge key={t}>{t}</Badge>)}{i.publishedAt && <span className="text-xs text-muted">{fmtDay(i.publishedAt)}</span>}</div>
      <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{i.title}</h1>
      {i.summary && <p className="mt-3 text-lg text-muted">{i.summary}</p>}
      <div className="mt-6"><Prose text={i.body} /></div>
    </article>
  );
}
