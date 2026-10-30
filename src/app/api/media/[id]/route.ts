import { getPrincipal } from '@/lib/auth/session';
import { mediaResponse } from '@/lib/public/media-response';

/** Protected media is stored in the DB and served ONLY here, after the audience rule. GET only (no mutating methods). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const variant = new URL(req.url).searchParams.get('variant');
  return mediaResponse(id, await getPrincipal(), variant);
}
