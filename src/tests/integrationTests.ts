/**
 * ProERP Faz 3 — Integration + Concurrency Testleri (item 5, 6).
 *
 * Gerçek HTTP + gerçek MySQL + gerçek RBAC/op yolu üzerinde, harness'ın mint
 * ettiği super_admin oturumuyla koşar. Sertleştirme garantilerini uçtan uca
 * doğrular:
 *   • item 4  — türetilmiş/korumalı finansal alanlar generic INSERT/PATCH'te soyulur
 *   • item 8  — yevmiye fiş no sunucuda üretilir; eşzamanlı isteklerde benzersizdir
 *   • item 1/45 — transactional kayıtlar doğrudan silinemez (403)
 *   • item 1  — cari hareket iptali = ters kayıt (void), bakiye net sıfır
 *   • item 7  — 5xx yanıtları SQL/stack sızdırmaz (genel mesaj)
 *   • iyimser kilitleme — eşzamanlı PATCH'te tam olarak bir istek kazanır (409)
 *   • stok kartı ekstresi — her renk ayrı hareket satırı alır, color/size kolonları dolu yazılır
 *
 * Çalıştırma: npm run test:integration
 */
import { startTestServer, api, type TestServer } from './harness.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    HATA: ${err?.message || err}`);
    failed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Beklenen: ${JSON.stringify(expected)}, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Beklenen: truthy, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeNullish() {
      if (actual !== null && actual !== undefined) throw new Error(`Beklenen: null/undefined, Alınan: ${JSON.stringify(actual)}`);
    },
    toMatch(re: RegExp) {
      if (!re.test(String(actual))) throw new Error(`Beklenen: ${re}, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeIn(set: any[]) {
      if (!set.includes(actual)) throw new Error(`Beklenen: ${JSON.stringify(set)} içinden biri, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) throw new Error(`Beklenen: > ${n}, Alınan: ${actual}`);
    },
  };
}

/** Ham yanıt gövdesinde SQL/stack/DB hata sızıntısı olmadığını doğrular. */
function assertNoLeak(text: string): void {
  const lower = text.toLowerCase();
  const banned = ['select ', 'insert into', 'update `', 'foreign key', 'er_no_referenced', 'er_dup_entry', 'sqlmessage', 'at object.', 'at async', 'mysql2'];
  for (const b of banned) {
    if (lower.includes(b)) throw new Error(`Yanıt gövdesinde hassas sızıntı bulundu: "${b}" → ${text.slice(0, 200)}`);
  }
}

const RUN = Date.now();
let srv: TestServer;

async function createContact(label: string): Promise<number> {
  const res = await api(srv, 'POST', '/contacts', {
    name: `TEST-FAZ3 ${label} ${RUN}`,
    code: `TF3-${label}-${RUN}`.slice(0, 40),
    type: 'customer',
  });
  if (res.status !== 201) throw new Error(`Test carisi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? (res.data as any));
}

async function getRow(resource: string, id: number): Promise<any> {
  const res = await api(srv, 'GET', `/${resource}/${id}`);
  if (res.status !== 200) throw new Error(`${resource}/${id} okunamadı (${res.status})`);
  return (res.data as any)?.data;
}

function balancedLines(amount = 100) {
  return [
    { accountCode: '100.01', accountName: 'Kasa', description: 'TEST-FAZ3', debit: amount, credit: 0 },
    { accountCode: '120.01', accountName: 'Alıcılar', description: 'TEST-FAZ3', debit: 0, credit: amount },
  ];
}

async function main(): Promise<void> {
  srv = await startTestServer(1);
  console.log('\n======================================================');
  console.log(' PROERP FAZ 3 — INTEGRATION + CONCURRENCY TESTLERİ');
  console.log(` Hedef: ${srv.baseUrl} (canlı DB, in-process oturum)`);
  console.log('======================================================\n');

  // ---------------------------------------------------------------
  console.log('📌 A. KORUMALI ALANLAR (item 4) — generic INSERT/PATCH soyulması');
  // ---------------------------------------------------------------
  const stripContactId = await createContact('strip');
  let stripTxId = 0;

  await test('INSERT: transactions.status/reversalOfId/cancelledAt istemciden zorla yazılamaz', async () => {
    const res = await api(srv, 'POST', '/transactions', {
      contactId: stripContactId,
      type: 'income',
      amount: 100,
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 strip INSERT',
      category: 'Tahsilat',
      paymentMethod: 'cash',
      // Zorlanan (forged) korumalı alanlar:
      status: 'cancelled',
      reversalOfId: 999,
      cancelledAt: '2020-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(201);
    stripTxId = Number((res.data as any)?.data ?? res.data);
    const row = await getRow('transactions', stripTxId);
    expect(row.status).toBe('posted'); // DB varsayılanı; zorlanan 'cancelled' soyuldu
    expect(row.reversalOfId).toBeNullish();
    expect(row.cancelledAt).toBeNullish();
  });

  await test('PATCH: transactions korumalı alanları güncellemede de soyulur', async () => {
    const res = await api(srv, 'PATCH', `/transactions/${stripTxId}`, {
      description: 'TEST-FAZ3 strip PATCH',
      status: 'cancelled',
      reversalOfId: 777,
    });
    expect(res.status).toBe(200);
    const row = await getRow('transactions', stripTxId);
    expect(row.description).toBe('TEST-FAZ3 strip PATCH'); // meşru alan yazıldı
    expect(row.status).toBe('posted'); // korumalı alan değişmedi
    expect(row.reversalOfId).toBeNullish();
  });

  await test('INSERT: invoices.paidAmount/paymentStatus zorla yazılamaz', async () => {
    const res = await api(srv, 'POST', '/invoices', {
      contactId: stripContactId,
      invoiceNumber: `TEST-FAZ3-INV-${RUN}`,
      type: 'sales',
      date: new Date().toISOString(),
      status: 'draft',
      grandTotal: 500,
      paidAmount: 500, // zorlanan türetilmiş alan
      paymentStatus: 'paid', // zorlanan türetilmiş alan
    });
    // Fatura oluşturulduysa korumalı alanlar varsayılanda kalmalıdır.
    if (res.status === 201) {
      const id = Number((res.data as any)?.data ?? res.data);
      const row = await getRow('invoices', id);
      expect(Number(row.paidAmount) || 0).toBe(0);
      expect(row.paymentStatus).toBeIn(['unpaid', null, undefined]);
    } else {
      // Zorunlu alan eksikliği vb. iş kuralı reddi de kabul edilebilir (4xx).
      expect(res.status >= 400 && res.status < 500).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------
  console.log('\n📌 B. SUNUCU TARAFI FİŞ NO + DENGE (item 8)');
  // ---------------------------------------------------------------
  let jeId = 0;

  await test('POST journalEntries: istemci entryNumber yok sayılır, sunucu üretir', async () => {
    const res = await api(srv, 'POST', '/journalEntries', {
      entryType: 'mahsup',
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 fiş no',
      entryNumber: 'HACK-999', // zorlanan — yok sayılmalı
      lines: balancedLines(100),
    });
    expect(res.status).toBe(201);
    jeId = Number((res.data as any)?.data ?? res.data);
    const row = await getRow('journalEntries', jeId);
    expect(row.entryNumber).toMatch(/^YEV-\d{4}-\d{6}$/);
    if (row.entryNumber === 'HACK-999') throw new Error('İstemci entryNumber değeri kabul edildi!');
  });

  await test('POST journalEntries: dengesiz fiş 422 ile reddedilir', async () => {
    const res = await api(srv, 'POST', '/journalEntries', {
      entryType: 'mahsup',
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 dengesiz',
      lines: [
        { accountCode: '100.01', accountName: 'Kasa', debit: 100, credit: 0 },
        { accountCode: '120.01', accountName: 'Alıcılar', debit: 0, credit: 50 },
      ],
    });
    expect(res.status).toBe(422);
    expect((res.data as any)?.code).toBe('UNBALANCED_JOURNAL_ENTRY');
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 C. EŞZAMANLILIK (item 6/8) — benzersiz fiş no + iyimser kilitleme');
  // ---------------------------------------------------------------
  await test('6 eşzamanlı journalEntries POST → 6 benzersiz fiş no, 500 yok', async () => {
    const reqs = Array.from({ length: 6 }, (_, i) =>
      api(srv, 'POST', '/journalEntries', {
        entryType: 'mahsup',
        date: new Date().toISOString(),
        description: `TEST-FAZ3 conc ${i} ${RUN}`,
        lines: balancedLines(50 + i),
      }),
    );
    const responses = await Promise.all(reqs);
    for (const r of responses) {
      if (r.status !== 201) throw new Error(`Eşzamanlı fiş oluşturulamadı (${r.status}): ${r.text.slice(0, 160)}`);
    }
    const ids = responses.map((r) => Number((r.data as any)?.data ?? r.data));
    const rows = await Promise.all(ids.map((id) => getRow('journalEntries', id)));
    const numbers = rows.map((r) => r.entryNumber);
    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      throw new Error(`Fiş numaraları çakıştı: ${numbers.join(', ')}`);
    }
  });

  await test('İyimser kilitleme: eşzamanlı 2 PATCH → tam olarak biri 200, diğeri 409', async () => {
    const cid = await createContact('lock');
    const before = await getRow('contacts', cid);
    const v = Number(before.version);
    expect(v).toBeGreaterThan(0);

    const [a, b] = await Promise.all([
      api(srv, 'PATCH', `/contacts/${cid}`, { description: 'TEST-FAZ3 A', expectedVersion: v }),
      api(srv, 'PATCH', `/contacts/${cid}`, { description: 'TEST-FAZ3 B', expectedVersion: v }),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const loser = a.status === 409 ? a : b;
    expect((loser.data as any)?.code).toBe('VERSION_CONFLICT');

    // Temizlik: bağımlılığı olmayan test carisini sil.
    const del = await api(srv, 'DELETE', `/contacts/${cid}`);
    expect(del.status).toBe(200);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 D. DOĞRUDAN SİLME YASAĞI (item 1/45)');
  // ---------------------------------------------------------------
  await test('DELETE transactions → 403 TRANSACTIONAL_NO_DELETE', async () => {
    const res = await api(srv, 'DELETE', `/transactions/${stripTxId}`);
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('TRANSACTIONAL_NO_DELETE');
    assertNoLeak(res.text);
  });

  await test('DELETE journalEntries → 403 TRANSACTIONAL_NO_DELETE', async () => {
    const res = await api(srv, 'DELETE', `/journalEntries/${jeId}`);
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('TRANSACTIONAL_NO_DELETE');
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 E. CARİ HAREKET İPTALİ = TERS KAYIT (item 1, void+reversal)');
  // ---------------------------------------------------------------
  await test('op create→cancel: bakiye net sıfır, çift iptal 409, iptal sonrası update 409', async () => {
    const cid = await createContact('void');
    const c0 = await getRow('contacts', cid);
    const bal0 = Number(c0.balance) || 0;

    const created = await api(srv, 'POST', '/ops/contact-transaction', {
      mode: 'create',
      contactId: cid,
      type: 'expense',
      amount: 250,
      description: 'TEST-FAZ3 void',
      category: 'Ödeme',
      paymentMethod: 'cash',
    });
    expect(created.status).toBe(200);
    const txId = Number((created.data as any)?.data?.id);
    expect(txId).toBeGreaterThan(0);

    const afterCreate = await getRow('contacts', cid);
    expect(Number(afterCreate.balance)).toBe(bal0 + 250); // expense → bakiye artar

    const cancelled = await api(srv, 'POST', '/ops/contact-transaction', { mode: 'delete', id: txId });
    expect(cancelled.status).toBe(200);
    expect((cancelled.data as any)?.data?.cancelled).toBe(true);
    expect((cancelled.data as any)?.data?.deleted).toBe(false);
    const reversalId = Number((cancelled.data as any)?.data?.reversalId);
    expect(reversalId).toBeGreaterThan(0);

    const afterCancel = await getRow('contacts', cid);
    expect(Number(afterCancel.balance)).toBe(bal0); // ters kayıt bakiyeyi sıfırladı

    const orig = await getRow('transactions', txId);
    expect(orig.status).toBe('cancelled'); // orijinal korundu, silinmedi
    const rev = await getRow('transactions', reversalId);
    expect(Number(rev.reversalOfId)).toBe(txId);

    const dbl = await api(srv, 'POST', '/ops/contact-transaction', { mode: 'delete', id: txId });
    expect(dbl.status).toBe(409);
    expect((dbl.data as any)?.code).toBe('TX_ALREADY_CANCELLED');

    const upd = await api(srv, 'POST', '/ops/contact-transaction', { mode: 'update', id: txId, amount: 300 });
    expect(upd.status).toBe(409);
    expect((upd.data as any)?.code).toBe('TX_CANCELLED_NO_UPDATE');
  });

  // ---------------------------------------------------------------
  console.log('\n📌 F. HATA TEMİZLİĞİ (item 7) — 5xx SQL/stack sızdırmaz');
  // ---------------------------------------------------------------
  await test('FK ihlali (var olmayan contactId) → 500 genel mesaj, sızıntı yok', async () => {
    const res = await api(srv, 'POST', '/transactions', {
      contactId: 999999, // var olmayan cari → fk_transactions_contact ihlali
      type: 'income',
      amount: 1,
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 fk',
    });
    expect(res.status).toBe(500);
    expect((res.data as any)?.error).toBe('Sunucu hatası oluştu. Lütfen tekrar deneyin.');
    assertNoLeak(res.text);
  });

  await test('Bilinmeyen kaynak → 404, sızıntı yok', async () => {
    const res = await api(srv, 'GET', '/olmayan-kaynak');
    expect(res.status).toBe(404);
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 G. STOK HAREKETİ RENK/BEDEN KOLONLARI — stok kartı ekstresi kırılımı');
  // ---------------------------------------------------------------
  await test('invoice-stock: her renk ayrı hareket satırı alır, color/size kolonları dolu yazılır', async () => {
    // Renkler merkezî karttan çözümlenir; test, kullanıcının renk listesine bağımlı
    // olmasın diye sabit isim yerine listedeki ilk iki renk kullanılır.
    const colorRes = await api(srv, 'GET', '/colors?limit=500');
    const masterColors: any[] = (colorRes.data as any)?.data ?? [];
    if (masterColors.length < 2) {
      throw new Error('Bu test için merkezî renk listesinde en az 2 renk bulunmalı.');
    }
    const [colorA, colorB] = [String(masterColors[0].name), String(masterColors[1].name)];

    const prod = await api(srv, 'POST', '/products', {
      code: `TF3R-${RUN}`,
      name: `TEST-FAZ3 Renk ${RUN}`,
      unit: 'Çift',
      isFootwear: true,
      hasSizeVariants: true,
      colors: [colorA, colorB],
      assortment: [{ size: '40', quantity: 1 }, { size: '41', quantity: 1 }],
      variantBarcodes: [
        { size: '40', color: colorA, barcode: `TF3R${RUN}S40`, stock: 0 },
        { size: '41', color: colorA, barcode: `TF3R${RUN}S41`, stock: 0 },
        { size: '40', color: colorB, barcode: `TF3R${RUN}B40`, stock: 0 },
        { size: '41', color: colorB, barcode: `TF3R${RUN}B41`, stock: 0 },
      ],
    });
    expect(prod.status).toBe(201);
    const productId = Number((prod.data as any)?.data ?? prod.data);
    expect(productId).toBeGreaterThan(0);

    const docNo = `TEST-FAZ3-EXT-${RUN}`;
    const res = await api(srv, 'POST', '/ops/invoice-stock', {
      documentNumber: docNo,
      isSales: false,
      writeLog: true,
      items: [
        { productId, quantity: 10, color: colorA, size: 'Asorti' },
        { productId, quantity: 6, color: colorB, size: '40' },
      ],
    });
    expect(res.status).toBe(200);

    const listRes = await api(srv, 'GET', `/inventoryLogs?search=${encodeURIComponent(docNo)}`);
    expect(listRes.status).toBe(200);
    const rows: any[] = (listRes.data as any)?.data ?? [];
    expect(rows.length).toBe(2); // her renk kendi ekstre satırını alır

    const first = rows.find((r) => r.color === colorA);
    const second = rows.find((r) => r.color === colorB);
    if (!first || !second) {
      throw new Error(`Renk kolonu dolu hareket bulunamadı: ${JSON.stringify(rows.map((r) => ({ color: r.color, size: r.size })))}`);
    }
    expect(first.type).toBe('in');
    expect(Number(first.quantity)).toBe(10);
    expect(first.size).toBe('Asorti');
    expect(second.type).toBe('in');
    expect(Number(second.quantity)).toBe(6);
    expect(second.size).toBe('40');

    // Temizlik: ürün silinir, inventoryLogs FK CASCADE ile birlikte temizlenir.
    const del = await api(srv, 'DELETE', `/products/${productId}`);
    expect(del.status).toBe(200);
    const after = await api(srv, 'GET', `/inventoryLogs?search=${encodeURIComponent(docNo)}`);
    expect(((after.data as any)?.data ?? []).length).toBe(0);
  });

  // ---------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` INTEGRATION RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');

  await srv.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('INTEGRATION TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  process.exit(1);
});
