import { and, eq, notInArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { authorize } from '../authz/policy';
import { minCohortOrgs } from '../env';
import { countDistinctOrgs, releaseStat } from './aggregation';
import { QUALITY_WEIGHT } from './themes';
import { getVisibleSharedMany } from './visibility';

export interface PriorityRow {
  ideaId: string; title: string; status: string; score: number; linked: number; orgsLabel: string; quality: string; explanation: string;
}

/**
 * Assisted prioritisation: rank open ideas by DISTINCT contributing organisations x evidence quality (never by volume of
 * posts or votes). Advisory only: the explanation is shown so a human can disagree. Product owners only.
 */
export async function prioritiseIdeas(p: Principal | null): Promise<PriorityRow[]> {
  if (!p || !authorize(p, 'idea.manage').allow) throw new Error('forbidden');
  const t = minCohortOrgs();
  const ideas = await db.select().from(schema.ideas).where(and(notInArray(schema.ideas.status, ['released', 'not_proceeding'])));
  const rows: PriorityRow[] = [];
  for (const idea of ideas) {
    const ev = await db.select({ s: schema.ideaEvidence.sharedId }).from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, idea.id));
    const items = await getVisibleSharedMany(p, ev.map((e) => e.s)); // published + visible only
    const ids = items.map((i) => i.id);
    const orgs = await countDistinctOrgs(ids);
    const q = items.length ? items.reduce((s, i) => s + (QUALITY_WEIGHT[i.evidenceQuality] ?? 0.3), 0) / items.length : 0;
    const breadth = Math.min(orgs, 2 * t) / (2 * t);
    const score = Math.round(100 * breadth * (0.4 + 0.6 * q));
    const stat = await releaseStat(p.userId, ids);
    const qLabel = q >= 0.75 ? 'strong' : q >= 0.5 ? 'moderate' : q > 0 ? 'weak or unassessed' : 'none';
    rows.push({
      ideaId: idea.id, title: idea.title, status: idea.status, score, linked: items.length,
      orgsLabel: stat.suppressed ? `fewer than ${t} (withheld)` : String(stat.orgs),
      quality: qLabel,
      explanation: items.length
        ? `Score ${score}/100 = evidence breadth (${orgs >= t ? `${t}+ distinct organisations` : `below ${t} organisations`}, ${Math.round(breadth * 100)}% of the cap) x evidence quality (${qLabel}). Repeated posts from one organisation count once; popularity and votes are not used.`
        : 'No currently published evidence is linked, so there is nothing to rank on. Link approved contributions to include this idea.',
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
