import { db } from '../src/db';
import { seedAll } from '../src/db/seed';

await seedAll(db);
console.log('seeded');
process.exit(0);
