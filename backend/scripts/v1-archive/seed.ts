import bcrypt from 'bcryptjs';
import pool from '../config/db';
import logger from '../config/logger';
import type { UserRole } from '../types/common.types';

const BCRYPT_COST = 12;

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const seedUsers: SeedUser[] = [
  {
    name: 'Admin User',
    email: 'admin@rai.dev',
    password: 'Admin@123',
    role: 'admin',
  },
  {
    name: 'Project Manager',
    email: 'manager@rai.dev',
    password: 'Manager@123',
    role: 'project_manager',
  },
  {
    name: 'Dev User',
    email: 'user@rai.dev',
    password: 'User@123',
    role: 'user',
  },
];

async function seed(): Promise<void> {
  logger.info({ userId: 'system', route: 'seed' }, 'Starting database seed');

  for (const seedUser of seedUsers) {
    const existing = await pool.query<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [seedUser.email]
    );

    if (existing.rows.length > 0) {
      logger.info({ email: seedUser.email, userId: 'system', route: 'seed' }, 'User already exists, skipping');
      continue;
    }

    const passwordHash = await bcrypt.hash(seedUser.password, BCRYPT_COST);

    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [seedUser.name, seedUser.email, passwordHash, seedUser.role]
    );

    logger.info(
      { email: seedUser.email, role: seedUser.role, userId: 'system', route: 'seed' },
      'User seeded successfully'
    );
  }

  logger.info({ userId: 'system', route: 'seed' }, 'Database seed complete');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error({ error: (err as Error).message, userId: 'system', route: 'seed' }, 'Seed failed');
    process.exit(1);
  });
