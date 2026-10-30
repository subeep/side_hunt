import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const walk = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : [];
const rel = (f: string) => path.relative(root, f);

describe('/public folder contains nothing sensitive', () => {
  const files = walk(path.join(root, 'public'));
  // Only inert static assets we created. Media, uploads, data dumps and env files must never live here.
  const ALLOWED = new Set(['.svg', '.ico', '.png', '.txt', '.webmanifest']);
  const ALLOWED_NAMES = new Set(['robots.txt', 'favicon.ico']);
  it('is either absent or limited to a tiny allowlist of static assets', () => {
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      expect(ALLOWED.has(ext), `unexpected file in public/: ${rel(f)}`).toBe(true);
      if (ext === '.txt') expect(ALLOWED_NAMES.has(path.basename(f)), rel(f)).toBe(true);
    }
    expect(files.length).toBeLessThan(10);
  });
  it('holds no media payloads, data dumps, databases or env files', () => {
    for (const f of files) {
      expect(rel(f)).not.toMatch(/\.(mp4|webm|mov|mp3|wav|pdf|csv|json|sql|db|sqlite|env|pem|key|zip|vtt|md)$/i);
      expect(path.basename(f)).not.toMatch(/^\.env|secret|credential|seed|dump|private/i);
    }
  });
  it('contains no secrets or connection strings', () => {
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/AUTH_SECRET|DATABASE_URL|postgres(ql)?:\/\/|BEGIN (RSA |EC )?PRIVATE KEY|sk_live|api[_-]?key\s*[:=]/i);
    }
  });
  it('seeded media ids never appear as static files anywhere in public/ or the app icon', () => {
    for (const f of files) expect(path.basename(f)).not.toMatch(/^med_/);
  });
});

describe('route-level hygiene', () => {
  it('the media route exposes GET only and delegates to the authorising lib function', () => {
    const src = fs.readFileSync(path.join(root, 'src/app/api/media/[id]/route.ts'), 'utf8');
    expect(src).toMatch(/export async function GET/);
    expect(src).not.toMatch(/export (async )?(function|const) (POST|PUT|PATCH|DELETE)/);
    expect(src).toMatch(/getPrincipal/);
    expect(src).toMatch(/mediaResponse/);
  });
  it('public API routes expose GET only', () => {
    for (const f of walk(path.join(root, 'src/app/api/public'))) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/export (async )?(function|const) (POST|PUT|PATCH|DELETE)/);
  });
  it('leads are write-only from the public area: no module in the public area reads them back', () => {
    const files = [...walk(path.join(root, 'src/lib/public')), ...walk(path.join(root, 'src/components/public')), ...['connect', 'hackathon', 'about', 'live', 'lab', 'perspectives', 'products', 'media', 'publisher', 'api/public', 'api/media'].flatMap((d) => walk(path.join(root, 'src/app', d)))];
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), rel(f)).not.toMatch(/from\(schema\.leads\)|select\([^)]*\)\s*\.from\(\s*leads/);
  });
  it('every publisher server action guards a SPECIFIC grant first', () => {
    const src = fs.readFileSync(path.join(root, 'src/app/publisher/actions.ts'), 'utf8');
    const actions = src.split('export async function ').slice(1);
    expect(actions.length).toBe(6);
    for (const a of actions) expect(a, a.slice(0, 40)).toMatch(/await requireGrant\('(content_publisher|video_publisher)'\)/);
    for (const a of actions.filter((x) => /^(saveBanner|bannerStatus|saveContent|contentStatus)/.test(x))) expect(a).toContain("requireGrant('content_publisher')");
    for (const a of actions.filter((x) => /^media/.test(x))) expect(a).toContain("requireGrant('video_publisher')");
  });
  it('each publisher tab page guards its own grant (not just the shell)', () => {
    const g = (p: string) => fs.readFileSync(path.join(root, 'src/app/publisher', p, 'page.tsx'), 'utf8');
    expect(g('banners')).toContain("requireGrant('content_publisher')");
    expect(g('content')).toContain("requireGrant('content_publisher')");
    expect(g('media')).toContain("requireGrant('video_publisher')");
    expect(fs.readFileSync(path.join(root, 'src/app/publisher/page.tsx'), 'utf8')).toContain('requireAnyPublisher');
  });
  it('no raw HTML injection anywhere in the public area', () => {
    const files = [...walk(path.join(root, 'src/components/public')), ...walk(path.join(root, 'src/app'))].filter((f) => /\.tsx$/.test(f) && /(components\/public|app\/(page|connect|hackathon|about|live|lab|perspectives|products|media|publisher))/.test(f));
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), rel(f)).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
