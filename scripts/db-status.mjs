import fs from 'node:fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'proerp', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'proerp' });
try {
  const [tables] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schema_migrations'");
  const applied = tables.length ? (await connection.query('SELECT id FROM schema_migrations ORDER BY id'))[0].map(row => row.id) : [];
  const files = fs.readdirSync(new URL('../db/migrations/', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
  console.log(JSON.stringify({ applied, pending: files.filter(file => !applied.includes(file)) }, null, 2));
} finally { await connection.end(); }
