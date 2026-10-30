import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { TRUST } from '@/lib/public/copy';

export const metadata = { title: 'About', description: 'Intelligence, engineered for the real world.' };

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="About azentio.ai" title="Intelligence, engineered for the real world." description="AI creates value when it moves beyond experimentation and becomes part of how businesses operate. We build intelligent applications combining domain understanding, advanced AI, intuitive experiences, and enterprise-grade engineering." />
      <section aria-labelledby="how" className="grid gap-4 md:grid-cols-3">
        <h2 id="how" className="sr-only">How we work</h2>
        {[['Domain first', 'We start from the decision a person has to make, then choose the AI that helps them make it well.'], ['Evidence and oversight', 'Recommendations travel with their evidence. People decide; the system keeps the audit trail.'], ['Shared learning, by consent', 'Clients can contribute observations that are reviewed, de-identified and shared only when they choose.']].map(([t, d]) => (
          <Card key={t}><h3 className="text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{d}</p></Card>
        ))}
      </section>
      <section id="privacy" aria-labelledby="priv" className="scroll-mt-24">
        <h2 id="priv" className="mb-3 text-2xl font-semibold">How we handle your enquiry</h2>
        <Card className="prose-az">
          <p>When you request a demo or register hackathon interest we store the details you type, the time of your consent, and whether you ticked the separate option to hear about events. We use them only to respond to you.</p>
          <p>We keep a hashed form of your network address for a short time to limit abuse. We do not set tracking cookies on public pages, and we do not send a confirmation email in this environment.</p>
          <p>Please do not put customer data, account numbers or credentials in a message.</p>
        </Card>
      </section>
      <section aria-labelledby="trust">
        <h2 id="trust" className="mb-3 text-2xl font-semibold">Trust by design</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{TRUST.map((t) => <li key={t.n}><Card className="h-full"><p className="eyebrow">{t.n}</p><h3 className="mt-1 font-semibold">{t.title}</h3><p className="mt-1 text-sm text-muted">{t.text}</p></Card></li>)}</ul>
      </section>
      <p><Link href="/connect" className="btn btn-primary">Start a conversation</Link></p>
    </div>
  );
}
