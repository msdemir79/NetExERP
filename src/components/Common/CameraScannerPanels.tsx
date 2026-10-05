import React from 'react';
import {
  Minus,
  Plus,
  CheckCircle2,
  Barcode,
  Trash2,
  Truck,
  Scissors,
  Layers,
  Hammer,
  Sparkles,
} from 'lucide-react';
import type { Product, WorkOrder, Contact, Waybill } from '../../types';
import { ContactSelect } from '../Contacts/ContactSelect';

export interface ReceiptBasketItem {
  productId: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  size?: string;
  color?: string;
}

export interface DispatchBasketItem {
  productId: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  size?: string;
  color?: string;
  unitPrice: number;
}

interface StockCountPanelProps {
  matchedProduct: Product | null;
  matchedVariant: { size: string; color?: string; stock?: number } | null;
  lastScannedCode: string;
  countedQty: number;
  setCountedQty: React.Dispatch<React.SetStateAction<number>>;
  handleSaveStockCount: () => Promise<void>;
}

export function StockCountPanel({
  matchedProduct,
  matchedVariant,
  lastScannedCode,
  countedQty,
  setCountedQty,
  handleSaveStockCount,
}: StockCountPanelProps) {
  return (
          <div className="space-y-3">
            {matchedProduct ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-4 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md">
                      {matchedProduct.categoryType === 'raw_material' ? 'Hammadde' : matchedProduct.categoryType === 'semi_finished' ? 'Yarı Mamul' : 'Mamul Ayakkabı'}
                    </span>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      {matchedProduct.name}
                    </h3>
                    <p className="text-xs font-mono font-bold text-slate-500">
                      Ürün Kodu: {matchedProduct.code} • Barkod: {lastScannedCode || matchedProduct.barcode}
                    </p>
                    {matchedVariant && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold mt-1">
                        <span>Beden / Numara: {matchedVariant.size}</span>
                        {matchedVariant.color && <span>• Renk: {matchedVariant.color}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase">Raf / Lokasyon</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                      {matchedProduct.shelf ? `Raf: ${matchedProduct.shelf}` : 'Depo Standart'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {matchedProduct.location || 'Merkez Depo'}
                    </span>
                  </div>
                </div>

                {/* Physical Count Comparison Box */}
                <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Sistem Stoğu</span>
                    <span className="text-lg font-black text-slate-700 dark:text-slate-300 font-mono block">
                      {matchedVariant?.stock !== undefined ? matchedVariant.stock : (matchedProduct.stock || 0)}
                    </span>
                    <span className="text-[10px] text-slate-500">{matchedProduct.unit || 'Çift'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase block">Sayılan Fiili Stok</span>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setCountedQty(Math.max(0, countedQty - 1))}
                        className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={countedQty}
                        onChange={(e) => setCountedQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 text-center py-1 px-1 rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-800 font-black text-base text-indigo-700 dark:text-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => setCountedQty(countedQty + 1)}
                        className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Sayım Farkı</span>
                    {(() => {
                      const sys = matchedVariant?.stock !== undefined ? matchedVariant.stock : (matchedProduct.stock || 0);
                      const diff = countedQty - sys;
                      return (
                        <>
                          <span className={`text-lg font-black font-mono block ${diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                          <span className="text-[10px] font-bold">
                            {diff === 0 ? 'Farksız (Eşit)' : diff > 0 ? 'Fazla Stok' : 'Eksik Stok'}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Quick Increment Buttons & Save */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Hızlı Ekle:</span>
                    {[+1, +5, +10, -1, -5].map(step => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setCountedQty(Math.max(0, countedQty + step))}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono font-bold text-xs rounded-lg cursor-pointer"
                      >
                        {step > 0 ? `+${step}` : step}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveStockCount}
                    className="py-2 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sayımı Onayla & Stoğu Güncelle</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-1 text-slate-500 text-xs bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                <Barcode className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  Lütfen okutmak istediğiniz ürünün barkodunu kameraya tutun
                </p>
                <p className="text-[11px]">
                  Deri, taban, astar, bağcık veya mamul ayakkabı kutu barkodu taranabilir.
                </p>
              </div>
            )}
          </div>
  );
}

interface GoodsReceiptPanelProps {
  supplierId: number;
  setSupplierId: React.Dispatch<React.SetStateAction<number>>;
  suppliers: Contact[];
  receiptDocumentNo: string;
  setReceiptDocumentNo: React.Dispatch<React.SetStateAction<string>>;
  receiptBasket: ReceiptBasketItem[];
  setReceiptBasket: React.Dispatch<React.SetStateAction<ReceiptBasketItem[]>>;
  handleCompleteGoodsReceipt: () => Promise<void>;
}

export function GoodsReceiptPanel({
  supplierId,
  setSupplierId,
  suppliers,
  receiptDocumentNo,
  setReceiptDocumentNo,
  receiptBasket,
  setReceiptBasket,
  handleCompleteGoodsReceipt,
}: GoodsReceiptPanelProps) {
  return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Tedarikçi Firma</label>
                <ContactSelect
                  contacts={suppliers}
                  value={supplierId || null}
                  createType="supplier"
                  placeholder="Genel Tedarikçi / Depo Transferi"
                  emptyOptionLabel="Genel Tedarikçi / Depo Transferi"
                  onChange={(id) => setSupplierId(id ?? 0)}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">İrsaliye / Fatura / Belge No</label>
                <input
                  type="text"
                  placeholder="Örn: IRS-2026-8812"
                  value={receiptDocumentNo}
                  onChange={(e) => setReceiptDocumentNo(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-medium text-xs"
                />
              </div>
            </div>

            {/* Receipt Scanned Items Basket */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800">
                <span className="text-xs font-black uppercase text-emerald-900 dark:text-emerald-200">
                  Okutulan Mal Kabul Listesi ({receiptBasket.length} Kalem)
                </span>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                  Toplam: {receiptBasket.reduce((sum, it) => sum + it.quantity, 0)} Birim
                </span>
              </div>

              {receiptBasket.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                  {receiptBasket.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Kod: {item.code} {item.size ? `• Beden: ${item.size}` : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...receiptBasket];
                              if (updated[idx].quantity > 1) {
                                updated[idx].quantity -= 1;
                                setReceiptBasket(updated);
                              } else {
                                setReceiptBasket(receiptBasket.filter((_, i) => i !== idx));
                              }
                            }}
                            className="p-1 rounded bg-slate-200 dark:bg-slate-700"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-black font-mono px-2 text-sm">
                            {item.quantity} {item.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...receiptBasket];
                              updated[idx].quantity += 1;
                              setReceiptBasket(updated);
                            }}
                            className="p-1 rounded bg-slate-200 dark:bg-slate-700"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setReceiptBasket(receiptBasket.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Gelen hammadde veya mamul barkodlarını kameraya sırayla okutunuz.
                </div>
              )}
            </div>

            {receiptBasket.length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCompleteGoodsReceipt}
                  className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mal Kabulünü Tamamla & Stoğa Ekle</span>
                </button>
              </div>
            )}
          </div>
  );
}

interface WaybillDispatchPanelProps {
  customerId: number;
  setCustomerId: React.Dispatch<React.SetStateAction<number>>;
  customers: Contact[];
  dispatchBasket: DispatchBasketItem[];
  setDispatchBasket: React.Dispatch<React.SetStateAction<DispatchBasketItem[]>>;
  handleCreateWaybillFromDispatch: () => Promise<void>;
  createdWaybill: Waybill | null;
}

export function WaybillDispatchPanel({
  customerId,
  setCustomerId,
  customers,
  dispatchBasket,
  setDispatchBasket,
  handleCreateWaybillFromDispatch,
  createdWaybill,
}: WaybillDispatchPanelProps) {
  return (
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Sevk Edilecek Cari / Müşteri</label>
              <ContactSelect
                contacts={customers}
                value={customerId || null}
                createType="customer"
                placeholder="Perakende / Muhtelif Alıcı"
                emptyOptionLabel="Perakende / Muhtelif Alıcı"
                onChange={(id) => setCustomerId(id ?? 0)}
              />
            </div>

            {/* Dispatch Scanned Items Basket */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="bg-amber-50 dark:bg-amber-950/40 px-4 py-2 flex items-center justify-between border-b border-amber-200 dark:border-amber-800">
                <span className="text-xs font-black uppercase text-amber-900 dark:text-amber-200">
                  Sevk Edilecek Ayakkabı / Koli Listesi ({dispatchBasket.length} Kalem)
                </span>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 font-mono">
                  Toplam: {dispatchBasket.reduce((sum, it) => sum + it.quantity, 0)} Çift
                </span>
              </div>

              {dispatchBasket.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                  {dispatchBasket.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Kod: {item.code} {item.size ? `• Beden: ${item.size}` : ''} • Birim Fiyat: {item.unitPrice} ₺
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-black font-mono text-sm text-indigo-900 dark:text-indigo-300">
                          {item.quantity} {item.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDispatchBasket(dispatchBasket.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Müşteriye sevk edilecek ayakkabı koli veya tekil barkodlarını kameraya okutunuz.
                </div>
              )}
            </div>

            {dispatchBasket.length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCreateWaybillFromDispatch}
                  className="py-2.5 px-6 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Truck className="w-4 h-4" />
                  <span>Sevk İrsaliyesi Oluştur & Depodan Düş</span>
                </button>
              </div>
            )}

            {createdWaybill && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">
                    İrsaliye Başarıyla Oluşturuldu: {createdWaybill.waybillNumber}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 font-mono">
                  {createdWaybill.totalQuantity || 1} Kalem / Çift Sevk Edildi
                </span>
              </div>
            )}
          </div>
  );
}

interface ProductionWoPanelProps {
  matchedWorkOrder: WorkOrder | null;
  targetStageFromBarcode: string | null;
  handleAdvanceWorkOrderStage: (targetStage: string) => Promise<void>;
}

export function ProductionWoPanel({
  matchedWorkOrder,
  targetStageFromBarcode,
  handleAdvanceWorkOrderStage,
}: ProductionWoPanelProps) {
  return (
          <div className="space-y-3">
            {matchedWorkOrder ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-4 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-md">
                      Refakat Kartı Takip No: #{matchedWorkOrder.barcode}
                    </span>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Sipariş: {matchedWorkOrder.orderNumber || 'Stok Üretimi'} • {matchedWorkOrder.customerName || 'Fabrika'}
                    </h3>
                    <p className="text-xs font-bold text-slate-600">
                      Planlanan Miktar: <strong className="text-purple-700 font-mono">{matchedWorkOrder.quantity} Çift</strong>
                      {matchedWorkOrder.color && ` • Renk: ${matchedWorkOrder.color}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase">Aktif Aşama</span>
                    <span className="px-3 py-1 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 font-black text-xs rounded-full inline-block mt-0.5 animate-pulse">
                      {matchedWorkOrder.currentStage.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Direct Stage Advancement from Scanned Barcode */}
                {targetStageFromBarcode && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/50 border border-purple-300 dark:border-purple-700 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-purple-950 dark:text-purple-200 block">
                        Okutulan Aşama Barkodu: {targetStageFromBarcode.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-purple-700 dark:text-purple-400">
                        İş emrini bu aşamaya ilerletmek ister misiniz?
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdvanceWorkOrderStage(targetStageFromBarcode)}
                      className="py-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl cursor-pointer"
                    >
                      Aşamayı Onayla
                    </button>
                  </div>
                )}

                {/* 4-Stage Progress Quick Advance Buttons */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Aşama Onay ve Bant İlerleme Adımları
                  </span>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {[
                      { key: 'cutting', label: '1. Kesim', icon: Scissors },
                      { key: 'sewing', label: '2. Dikim/Saya', icon: Layers },
                      { key: 'assembly', label: '3. Montaj', icon: Hammer },
                      { key: 'finishing', label: '4. Finisaj', icon: Sparkles }
                    ].map(st => {
                      const isPast = ['cutting', 'sewing', 'assembly', 'finishing', 'completed'].indexOf(matchedWorkOrder.currentStage) >= ['cutting', 'sewing', 'assembly', 'finishing'].indexOf(st.key);
                      const isCurrent = matchedWorkOrder.currentStage === st.key;

                      return (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => handleAdvanceWorkOrderStage(st.key)}
                          className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-105'
                              : isPast
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200'
                          }`}
                        >
                          <st.icon className="w-4 h-4" />
                          <span className="font-bold text-[11px]">{st.label}</span>
                          <span className="text-[9px] opacity-80">
                            {isCurrent ? 'Aktif' : isPast ? 'Tamamlandı' : 'Bekliyor'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-1 text-slate-500 text-xs bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  Lütfen üretim bandındaki refakat kartının parti veya aşama barkodunu okutun
                </p>
                <p className="text-[11px]">
                  Örnek Takip No: WO-001024 veya Aşama Kodu: WO-001024-KES
                </p>
              </div>
            )}
          </div>
  );
}
