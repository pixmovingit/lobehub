/**
 * Grant (or ensure) the global super_admin role for a user by email.
 *
 * Usage: tsx scripts/grantSuperAdmin/index.ts <email>
 *
 * Self-host recovery helper when no administrator remains, or when promoting
 * an existing account without going through the settings UI.
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { eq } from 'drizzle-orm';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

const main = async () => {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('❌ Missing email argument.');
    console.error('   Usage: tsx scripts/grantSuperAdmin/index.ts <email>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Configure .env first.');
    process.exit(1);
  }

  const { serverDB } = await import('../../packages/database/src/server');
  const { users } = await import('../../packages/database/src/schemas/user');
  const { SystemAdminService } = await import('../../apps/server/src/services/systemAdmin');

  const matched = await serverDB.query.users.findFirst({
    columns: { email: true, id: true, username: true },
    where: eq(users.email, email),
  });

  if (!matched) {
    console.error(`❌ No user found for email: ${email}`);
    process.exit(1);
  }

  const adminService = new SystemAdminService(serverDB);
  await adminService.grantSuperAdmin(matched.id);

  console.log(`✅ Granted super_admin to ${matched.email || matched.username || matched.id}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ Failed to grant super_admin:', error);
  process.exit(1);
});
