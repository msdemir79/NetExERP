import { exportToCsv } from '../../lib/exportService';
import type { Contact, Mold, MoldMovement, MoldStock, MoldSummaryRow } from '../../types';
import { MOLD_LOCATION_LABELS, MOLD_MOVE_LABELS, formatPairs } from './moldConstants';

export type ExportFormat = 'xls' | 'csv';

/** Fason emanet rapor satırı (cari × kalıp × konum bazında toplanmış). */
export interface SubcontractReportRow {
  cariCode: string;
  cariName: string;
  moldCode: string;
  moldName: string;
  locationLabel: string;
  pairs: number;
  looseLeft: number;
  looseRight: number;
}

/** Hareket dökümü rapor satırı (numara kırılımı toplamıyla). */
export interface MovementReportRow {
  movementNo: string;
  date: string;
  moldCode: string;
  moldName: string;
  typeLabel: string;
  fromLabel: string;
  toLabel: string;
  totalPairs: number;
  description: string;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function today(): string {
  return new Date().toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Basit styled .xls (HTML tabanlı) dışa aktarma. exportService'teki puantaj/bordro
 * deseniyle aynı yaklaşım: Excel HTML'i açar, UTF-8 BOM Türkçe karakterleri korur.
 */
function downloadXls(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  numericCols: number[] = [],
): void {
  const numSet = new Set(numericCols);
  const headHtml = headers
    .map((h, i) => `<th style="background-color:#0f172a;color:#fff;border:1px solid #475569;font-size:11px;padding:6px;text-align:${numSet.has(i) ? 'right' : 'left'};">${esc(h)}</th>`)
    .join('');
  const bodyHtml = rows
    .map((r, ri) => {
      const bg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
      const cells = r
        .map((c, ci) => {
          const isNum = numSet.has(ci);
          const fmt = typeof c === 'number' ? (Number.isInteger(c) ? "'0" : "'#,##0.00##") : '\\@';
          return `<td style="mso-number-format:'${fmt}';background-color:${bg};border:1px solid #cbd5e1;font-size:11px;padding:5px;text-align:${isNum ? 'right' : 'left'};${isNum ? 'font-family:monospace;' : ''}">${esc(c)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const colspan = headers.length;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<style>body{font-family:Calibri,Arial,sans-serif;}table{border-collapse:collapse;}</style></head>
<body>
<table>
<tr><td colspan="${colspan}" style="background-color:#1e1b4b;color:#fff;font-size:15px;font-weight:900;padding:10px;">${esc(title)}</td></tr>
<tr><td colspan="${colspan}" style="background-color:#312e81;color:#e0e7ff;font-size:11px;font-weight:bold;padding:6px;">${esc(subtitle)} &nbsp;|&nbsp; Oluşturma: ${today()}</td></tr>
<tr style="height:6px;"><td colspan="${colspan}" style="border:none;background:#fff;"></td></tr>
<thead><tr>${headHtml}</tr></thead>
<tbody>${bodyHtml}</tbody>
</table>
</body></html>`;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.xls') ? filename : `${filename}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const LOCATION_HEADERS = [
  'Kalıp Kodu', 'Kalıp Adı', 'Numara Aralığı', 'Fabrika', 'Fason', 'Bakım', 'Hurda/Kayıp', 'Tahsis', 'Toplam Çift', 'Kullanılabilir',
];
const LOCATION_NUMERIC = [3, 4, 5, 6, 7, 8, 9];

function locationRows(perMold: MoldSummaryRow[]): (string | number)[][] {
  return perMold.map((m) => [
    m.code, m.name, m.sizeRange || '',
    m.factoryPairs, m.subcontractPairs, m.maintenancePairs, m.scrapPairs, m.allocatedPairs,
    m.totalPairs, m.availablePairs,
  ]);
}

export function exportMoldLocationSummary(perMold: MoldSummaryRow[], format: ExportFormat): void {
  const rows = locationRows(perMold);
  if (format === 'csv') {
    exportToCsv('Kalip_Konum_Ozeti.csv', LOCATION_HEADERS, rows);
    return;
  }
  downloadXls('Kalip_Konum_Ozeti.xls', 'KALIP KONUM ÖZETİ', `${perMold.length} kalıp`, LOCATION_HEADERS, rows, LOCATION_NUMERIC);
}

const SUB_HEADERS = ['Cari Kodu', 'Cari Ünvanı', 'Kalıp Kodu', 'Kalıp Adı', 'Konum', 'Çift', 'Tek Sol', 'Tek Sağ'];
const SUB_NUMERIC = [5, 6, 7];

function subRows(rows: SubcontractReportRow[]): (string | number)[][] {
  return rows.map((r) => [r.cariCode, r.cariName, r.moldCode, r.moldName, r.locationLabel, r.pairs, r.looseLeft, r.looseRight]);
}

export function exportMoldSubcontract(rows: SubcontractReportRow[], format: ExportFormat): void {
  const data = subRows(rows);
  if (format === 'csv') {
    exportToCsv('Kalip_Fason_Emanet.csv', SUB_HEADERS, data);
    return;
  }
  downloadXls('Kalip_Fason_Emanet.xls', 'KALIP FASON EMANET RAPORU', `${rows.length} satır`, SUB_HEADERS, data, SUB_NUMERIC);
}

const MOVE_HEADERS = ['Fiş No', 'Tarih', 'Kalıp Kodu', 'Kalıp Adı', 'Tür', 'Kaynak', 'Hedef', 'Çift', 'Açıklama'];
const MOVE_NUMERIC = [7];

function moveRows(rows: MovementReportRow[]): (string | number)[][] {
  return rows.map((r) => [r.movementNo, r.date, r.moldCode, r.moldName, r.typeLabel, r.fromLabel, r.toLabel, r.totalPairs, r.description]);
}

export function exportMoldMovements(rows: MovementReportRow[], format: ExportFormat, subtitle: string): void {
  const data = moveRows(rows);
  if (format === 'csv') {
    exportToCsv('Kalip_Hareket_Dokumu.csv', MOVE_HEADERS, data);
    return;
  }
  downloadXls('Kalip_Hareket_Dokumu.xls', 'KALIP HAREKET DÖKÜMÜ', subtitle, MOVE_HEADERS, data, MOVE_NUMERIC);
}

/** moldStock kovalarından cari × kalıp × konum bazında fason emanet satırları üretir. */
export function buildSubcontractReportRows(
  stock: MoldStock[],
  molds: Mold[],
  contacts: Contact[],
  subcontractLocations: string[],
): SubcontractReportRow[] {
  const moldById = new Map<number, Mold>();
  for (const m of molds) if (m.id != null) moldById.set(Number(m.id), m);
  const contactById = new Map<number, Contact>();
  for (const c of contacts) if (c.id != null) contactById.set(Number(c.id), c);

  const map = new Map<string, SubcontractReportRow>();
  for (const b of stock) {
    if (!subcontractLocations.includes(b.locationType)) continue;
    const pairs = Number(b.pairs) || 0;
    const looseLeft = Number(b.looseLeft) || 0;
    const looseRight = Number(b.looseRight) || 0;
    if (pairs === 0 && looseLeft === 0 && looseRight === 0) continue;
    const key = `${b.moldId}|${b.subcontractId}|${b.locationType}`;
    const mold = moldById.get(Number(b.moldId));
    const cari = contactById.get(Number(b.subcontractId));
    const existing = map.get(key);
    if (existing) {
      existing.pairs = Number((existing.pairs + pairs).toFixed(4));
      existing.looseLeft += looseLeft;
      existing.looseRight += looseRight;
    } else {
      map.set(key, {
        cariCode: cari?.code || `#${b.subcontractId}`,
        cariName: cari?.name || `#${b.subcontractId}`,
        moldCode: mold?.code || `#${b.moldId}`,
        moldName: mold?.name || `#${b.moldId}`,
        locationLabel: MOLD_LOCATION_LABELS[b.locationType as keyof typeof MOLD_LOCATION_LABELS] || b.locationType,
        pairs, looseLeft, looseRight,
      });
    }
  }
  const rows: SubcontractReportRow[] = [];
  for (const r of map.values()) rows.push(r);
  rows.sort((a, b) => a.cariName.localeCompare(b.cariName, 'tr') || a.moldName.localeCompare(b.moldName, 'tr'));
  return rows;
}

/** Hareket + numara kırılımı + kalıp/cari haritalarından hareket dökümü satırları üretir. */
export function buildMovementReportRows(
  movements: MoldMovement[],
  itemsByMovement: Map<number, number>,
  molds: Mold[],
  contacts: Contact[],
): MovementReportRow[] {
  const moldById = new Map<number, Mold>();
  for (const m of molds) if (m.id != null) moldById.set(Number(m.id), m);
  const contactById = new Map<number, Contact>();
  for (const c of contacts) if (c.id != null) contactById.set(Number(c.id), c);

  const endpoint = (loc: MoldMovement['toLocationType'], sub: number, wo: number): string => {
    if (!loc) return 'Giriş';
    const base = MOLD_LOCATION_LABELS[loc] || String(loc);
    if (sub) {
      const cari = contactById.get(Number(sub));
      return `${base} · ${cari?.name || `#${sub}`}`;
    }
    if (Number(wo) > 0) return `${base} · İE#${wo}`;
    return base;
  };

  return movements.map((mv) => {
    const mold = moldById.get(Number(mv.moldId));
    return {
      movementNo: mv.movementNo,
      date: String(mv.date).slice(0, 16).replace('T', ' '),
      moldCode: mold?.code || `#${mv.moldId}`,
      moldName: mold?.name || `#${mv.moldId}`,
      typeLabel: MOLD_MOVE_LABELS[mv.type] || mv.type,
      fromLabel: endpoint(mv.fromLocationType, Number(mv.fromSubcontractId), Number(mv.fromWorkOrderId)),
      toLabel: endpoint(mv.toLocationType, Number(mv.toSubcontractId), Number(mv.toWorkOrderId)),
      totalPairs: itemsByMovement.get(Number(mv.id)) || 0,
      description: mv.description || '',
    };
  });
}

export { formatPairs };
