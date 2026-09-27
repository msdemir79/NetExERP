import React from 'react';
import { ShoppingBag, Truck, X } from 'lucide-react';

export function OrderImportSelector({ pendingOrders, importOrderItems, setIsOrderSelectorOpen }: {
  pendingOrders: any[];
  importOrderItems: (order: any) => void;
  setIsOrderSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
              Faturalandırılacak Siparişi Seçiniz
            </h3>
          </div>
          <button 
            onClick={() => setIsOrderSelectorOpen(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Bu cariye ait henüz faturalanmamış açık sipariş bulunmuyor.
            </div>
          ) : (
            pendingOrders.map((ord: any) => (
              <div 
                key={`inv-pending-ord-${ord.id}`}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                onClick={() => importOrderItems(ord)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-sm">{ord.orderNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded font-bold">
                      {new Date(ord.date).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Toplam Kalem: {ord.items?.length || 0} adet ürün kalemi kalan miktar içeriyor.
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right font-mono">
                    <div className="text-xs text-slate-400">Sipariş Tutarı</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      ₺{ord.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      importOrderItems(ord);
                    }}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                  >
                    Aktar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WaybillImportSelector({ pendingWaybills, importWaybillItems, setIsWaybillSelectorOpen }: {
  pendingWaybills: any[];
  importWaybillItems: (wb: any) => Promise<void>;
  setIsWaybillSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
              Faturalandırılacak İrsaliyeyi Seçiniz
            </h3>
          </div>
          <button 
            onClick={() => setIsWaybillSelectorOpen(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {pendingWaybills.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Bu cariye ait henüz faturalanmamış açık sevk irsaliyesi bulunmuyor.
            </div>
          ) : (
            pendingWaybills.map((wb: any) => (
              <div 
                key={`inv-sub-wb-${wb.id}`}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-300 hover:bg-purple-50/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                onClick={() => importWaybillItems(wb)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-sm">{wb.waybillNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded font-bold">
                      {new Date(wb.date).toLocaleDateString('tr-TR')}
                    </span>
                    {wb.orderNumber && (
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold">
                        Sipariş: {wb.orderNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Toplam Miktar: {wb.totalQuantity || 0} Çift | Kalem Sayısı: {wb.items?.length || 0}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right font-mono">
                    <div className="text-xs text-slate-400">İrsaliye Tutarı</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      ₺{Number(wb.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      importWaybillItems(wb);
                    }}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                  >
                    Aktar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
