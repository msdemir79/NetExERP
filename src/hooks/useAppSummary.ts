import { useMemo } from 'react';
import { api } from '../api/client';
import { useApiQuery } from './useApiQuery';

/**
 * ProERP Optimize Edilmiş & Hafifletilmiş Yönetici ve AI Asistan Özeti Hook'u
 * Gereksiz tablo çekimlerini (contacts, accounts, logs vb.) kaldırıp
 * bellek tüketimini ve yeniden çizim (re-render) maliyetini minimize eder.
 */
export function useAppSummary() {
  // Yalnızca özet ve pano için kritik tabloları dinle
  const transactions = useApiQuery(() => api.transactions.list(), [], ['transactions']) || [];
  const cashBoxes = useApiQuery(() => api.cashBoxes.list(), [], ['cashBoxes']) || [];
  const bankAccounts = useApiQuery(() => api.bankAccounts.list(), [], ['bankAccounts']) || [];
  const employees = useApiQuery(() => api.employees.list({ where: { status: 'active' } }), [], ['employees']) || [];
  const payrollRecords = useApiQuery(() => api.payrollRecords.list(), [], ['payrollRecords']) || [];
  const advanceRequests = useApiQuery(() => api.advanceRequests.list({ where: { status: 'pending' } }), [], ['advanceRequests']) || [];
  const products = useApiQuery(() => api.products.list(), [], ['products']) || [];
  const orders = useApiQuery(() => api.orders.list(), [], ['orders']) || [];
  const orderItems = useApiQuery(() => api.orderItems.list(), [], ['orderItems']) || [];
  const workOrders = useApiQuery(() => api.workOrders.list(), [], ['workOrders']) || [];
  const journalEntries = useApiQuery(() => api.journalEntries.list(), [], ['journalEntries']) || [];
  const checks = useApiQuery(() => api.checks.list(), [], ['checks']) || [];
  const invoices = useApiQuery(() => api.invoices.list(), [], ['invoices']) || [];
  const waybills = useApiQuery(() => api.waybills.list({ where: { invoicedStatus: 'not_invoiced' } }), [], ['waybills']) || [];

  const stats = useMemo(() => {
    // 1. Finans & Likidite
    let income = 0;
    let expense = 0;
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      if (t.type === 'income') income += (t.amount || 0);
      else if (t.type === 'expense') expense += (t.amount || 0);
    }
    const profit = income - expense;

    let cashBalance = 0;
    for (let i = 0; i < cashBoxes.length; i++) cashBalance += (cashBoxes[i].balance || 0);

    let bankBalance = 0;
    for (let i = 0; i < bankAccounts.length; i++) bankBalance += (bankAccounts[i].balance || 0);

    const totalLiquidAssets = cashBalance + bankBalance;

    let customerChecksCount = 0;
    let customerChecksTotal = 0;
    let issuedChecksTotal = 0;

    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      if (
        (c.type === 'received_check' || c.type === 'received_note') &&
        (c.status === 'portfolio' || c.status === 'bank_collection')
      ) {
        customerChecksCount++;
        customerChecksTotal += (c.amount || 0);
      } else if (
        (c.type === 'given_check' || c.type === 'given_note') &&
        c.status === 'portfolio'
      ) {
        issuedChecksTotal += (c.amount || 0);
      }
    }

    // 2. İnsan Kaynakları & Bordro
    const activeEmployeesCount = employees.length;
    let sgkEmployees = 0;
    let dailyEmployees = 0;
    for (let i = 0; i < employees.length; i++) {
      if (employees[i].sgkStatus === 'sgk_li') sgkEmployees++;
      else dailyEmployees++;
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let totalNetPayroll = 0;
    let totalEmployerCost = 0;
    let unpaidPayrollsCount = 0;
    let unaccountedPayrollsCount = 0;

    for (let i = 0; i < payrollRecords.length; i++) {
      const p = payrollRecords[i];
      if (p.year === currentYear && p.month === currentMonth) {
        totalNetPayroll += (p.netSalary || 0);
        totalEmployerCost += (p.totalEmployerCost || 0);
        if (p.paymentStatus !== 'paid') unpaidPayrollsCount++;
        if (!p.isAccounted) unaccountedPayrollsCount++;
      }
    }

    let pendingAdvanceTotal = 0;
    for (let i = 0; i < advanceRequests.length; i++) {
      pendingAdvanceTotal += (advanceRequests[i].amount || 0);
    }

    // 3. Genel Muhasebe & KDV
    const totalJournals = journalEntries.length;
    let unbalancedJournals = 0;
    let kdv191Debit = 0;
    let kdv391Credit = 0;

    for (let i = 0; i < journalEntries.length; i++) {
      const j = journalEntries[i];
      if (!j.isBalanced) unbalancedJournals++;
      if (j.lines) {
        for (let l = 0; l < j.lines.length; l++) {
          const line = j.lines[l];
          if (line.accountCode?.startsWith('191')) kdv191Debit += (line.debit || 0);
          if (line.accountCode?.startsWith('391')) kdv391Credit += (line.credit || 0);
        }
      }
    }
    const netKdvDifference = kdv391Credit - kdv191Debit;

    // 4. Faturalar & İrsaliyeler
    let openSalesInvoicesCount = 0;
    let openSalesTotal = 0;
    let openPurchaseTotal = 0;

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (inv.paymentStatus !== 'paid') {
        const remaining = (inv.grandTotal || 0) - (inv.paidAmount || 0);
        if (inv.type === 'sales') {
          openSalesInvoicesCount++;
          openSalesTotal += remaining;
        } else if (inv.type === 'purchase') {
          openPurchaseTotal += remaining;
        }
      }
    }
    const uninvoicedWaybillsCount = waybills.length;

    // 5. Stok & Hammadde
    const lowStockProducts: typeof products = [];
    const categoryStats = { finished: 0, semi_finished: 0, raw_material: 0, accessory: 0 };

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if ((p.stock || 0) <= (p.minStock || 0)) {
        lowStockProducts.push(p);
      }
      if (p.categoryType === 'semi_finished') categoryStats.semi_finished++;
      else if (p.isRawMaterial || p.categoryType === 'raw_material') categoryStats.raw_material++;
      else if (p.categoryType === 'accessory') categoryStats.accessory++;
      else categoryStats.finished++;
    }

    // 6. Sipariş ve Sevkiyat
    let salesOrdersCount = 0;
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].type === 'sales') salesOrdersCount++;
    }

    let totalOrderQty = 0;
    let totalShippedQty = 0;
    for (let i = 0; i < orderItems.length; i++) {
      totalOrderQty += (orderItems[i].quantity || 0);
      totalShippedQty += (orderItems[i].shippedQuantity || orderItems[i].invoicedQuantity || 0);
    }
    const remainingToShip = Math.max(0, totalOrderQty - totalShippedQty);

    // 7. Üretim & Fabrika Hatları
    let activeWorkOrdersCount = 0;
    let totalProducedQty = 0;
    let totalInProductionQty = 0;
    const stageCounts = { kesim: 0, dikim: 0, montaj: 0, finisaj: 0 };

    for (let i = 0; i < workOrders.length; i++) {
      const wo = workOrders[i];
      if (wo.status === 'in_progress' || wo.status === 'pending') {
        activeWorkOrdersCount++;
        totalInProductionQty += (wo.quantity || 0);
      } else if (wo.status === 'completed') {
        totalProducedQty += (wo.quantity || 0);
      }

      if (wo.currentStage === 'cutting') stageCounts.kesim++;
      else if (wo.currentStage === 'sewing' || wo.currentStage === 'printing') stageCounts.dikim++;
      else if (wo.currentStage === 'assembly') stageCounts.montaj++;
      else if (wo.currentStage === 'finishing' || wo.currentStage === 'quality_packing') stageCounts.finisaj++;
    }

    return {
      income, expense, profit, cashBalance, bankBalance, totalLiquidAssets,
      customerChecksCount, customerChecksTotal, issuedChecksTotal,
      activeEmployeesCount, sgkEmployees, dailyEmployees,
      totalNetPayroll, totalEmployerCost, unpaidPayrollsCount,
      unaccountedPayrollsCount, pendingAdvancesCount: advanceRequests.length,
      pendingAdvanceTotal,
      totalJournals, unbalancedJournals, netKdvDifference, kdv191Debit, kdv391Credit,
      openSalesInvoicesCount, openSalesTotal, openPurchaseTotal,
      uninvoicedWaybillsCount,
      lowStockProducts,
      salesOrdersCount, totalOrderQty, totalShippedQty, remainingToShip,
      activeWorkOrdersCount, totalProducedQty, totalInProductionQty, stageCounts, categoryStats
    };
  }, [
    transactions, cashBoxes, bankAccounts, checks, employees, payrollRecords, advanceRequests,
    journalEntries, invoices, waybills, products, orders, orderItems, workOrders
  ]);

  const appSummary = useMemo(() => ({
    sirketFinansVeLikidite: {
      kasaBakiyeTL: stats.cashBalance,
      bankaBakiyeTL: stats.bankBalance,
      toplamLikitVarlikTL: stats.totalLiquidAssets,
      portfoyMusteriCekleriTL: stats.customerChecksTotal,
      portfoyCekAdedi: stats.customerChecksCount,
      verilenTedarikciCekleriTL: stats.issuedChecksTotal,
      toplamGelirTL: stats.income,
      toplamGiderTL: stats.expense,
      netKarZararTL: stats.profit
    },
    siparisVeSatisDurumu: {
      toplamSiparisAdedi: stats.salesOrdersCount,
      toplamSiparisUrunAdedi: stats.totalOrderQty,
      sevkEdilenUrunAdedi: stats.totalShippedQty,
      bekleyenSevkiyatAdedi: stats.remainingToShip,
      acikSatisFaturaTutariTL: stats.openSalesTotal,
      acikSatisFaturaAdedi: stats.openSalesInvoicesCount,
      faturalasmamisIrsaliyeSayisi: stats.uninvoicedWaybillsCount
    },
    stokVeUretim: {
      kritikStokAdedi: stats.lowStockProducts.length,
      kritikStoktakiUrunler: stats.lowStockProducts.slice(0, 5).map(p => ({
        kod: p.code,
        ad: p.name,
        mevcutStok: p.stock,
        minStok: p.minStock,
        birim: p.unit
      })),
      aktifIsEmriSayisi: stats.activeWorkOrdersCount,
      uretimdekiToplamAdet: stats.totalInProductionQty,
      tamamlananToplamUretimAdet: stats.totalProducedQty,
      uretimAsamaSayilari: stats.stageCounts
    },
    ikVeBordro: {
      toplamAktifPersonel: stats.activeEmployeesCount,
      sgkliPersonelSayisi: stats.sgkEmployees,
      sgksizGunlukPersonelSayisi: stats.dailyEmployees,
      toplamNetBordroTL: stats.totalNetPayroll,
      toplamIsverenMaliyetiTL: stats.totalEmployerCost,
      odenmemisBordroAdedi: stats.unpaidPayrollsCount,
      bekleyenAvansTalebiAdedi: stats.pendingAdvancesCount,
      bekleyenAvansTutariTL: stats.pendingAdvanceTotal
    },
    genelMuhasebe: {
      toplamYevmiyeFisSayisi: stats.totalJournals,
      dengesizFisSayisi: stats.unbalancedJournals,
      kdvDurumu: stats.netKdvDifference > 0 
        ? `Ödenecek KDV: ₺${stats.netKdvDifference.toFixed(2)}` 
        : `Devreden KDV: ₺${Math.abs(stats.netKdvDifference).toFixed(2)}`
    }
  }), [stats]);

  return {
    stats,
    appSummary,
    transactions,
    orders,
    products,
    inventoryLogs: [] as any[],
    contacts: [] as any[],
    accounts: [] as any[]
  };
}
