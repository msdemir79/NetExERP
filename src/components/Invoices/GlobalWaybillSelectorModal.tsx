import { useState } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { api } from '../../api/client';
import { Receipt, Search, X, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';

// -----------------------------------------------------------------------------------------
// GLOBAL WAYBILL SELECTOR MODAL (Easily invoice any open waybill across all contacts)
// -----------------------------------------------------------------------------------------
export default function GlobalWaybillSelectorModal({
  isOpen,
  onClose,
  onSelectWaybill
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectWaybill: (waybill: any) => void;
}) {
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'purchase'>('all');
  const [search, setSearch] = useState('');

  const waybills = useApiQuery(() => api.waybills.list(), [], ['waybills']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  if (!isOpen) return null;

  const pendingWaybills = waybills?.filter(w => {
    if (w.status !== 'issued') return false;
    if (w.invoicedStatus === 'invoiced') return false;
    if (filterType !== 'all' && w.type !== filterType) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const contact = contacts?.find(c => c.id === w.contactId);
      const matchNumber = w.waybillNumber?.toLowerCase().includes(term);
      const matchContact = contact?.name?.toLowerCase().includes(term);
      const matchOrder = w.orderNumber?.toLowerCase().includes(term);
      return matchNumber || matchContact || matchOrder;
    }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Faturalandırılacak İrsaliyeler</h3>
              <p className="text-[11px] text-slate-400">
                Depodan sevk edilmiş ve henüz faturası kesilmemiş açık irsaliyeler
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'all' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Tümü ({waybills?.filter(w => w.status === 'issued' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('sales')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'sales' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Satış Sevk ({waybills?.filter(w => w.status === 'issued' && w.type === 'sales' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('purchase')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'purchase' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Alış İrsaliyesi ({waybills?.filter(w => w.status === 'issued' && w.type === 'purchase' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İrsaliye no veya cari ara..."
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
            />
          </div>
        </div>

        {/* Waybill List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {pendingWaybills.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
              <p className="font-bold">Faturalanmayı bekleyen açık irsaliye bulunmuyor.</p>
              <p className="text-[11px] mt-1 text-slate-400">Tüm sevk edilmiş irsaliyeler faturalandırılmış veya henüz irsaliye düzenlenmemiş.</p>
            </div>
          ) : (
            pendingWaybills.map((wb) => {
              const contact = contacts?.find(c => c.id === wb.contactId);
              const isSales = wb.type === 'sales';
              return (
                <div
                  key={`global-wb-${wb.id}`}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-300 hover:bg-purple-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 mt-0.5",
                      isSales ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {isSales ? 'SEVK' : 'ALIŞ'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">{wb.waybillNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-md font-semibold">
                          {new Date(wb.date).toLocaleDateString('tr-TR')}
                        </span>
                        {wb.orderNumber && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold">
                            Sipariş: {wb.orderNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                        {contact?.name || 'Bilinmeyen Cari'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                        <span>Toplam Adet: <strong>{wb.totalQuantity} Çift</strong></span>
                        {wb.vehiclePlate && <span>Plaka: {wb.vehiclePlate}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">İrsaliye Tutarı</div>
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                        ₺{Number(wb.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectWaybill(wb)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Faturalandır</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
