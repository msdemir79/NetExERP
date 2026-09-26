/**
 * Şema yeteneklerinin önbellekli tespiti.
 *
 * `version` kolonu (iyimser kilitleme) yeni sürümde eklendi. Geçiş uygulanmamış
 * kurulumlarda uygulama çalışmaya devam eder; yalnızca iyimser kilitleme devre
 * dışı kalır ve konsola bir kez uyarı yazılır.
 */
import { query } from './db.js';

let versionTablesCache: Set<string> | null = null;

async function loadVersionTables(): Promise<Set<string>> {
  if (versionTablesCache) return versionTablesCache;
  try {
    const rows = await query<{ TABLE_NAME: string }>(
      "SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'version'",
    );
    versionTablesCache = new Set(rows.map((r) => r.TABLE_NAME));
    if (versionTablesCache.size === 0) {
      console.warn(
        '[API] UYARI: Hiçbir tabloda `version` kolonu yok; iyimser kilitleme devre dışı. ' +
          'Etkinleştirmek için: npm run db:migrate',
      );
    }
  } catch (err) {
    console.error('[API] Şema bilgisi okunamadı:', err);
    versionTablesCache = new Set();
  }
  return versionTablesCache;
}

/** Verilen tabloda `version` kolonu var mı? (sonuç bir kez okunup önbelleklenir) */
export async function versionSupported(table: string): Promise<boolean> {
  return (await loadVersionTables()).has(table);
}

/** Test/kurulum sonrası önbelleği sıfırlar. */
export function resetSchemaCache(): void {
  versionTablesCache = null;
}
