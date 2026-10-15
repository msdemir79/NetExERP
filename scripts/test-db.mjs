import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

// Yeni, rastgele isimli DB dışında hiçbir veritabanını oluşturmaz/silmez.
const database = `proerp_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'proerp', password: process.env.DB_PASSWORD || '', multipleStatements: true });
let created = false;
try {
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`);
  created = true;
  await connection.query(`USE \`${database}\``);
  const schema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
    .replace(/^CREATE DATABASE IF NOT EXISTS proerp[\s\S]*?;/m, '')
    .replace(/^USE proerp;/m, '');
  if (/^\s*(?:USE\s|CREATE\s+DATABASE)/mi.test(schema)) throw new Error('Test şemasında beklenmeyen veritabanı seçimi var.');
  await connection.query(schema);
  await connection.query("INSERT INTO roles (id, code, name, description, permissions, isSystem) VALUES (1,'super_admin','Test yönetici','İzole test',JSON_OBJECT(),1)");
  await connection.query("INSERT INTO users (id, username, fullName, email, roleId, roleCode, roleName, status) VALUES (1,'test_admin','Test yönetici','test@example.invalid',1,'super_admin','Test yönetici','active')");
  const testFile = process.argv[2] || 'src/tests/integrityTests.ts';
  const child = spawn(process.execPath, ['--import', 'tsx', testFile], { stdio: 'inherit', env: { ...process.env, DB_NAME: database, PROERP_TEST_DB: '1', NODE_ENV: 'test' } });
  const code = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
  process.exitCode = Number(code);
} finally {
  if (created && /^proerp_test_\d+_[a-f0-9]{8}$/.test(database)) await connection.query(`DROP DATABASE \`${database}\``);
  await connection.end();
}
