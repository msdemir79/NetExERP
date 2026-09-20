// db/schema.sql dosyasından server/columns.ts üretir.
// Kullanım: npm run db:columns
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');

const tableRe = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\) ENGINE/g;
const skip = new Set(['PRIMARY', 'UNIQUE', 'KEY', 'CONSTRAINT', 'FOREIGN']);

const tables = [];
let m;
while ((m = tableRe.exec(sql))) {
  const cols = [];
  for (const line of m[2].split('\n')) {
    const cm = line.match(/^\s+`?(\w+)`?\s+([A-Z]+)/);
    if (cm && !skip.has(cm[1])) cols.push({ name: cm[1], type: cm[2].toLowerCase() });
  }
  if (cols.length) tables.push({ table: m[1], cols });
}

const jsonColumns = {
  assortmentTemplates: ['items'],
  barcodeTemplates: ['config'],
  products: ['colorBoxBarcodes', 'variantBarcodes', 'colors', 'assortment', 'colorImages'],
  recipes: ['ingredients'],
  workOrders: ['assortmentBreakdown', 'stages'],
  settings: ['company', 'stock', 'order', 'production', 'finance', 'hr'],
  journalEntries: ['lines'],
  roles: ['permissions'],
};

const allNames = new Set(tables.flatMap((t) => t.cols.map((c) => c.name)));
const stampUnion = ['createdAt', 'updatedAt'].filter((n) => allNames.has(n));

let ts = '// AUTO-GENERATED from db/schema.sql — kolon adları SQL enjeksiyonuna karşı beyaz liste olarak kullanılır.\n';
ts += '// Veritabanı şeması değişirse: npm run db:columns\n\n';
ts += 'export interface ColumnDef { name: string; type: string; }\n\n';
ts += 'export interface ResourceDef {\n  table: string;\n  primaryKey: string;\n  columns: ColumnDef[];\n  jsonColumns: string[];\n  timestamps: (TYPE_UNION)[];\n}\n\n'.replace('TYPE_UNION', stampUnion.map((n) => JSON.stringify(n)).join(' | '));
ts += 'export const RESOURCES: Record<string, ResourceDef> = {\n';

for (const t of tables) {
  ts += `  ${t.table}: {\n`;
  ts += `    table: ${JSON.stringify(t.table)},\n`;
  ts += `    primaryKey: ${JSON.stringify(t.cols[0].name)},\n`;
  ts += '    columns: [\n';
  for (const c of t.cols) {
    ts += `      { name: ${JSON.stringify(c.name)}, type: ${JSON.stringify(c.type)} },\n`;
  }
  ts += '    ],\n';
  ts += `    jsonColumns: ${JSON.stringify(jsonColumns[t.table] || [])},\n`;
  const names = t.cols.map((c) => c.name);
  const stamps = ['createdAt', 'updatedAt'].filter((n) => names.includes(n));
  ts += `    timestamps: ${JSON.stringify(stamps)},\n`;
  ts += '  },\n';
}

ts += '};\n\n';
ts += 'export function getResource(name: string): ResourceDef | undefined {\n';
ts += '  return RESOURCES[name];\n';
ts += '}\n\n';
ts += 'export function isValidColumn(def: ResourceDef, name: string): boolean {\n';
ts += '  return def.columns.some((c) => c.name === name);\n';
ts += '}\n';

fs.writeFileSync(path.join(root, 'server', 'columns.ts'), ts);
console.log(`server/columns.ts yazıldı (${tables.length} tablo).`);
