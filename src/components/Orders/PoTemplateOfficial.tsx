import { Building2, MapPin, Boxes } from 'lucide-react';
import { cn } from '../../lib/utils';
import { numberToTurkishWords, type SizedRowGroup } from '../../lib/assortmentHelpers';
import type { Contact, CompanySettings } from '../../types';

interface PoTemplateOfficialProps {
  order: any;
  supplier: Contact | null;
  companySettings: CompanySettings | null;
  companyTitle: string;
  companyName: string;
  sizedGroups: SizedRowGroup[];
  uniqueSizes: string[];
  nonSizedItems: any[];
  hasSizedItems: boolean;
  totalSizedQuantity: number;
  sizeColumnTotals: { [size: string]: number };
  currency: string;
  customInstructions: string;
}

export function PoTemplateOfficial({
  order,
  supplier,
  companySettings,
  companyTitle,
  companyName,
  sizedGroups,
  uniqueSizes,
  nonSizedItems,
  hasSizedItems,
  totalSizedQuantity,
  sizeColumnTotals,
  currency,
  customInstructions,
}: PoTemplateOfficialProps) {
  return (
                <div className="space-y-4">
                  {/* FORM HEADER: LOGO & COMPANY INFO & ORDER BADGES */}
                  <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap items-start justify-between gap-4">
                    {/* Left: Buyer Company Info */}
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 mb-1">
                        {companySettings?.logo ? (
                          <img
                            src={companySettings.logo}
                            alt="Logo"
                            className="h-10 w-auto max-w-[140px] object-contain"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-sm tracking-wider">
                            {companyName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                            {companyTitle}
                          </h1>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Satınalma & Tedarik Yönetimi
                          </p>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-600 space-y-0.5 mt-1 leading-tight">
                        {companySettings?.address && <p>{companySettings.address} {companySettings.city ? `- ${companySettings.city}` : ''}</p>}
                        <p>
                          {companySettings?.taxOffice && <span>V.D.: {companySettings.taxOffice} </span>}
                          {companySettings?.taxNumber && <span>/ V.No: {companySettings.taxNumber}</span>}
                        </p>
                        <p>
                          {companySettings?.phone && <span>Tel: {companySettings.phone} </span>}
                          {companySettings?.email && <span>| E-Posta: {companySettings.email}</span>}
                        </p>
                      </div>
                    </div>

                    {/* Right: PO Document Metadata Box */}
                    <div className="text-right min-w-[180px]">
                      <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-center mb-1">
                        <span className="text-[11px] font-black tracking-wider uppercase">
                          SATINALMA SİPARİŞİ
                        </span>
                        <span className="block text-[8px] font-mono tracking-widest text-slate-300">PURCHASE ORDER & CONTRACT</span>
                      </div>

                      <div className="text-[10px] space-y-0.5 text-slate-800">
                        <p className="font-mono font-black text-xs text-indigo-900">
                          Sipariş No: <span className="font-black underline">{order.orderNumber}</span>
                        </p>
                        <p>
                          <span className="font-bold text-slate-500">Sipariş Tarihi:</span>{' '}
                          <span className="font-mono font-bold">
                            {order.date ? new Date(order.date).toLocaleDateString('tr-TR') : '-'}
                          </span>
                        </p>
                        <p className="bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded text-amber-900 font-bold inline-block mt-0.5">
                          Termin / Teslim: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL SEVKİYAT'}
                        </p>
                        {order.currency && (
                          <p className="text-[9px] text-slate-500 font-bold">
                            Para Birimi: <span className="text-slate-900">{order.currency}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* FORMAL COVER LETTER INTRO */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 leading-relaxed">
                    <p className="font-bold text-slate-900 mb-0.5">Sayın {supplier?.name || 'Tedarikçi Yetkilisi'},</p>
                    <p>
                      Aşağıda kod, renk, teknik detay ve <b>beden asorti dağılımı</b> belirtilen malzemelerin, belirtilen termin tarihinde eksiksiz, 
                      kalite standartlarımıza ve numune onayına uygun olarak fabrikamıza sevk edilmesini rica ederiz.
                    </p>
                  </div>

                  {/* SUPPLIER & DELIVERY PARTY BOXES */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Supplier Box */}
                    <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/70">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="text-[9px] font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-indigo-700" /> TEDARİKÇİ / SATICI FİRMA
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">Cari Kodu: {supplier?.code || '-'}</span>
                      </div>
                      <div className="space-y-0.5 text-[10px]">
                        <p className="font-black text-slate-900 text-[11px] leading-tight">
                          {supplier?.name || 'Belirtilmemiş Tedarikçi'}
                        </p>
                        {supplier?.contactPerson && (
                          <p className="text-slate-700 font-semibold">Yetkili: {supplier.contactPerson}</p>
                        )}
                        {supplier?.phone && (
                          <p className="text-slate-600">Tel: {supplier.phone}</p>
                        )}
                        {supplier?.email && (
                          <p className="text-slate-600">E-Posta: {supplier.email}</p>
                        )}
                        {supplier?.taxNumber && (
                          <p className="text-slate-600">
                            V.D.: {supplier.taxOffice || '-'} / V.No: {supplier.taxNumber}
                          </p>
                        )}
                        {supplier?.address && (
                          <p className="text-slate-600 line-clamp-2">Adres: {supplier.address}</p>
                        )}
                      </div>
                    </div>

                    {/* Delivery / Shipping Destination Box */}
                    <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/70">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-900 tracking-wider flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-700" /> TESLİMAT & FATURA BİLGİSİ
                        </span>
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                          Fabrika Giriş Deposu
                        </span>
                      </div>
                      <div className="space-y-0.5 text-[10px]">
                        <p className="font-black text-slate-900 leading-tight">
                          {companyTitle}
                        </p>
                        <p className="text-slate-600">
                          Teslimat Deposu: {companySettings?.address || 'Fabrika Giriş Deposu'}
                        </p>
                        <p className="text-slate-600">
                          İl / İlçe: {companySettings?.city || 'İstanbul'}
                        </p>
                        <p className="text-slate-600">
                          Sipariş Sorumlusu: Satınalma Departmanı
                        </p>
                        <p className="text-slate-600">
                          İrtibat: {companySettings?.phone || '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ASORTİ & BEDEN DAĞILIM MATRİSİ */}
                  {hasSizedItems && (
                    <div className="border border-indigo-200 rounded-lg overflow-hidden">
                      <div className="bg-indigo-900 text-white px-3 py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-indigo-300" />
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            RENK & BEDEN ASORTİ DAĞILIM MATRİSİ
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-indigo-200">
                          Toplam: {totalSizedQuantity.toLocaleString('tr-TR')} Çift
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-center border-collapse text-[10px]">
                          <thead className="bg-indigo-50 border-b border-indigo-200 text-indigo-950 font-black">
                            <tr>
                              <th className="p-1.5 text-left border-r border-indigo-200 min-w-[130px]">Ürün / Malzeme Adı</th>
                              <th className="p-1.5 border-r border-indigo-200 min-w-[60px]">Renk</th>
                              {uniqueSizes.map(size => (
                                <th key={size} className="p-1.5 border-r border-indigo-200 min-w-[28px] font-mono text-[11px] bg-indigo-100/70">
                                  {size}
                                </th>
                              ))}
                              <th className="p-1.5 border-r border-indigo-200 bg-indigo-100 min-w-[50px]">Top. Çift</th>
                              <th className="p-1.5 border-r border-indigo-200 min-w-[55px] text-right">Birim Fiyat</th>
                              <th className="p-1.5 min-w-[65px] text-right bg-indigo-100/50">Tutar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium">
                            {sizedGroups.map((g, idx) => (
                              <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}>
                                <td className="p-1.5 text-left border-r border-slate-200">
                                  <div className="font-bold text-slate-900">{g.productName}</div>
                                  <div className="text-[8px] font-mono text-slate-500">{g.productCode}</div>
                                  {g.moldCode && (
                                    <div className="text-[8px] font-bold text-indigo-700">Kalıp: {g.moldCode}</div>
                                  )}
                                </td>
                                <td className="p-1.5 border-r border-slate-200 font-bold uppercase text-slate-800">
                                  {g.color}
                                </td>
                                {uniqueSizes.map(size => {
                                  const qty = g.sizeQuantities[size];
                                  return (
                                    <td 
                                      key={size} 
                                      className={cn(
                                        "p-1.5 border-r border-slate-200 font-mono text-[10px]",
                                        qty ? "font-black text-slate-900 bg-indigo-50/40" : "text-slate-300"
                                      )}
                                    >
                                      {qty ? qty.toLocaleString('tr-TR') : '-'}
                                    </td>
                                  );
                                })}
                                <td className="p-1.5 border-r border-slate-200 font-black font-mono text-indigo-900 bg-indigo-50/80">
                                  {g.totalQuantity.toLocaleString('tr-TR')} {g.unit}
                                </td>
                                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                                  {g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                                <td className="p-1.5 text-right font-mono font-black text-slate-900 bg-indigo-50/30">
                                  {g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                              </tr>
                            ))}

                            {/* Totals Row */}
                            <tr className="bg-indigo-100/90 font-black text-indigo-950 border-t-2 border-indigo-300">
                              <td colSpan={2} className="p-1.5 text-left border-r border-indigo-300 uppercase tracking-wider">
                                BEDEN TOPLAMLARI
                              </td>
                              {uniqueSizes.map(size => (
                                <td key={size} className="p-1.5 border-r border-indigo-300 font-mono text-[11px]">
                                  {sizeColumnTotals[size] ? sizeColumnTotals[size].toLocaleString('tr-TR') : '-'}
                                </td>
                              ))}
                              <td className="p-1.5 border-r border-indigo-300 font-mono text-[11px] text-indigo-950">
                                {totalSizedQuantity.toLocaleString('tr-TR')} Çift
                              </td>
                              <td colSpan={2} className="p-1.5 text-right font-mono text-[11px]">
                                {sizedGroups.reduce((acc, g) => acc + g.totalAmount, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DİĞER MALZEME LİSTESİ */}
                  {nonSizedItems.length > 0 && (
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {hasSizedItems ? 'DİĞER MALZEME & HAMMADDE KALEMLERİ' : 'SİPARİŞ KALEMLERİ LİSTESİ'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-300">
                          {nonSizedItems.length} Kalem Malzeme
                        </span>
                      </div>

                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead className="bg-slate-100 border-b border-slate-300 font-black text-slate-800">
                          <tr>
                            <th className="p-1.5 w-8 text-center">#</th>
                            <th className="p-1.5">Malzeme Kodu & Adı</th>
                            <th className="p-1.5 text-center">Renk / Özellik</th>
                            <th className="p-1.5 text-center">Miktar</th>
                            <th className="p-1.5 text-center">Birim</th>
                            <th className="p-1.5 text-right">Birim Fiyat</th>
                            <th className="p-1.5 text-center">KDV %</th>
                            <th className="p-1.5 text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {nonSizedItems.map((item, idx) => {
                            const price = Number(item.unitPrice || 0);
                            const qty = Number(item.quantity || 0);
                            const total = Number(item.total || qty * price);
                            return (
                              <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}>
                                <td className="p-1.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                                <td className="p-1.5">
                                  <div className="font-bold text-slate-900">{item.productName}</div>
                                  <div className="text-[8px] font-mono text-slate-500">{item.productCode}</div>
                                </td>
                                <td className="p-1.5 text-center font-bold uppercase text-slate-700">
                                  {item.color || '-'}
                                </td>
                                <td className="p-1.5 text-center font-black font-mono text-slate-900">
                                  {qty.toLocaleString('tr-TR')}
                                </td>
                                <td className="p-1.5 text-center text-slate-600 font-bold">
                                  {item.unit}
                                </td>
                                <td className="p-1.5 text-right font-mono font-bold text-slate-800">
                                  {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                                <td className="p-1.5 text-center font-mono text-slate-600">
                                  %{item.taxRate || 20}
                                </td>
                                <td className="p-1.5 text-right font-mono font-black text-slate-900">
                                  {total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* FINANCIAL SUMMARY & AMOUNT IN TURKISH WORDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Left: Amount in Words & Notes */}
                    <div className="space-y-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Yalnız / Yazıyla Tutar:
                        </div>
                        <div className="text-[11px] font-black text-slate-900 font-mono tracking-tight">
                          # {numberToTurkishWords(order.grandTotal || 0)} #
                        </div>
                      </div>

                      {customInstructions && (
                        <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-2 text-[10px] text-amber-950">
                          <span className="font-black uppercase tracking-wider block text-[9px] text-amber-900 mb-0.5">
                            Özel Sipariş Talimatı:
                          </span>
                          <p className="font-medium italic leading-relaxed">{customInstructions}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Tax & Grand Total Table */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                      <div className="p-2 space-y-1 text-[11px]">
                        <div className="flex justify-between text-slate-600">
                          <span>Ara Toplam (Matrah):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {(order.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                        {order.discountAmount > 0 && (
                          <div className="flex justify-between text-rose-600">
                            <span>İskonto Tutarı:</span>
                            <span className="font-mono font-bold">
                              -{(order.discountAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-600">
                          <span>Hesaplanan KDV (%20):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {(order.taxAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                        <div className="border-t-2 border-slate-900 pt-1 flex justify-between text-slate-950 font-black text-xs bg-slate-100 -mx-2 -mb-2 p-2">
                          <span className="uppercase tracking-wider">GENEL TOPLAM:</span>
                          <span className="font-mono text-sm text-indigo-950">
                            {(order.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TERMS & CONDITIONS (RESMİ TEDARİK ŞARTLARI) */}
                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-1 text-[9px] text-slate-600 leading-tight">
                    <p className="font-black text-slate-800 uppercase tracking-wider text-[10px]">
                      SİPARİŞ, TESLİMAT VE KALİTE KABUL ŞARTLARI:
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5">
                      <li>Tüm sevkiyat kolilerinin üzerinde <b>Sipariş No, Model Kodu, Renk ve Beden Asorti Dağılımını</b> gösteren etiketler yer almalıdır.</li>
                      <li>Teslim edilen malzemelerin kalite ve sertlik (Shore) değerleri, onaylı referans numune ile birebir aynı olmalıdır. Hatalı ve tolerans dışı ürünler iade edilir.</li>
                      <li>İrsaliye ve e-Faturalarda sipariş numaramız (<b>{order.orderNumber}</b>) mutlaka belirtilmelidir.</li>
                      <li>Termin gecikmelerinde en az 48 saat öncesinden Satınalma Departmanımıza yazılı bilgi verilmesi zorunludur.</li>
                    </ol>
                  </div>

                  {/* SIGNATURE & APPROVAL STAMP BOXES */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="border border-slate-300 rounded-lg p-3 text-center min-h-[90px] flex flex-col justify-between bg-white">
                      <div>
                        <p className="font-black text-[10px] text-slate-900 uppercase">SİPARİŞ VEREN / ALICI FİRMA ONAYI</p>
                        <p className="text-[9px] text-slate-500 font-bold">{companyTitle}</p>
                      </div>
                      <div className="border-t border-dashed border-slate-300 pt-1 text-[8px] text-slate-400">
                        Yetkili Kaşe & İmza
                      </div>
                    </div>

                    <div className="border border-slate-300 rounded-lg p-3 text-center min-h-[90px] flex flex-col justify-between bg-white">
                      <div>
                        <p className="font-black text-[10px] text-slate-900 uppercase">SİPARİŞİ KABUL EDEN / TEDARİKÇİ TEYİDİ</p>
                        <p className="text-[9px] text-slate-500 font-bold">{supplier?.name || 'Tedarikçi Firma'}</p>
                      </div>
                      <div className="border-t border-dashed border-slate-300 pt-1 text-[8px] text-slate-400">
                        Kaşe, İmza & Teyit Tarihi
                      </div>
                    </div>
                  </div>
                </div>
  );
}
