import { execSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Local dev uses embedded PGlite and needs no push.');
  process.exit(1);
}
execSync('npx drizzle-kit push --force', { stdio: 'inherit' });
