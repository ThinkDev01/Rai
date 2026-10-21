import pool from '../../config/db';

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
