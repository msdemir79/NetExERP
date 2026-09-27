import { PackageCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SizedRowGroup } from '../../lib/assortmentHelpers';
import type { Contact } from '../../types';

interface PoTemplateMatrixProps {
  order: any;
  supplier: Contact | null;
  companyTitle: string;
  sizedGroups: SizedRowGroup[];
  uniqueSizes: string[];
  hasSizedItems: boolean;
  totalSizedQuantity: number;
}

export function PoTemplateMatrix({
  order,
  supplier,
  companyTitle,
  sizedGroups,
  uniqueSizes,
  hasSizedItems,
  totalSizedQuantity,
}: PoTemplateMatrixProps) {
  return (
                <div className="space-y-4">
                  {/* High Impact Matrix Header */}
                  <div className="border-b-4 border-indigo-900 pb-3 flex items-start justify-between">
                    <div>
                      <div className="inline-block bg-indigo-900 text-white px-3 py-1 rounded-lg text-xs font-black tracking-wider uppercase mb-1">
                        İMALAT & TEDARİKÇİ ASORTİ MATRİS FORMU
                      </div>
                      <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                        {companyTitle}
                      </h1>
                      <p className="text-xs font-bold text-indigo-700">
                        Taban, Saya & Yarı Mamul İmalat / Sevkiyat Asorti Planı
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="text-xs font-mono font-black text-indigo-950 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg inline-block">
                        SİPARİŞ NO: {order.orderNumber}
                      </div>
                      <p className="text-[10px] font-bold text-slate-600">
                        Tarih: {order.date ? new Date(order.date).toLocaleDateString('tr-TR') : '-'}
                      </p>
                      <p className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded inline-block">
                        Termin: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL İMALAT'}
                      </p>
                    </div>
                  </div>

                  {/* Supplier & Model Information Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-slate-300 rounded-xl p-3 bg-slate-50">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        TEDARİKÇİ / İMALATÇI ATÖLYE
                      </span>
                      <p className="text-sm font-black text-slate-900">{supplier?.name || 'Tedarikçi Firma'}</p>
                      {supplier?.contactPerson && <p className="text-xs text-slate-700">Yetkili: {supplier.contactPerson}</p>}
                      {supplier?.phone && <p className="text-xs text-slate-600">Tel: {supplier.phone}</p>}
                    </div>

                    <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/50">
                      <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider block mb-1">
                        TOPLAM SİPARİŞ HACMİ
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-indigo-950 font-mono">
                          {totalSizedQuantity.toLocaleString('tr-TR')}
                        </span>
                        <span className="text-xs font-bold text-indigo-700 uppercase">Çift Bedenli Malzeme</span>
                      </div>
                      {sizedGroups[0]?.moldGroup && (
                        <p className="text-xs font-bold text-indigo-900 mt-1">
                          Seri: {sizedGroups[0].moldGroup}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* LARGE HIGH-CONTRAST SIZE MATRIX TABLE */}
                  {hasSizedItems ? (
                    sizedGroups.map((g, gIdx) => (
                      <div key={gIdx} className="border-2 border-slate-900 rounded-xl overflow-hidden shadow-sm">
                        {/* Group Header */}
                        <div className="bg-slate-900 text-white p-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black uppercase tracking-wide text-amber-400">
                                {g.productName}
                              </span>
                              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                                Kod: {g.productCode}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-3">
                              <span>Renk: <b className="text-white uppercase">{g.color}</b></span>
                              {g.moldCode && <span>Kalıp No: <b className="text-white">{g.moldCode}</b></span>}
                              {g.moldGroup && <span>Seri: <b className="text-white">{g.moldGroup}</b></span>}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs text-slate-400 block font-bold">Parti Miktarı</span>
                            <span className="text-lg font-black font-mono text-emerald-400">
                              {g.totalQuantity.toLocaleString('tr-TR')} {g.unit}
                            </span>
                          </div>
                        </div>

                        {/* Large Matrix Grid */}
                        <div className="p-3 bg-white">
                          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 text-center">
                            {uniqueSizes.map(size => {
                              const qty = g.sizeQuantities[size] || 0;
                              return (
                                <div 
                                  key={size} 
                                  className={cn(
                                    "p-2.5 rounded-lg border-2 flex flex-col items-center justify-center transition-all",
                                    qty > 0 
                                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-950" 
                                      : "border-slate-200 bg-slate-50 text-slate-400 opacity-60"
                                  )}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 mb-0.5">
                                    NO {size}
                                  </span>
                                  <span className="text-lg font-black font-mono">
                                    {qty > 0 ? `${qty.toLocaleString('tr-TR')} Çift` : '-'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Packaging & Quality Check Footer */}
                        <div className="bg-slate-100 p-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-slate-700" />
                            <span className="font-bold text-slate-800">
                              Koli / Paket Dağılımı:
                            </span>
                            <span className="font-mono font-black text-indigo-900">
                              {Math.floor(g.totalQuantity / 12)} Koli (12'li Asorti) {g.totalQuantity % 12 > 0 ? `+ ${g.totalQuantity % 12} Çift Tekil` : ''}
                            </span>
                          </div>

                          <div className="text-slate-600 font-bold">
                            Birim Fiyat: {g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ | Toplam: {g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center text-slate-500">
                      Bu siparişte bedenli malzeme bulunmamaktadır.
                    </div>
                  )}

                  {/* Quality & Production Inspection Specifications */}
                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                      İMALAT VE KABUL KALİTE PARAMETRELERİ:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Kalıp Numarası:</span>
                        <span className="font-black text-slate-900">{sizedGroups[0]?.moldCode || '018 Standart'}</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Shore Sertlik Değeri:</span>
                        <span className="font-black text-slate-900">55 - 60 Shore A</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Yüzey & Çapak:</span>
                        <span className="font-black text-slate-900">Çapaksız / Temiz Enjeksiyon</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Eşleşme:</span>
                        <span className="font-black text-slate-900">Sağ - Sol Çift Bağlı</span>
                      </div>
                    </div>
                  </div>

                  {/* Workshop Double Signatures */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="border border-slate-300 rounded-xl p-3 text-center min-h-[90px] flex flex-col justify-between">
                      <p className="font-black text-[11px] text-slate-900">TESLİM EDEN (İMALATÇI / TEDARİKÇİ)</p>
                      <p className="text-[10px] text-slate-500">Ad / Soyad / İmza</p>
                    </div>
                    <div className="border border-slate-300 rounded-xl p-3 text-center min-h-[90px] flex flex-col justify-between">
                      <p className="font-black text-[11px] text-slate-900">TESLİM ALAN (FABRİKA DEPO / KALİTE KONTROL)</p>
                      <p className="text-[10px] text-slate-500">Ad / Soyad / İmza / Kaşe</p>
                    </div>
                  </div>
                </div>
  );
}
