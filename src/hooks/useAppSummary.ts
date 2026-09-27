import { useMemo } from 'react';
import { getDashboardSummary, type DashboardStats, type DashboardSummary } from '../api/client';
import { useApiQueryFull } from './useApiQuery';

/**
 * Yönetici panosu özeti.
 *
 * Eskiden ~14 tabloyu TAM çekip istemcide döngülerle toplulaştırıyordu; bunun
 * yerine tek bir `/ops/dashboard-summary` isteği atılır ve tüm özetler SQL
 * SUM/COUNT/GROUP BY ile sunucuda hesaplanır. İlgili kaynaklardan herhangi biri
 * değiştiğinde (SSE) özet otomatik yenilenir.
 */
const DASHBOARD_RESOURCES = [
  'transactions', 'cashBoxes', 'bankAccounts', 'employees', 'payrollRecords', 'advanceRequests',
  'products', 'orders', 'orderItems', 'workOrders', 'journalEntries', 'checks', 'invoices', 'waybills',
];

const EMPTY_STATS: DashboardStats = {
  income: 0, expense: 0, profit: 0,
  cashBalance: 0, bankBalance: 0, totalLiquidAssets: 0,
  customerChecksCount: 0, customerChecksTotal: 0, issuedChecksTotal: 0,
  activeEmployeesCount: 0, sgkEmployees: 0, dailyEmployees: 0,
  totalNetPayroll: 0, totalEmployerCost: 0, unpaidPayrollsCount: 0, unaccountedPayrollsCount: 0,
  pendingAdvancesCount: 0, pendingAdvanceTotal: 0,
  totalJournals: 0, unbalancedJournals: 0, netKdvDifference: 0, kdv191Debit: 0, kdv391Credit: 0,
  openSalesInvoicesCount: 0, openSalesTotal: 0, openPurchaseTotal: 0,
  uninvoicedWaybillsCount: 0,
  lowStockProducts: [], lowStockCount: 0,
  salesOrdersCount: 0, totalOrderQty: 0, totalShippedQty: 0, remainingToShip: 0,
  activeWorkOrdersCount: 0, totalProducedQty: 0, totalInProductionQty: 0,
  stageCounts: { kesim: 0, dikim: 0, montaj: 0, finisaj: 0 },
  categoryStats: { finished: 0, semi_finished: 0, raw_material: 0, accessory: 0 },
};

export function useAppSummary(): {
  stats: DashboardStats;
  productCount: number;
  recentTransactions: DashboardSummary['recentTransactions'];
  recentOrders: DashboardSummary['recentOrders'];
  cashFlowByDay: DashboardSummary['cashFlowByDay'];
  loading: boolean;
} {
  const { data, loading } = useApiQueryFull<DashboardSummary>(
    () => getDashboardSummary(),
    [],
    DASHBOARD_RESOURCES,
  );

  return useMemo(() => ({
    stats: data?.stats ?? EMPTY_STATS,
    productCount: data?.productCount ?? 0,
    recentTransactions: data?.recentTransactions ?? [],
    recentOrders: data?.recentOrders ?? [],
    cashFlowByDay: data?.cashFlowByDay ?? [],
    loading: loading && !data,
  }), [data, loading]);
}
