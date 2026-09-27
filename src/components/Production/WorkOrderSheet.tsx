import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { BarcodeSvg } from '../BarcodeSvg';
import type { WorkOrder, Product } from '../../types';

interface WorkOrderSheetProps {
  workOrder: WorkOrder;
  product?: Product;
  orderDateStr: string;
  woCreatedDate: Date;
  orderNumber: string;
  customerCode: string;
  documentNo: string;
  customerName: string;
  moldCode: string;
  moldGroup: string;
  customSizes: { size: string; quantity: number }[];
  colorName: string;
  totalAssortmentQty: number;
  groupedDepartments: { name: string; items: any[] }[];
  formatQty: (qty: number, unit: string) => string;
}

export function WorkOrderSheet({
  workOrder,
  product,
  orderDateStr,
  woCreatedDate,
  orderNumber,
  customerCode,
  documentNo,
  customerName,
  moldCode,
  moldGroup,
  customSizes,
  colorName,
  totalAssortmentQty,
  groupedDepartments,
  formatQty,
}: WorkOrderSheetProps) {
  return (
    <div className="overflow-x-auto bg-slate-100 dark:bg-slate-800 p-2 sm:p-4 rounded-2xl flex justify-center">
      <div
        id="work-order-sheet-printable"
        className="w-full max-w-[210mm] bg-white dark:bg-slate-900 text-black p-3.5 sm:p-5 border-2 border-black select-text shadow-xl"
        style={{ 
          minHeight: '280mm',
          fontFamily: 'Arial, Helvetica, sans-serif',
          lineHeight: '1.4'
        }}
      >
        {/* Header Main Grid */}
        <div className="grid grid-cols-12 border-2 border-black">
          {/* Left Column: Form Details & Header Barcode */}
          <div className="col-span-9 border-r-2 border-black divide-y border-black">
            {/* Row 1: Emir No + Barcode + Siparis Tarih */}
            <div className="grid grid-cols-12 text-[10.5px] items-center">
              <div className="col-span-4 p-2 font-bold border-r border-black flex items-center" style={{ verticalAlign: 'middle' }}>
                <span>Emir No : <strong className="font-black text-[12px]">{workOrder.id || '1458'}</strong></span>
              </div>
              <div className="col-span-4 p-1 border-r border-black flex items-center justify-center bg-white dark:bg-slate-900">
                <BarcodeSvg 
                  value={workOrder.barcode ? workOrder.barcode.replace(/\D/g, '') || workOrder.barcode : '1458'} 
                  height={32} 
                  showText={false} 
                />
              </div>
              <div className="col-span-4 p-2 text-[9.5px] font-bold" style={{ verticalAlign: 'middle' }}>
                <span>Sipariş : <strong>{orderDateStr || woCreatedDate.toLocaleDateString('tr-TR')}</strong></span>
              </div>
            </div>

            {/* Row 2: Emir Tarihi + Sipariş No */}
            <div className="grid grid-cols-12 text-[10.5px]">
              <div className="col-span-8 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                <span>Emir Tarihi : <strong>{woCreatedDate.toLocaleDateString('tr-TR')} {woCreatedDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
              </div>
              <div className="col-span-4 p-2 font-bold" style={{ verticalAlign: 'middle' }}>
                <span>Sipariş No : <strong className="text-[12px]">{orderNumber || '2423'}</strong></span>
              </div>
            </div>

            {/* Row 3: Müşteri Kodu + Belge No */}
            <div className="grid grid-cols-12 text-[10.5px]">
              <div className="col-span-8 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                <span>Müşteri Kodu : <strong>{customerCode || '-'}</strong></span>
              </div>
              <div className="col-span-4 p-2 font-bold" style={{ verticalAlign: 'middle' }}>
                <span>Belge No : <strong className="uppercase">{documentNo || 'KİŞ 74'}</strong></span>
              </div>
            </div>

            {/* Row 4: Müşteri Adı (Large Blue Bold) */}
            <div className="p-2.5 bg-white dark:bg-slate-900">
              <div className="flex items-center text-[12px] font-bold" style={{ verticalAlign: 'middle' }}>
                <span className="mr-2">Müşteri Adı :</span>
                <span className="text-[15px] font-black tracking-wide uppercase" style={{ color: '#0033cc' }}>
                  {customerName || 'BESTOF AYAKKABI'}
                </span>
              </div>
            </div>

            {/* Row 5: Kalıp Kodu + Kalıp/Seri Grubu */}
            <div className="grid grid-cols-12 text-[10.5px] bg-white dark:bg-slate-900">
              <div className="col-span-5 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                <span>Kalıp Kodu: <strong className="text-[12px] font-black">{moldCode || '018'}</strong></span>
              </div>
              <div className="col-span-7 p-2 font-black uppercase text-[11px] tracking-wider" style={{ verticalAlign: 'middle' }}>
                <span>{moldGroup || 'PTK _ PATİK (26-30)'}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Model Photo Box */}
          <div className="col-span-3 flex flex-col items-center justify-center p-2 relative min-h-[120px]" style={{ backgroundColor: '#f8fafc' }}>
            {product?.image ? (
              <img
                src={product.image}
                alt={product.name}
                className="max-h-28 max-w-full object-contain rounded"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full min-h-[100px] border border-dashed rounded flex flex-col items-center justify-center p-2 text-center" style={{ borderColor: '#94a3b8', color: '#94a3b8' }}>
                <ImageIcon className="w-8 h-8 mb-1 opacity-50" />
                <span className="text-[8.5px] font-bold uppercase leading-tight">Model Görseli</span>
              </div>
            )}
          </div>
        </div>

        {/* Model Name & Size Assortment Header Row */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          {/* Size / Assortment Table */}
          <div className="border border-black">
            <table className="border-collapse text-[10px]" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#d8b4e2' }}>
                  <th className="border border-black px-2.5 py-1 font-black text-center text-black min-w-[75px] text-[9.5px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                    Renk / Varyant
                  </th>
                  {customSizes.map((sz, idx) => (
                    <th key={idx} className="border border-black px-2.5 py-1 font-black text-center text-black min-w-[34px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                      {sz.size}
                    </th>
                  ))}
                  <th className="border border-black px-3 py-1 font-black text-center text-black min-w-[45px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                    Toplam
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 font-black text-center uppercase tracking-wider text-[9px]" style={{ backgroundColor: '#6b21a8', color: '#ffffff', verticalAlign: 'middle', lineHeight: '1.4' }}>
                    {colorName || 'SİYAH/BEYAZ'}
                  </td>
                  {customSizes.map((sz, idx) => (
                    <td key={idx} className="border border-black px-2 py-1 font-black text-center text-black text-[10.5px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                      {sz.quantity}
                    </td>
                  ))}
                  <td className="border border-black px-2.5 py-1 font-black text-center text-black text-[11px]" style={{ backgroundColor: '#f1f5f9', verticalAlign: 'middle', lineHeight: '1.4' }}>
                    {totalAssortmentQty}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Model Title Display (Bold Red) */}
          <div className="text-right">
            <div className="text-sm font-bold" style={{ lineHeight: '1.3' }}>
              Üretilecek Model : <span className="text-xl sm:text-2xl font-black uppercase tracking-tight" style={{ color: '#cc0000' }}>
                {product?.code || '22K-B74 P'}
              </span>
            </div>
            {product?.name && product.name !== product.code && (
              <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: '#334155', lineHeight: '1.3' }}>
                {product.name}
              </div>
            )}
          </div>
        </div>

        {/* Reçete Malzeme Listesi Tablosu */}
        <div className="mt-3 border-2 border-black">
          {/* Header Columns */}
          <table className="w-full border-collapse" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b-2 border-black text-[10px] font-black bg-white dark:bg-slate-900">
                <th className="p-1.5 text-left border-r border-black w-[32%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Hammadde Adı</th>
                <th className="p-1.5 text-left border-r border-black w-[25%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Açıklama / Not</th>
                <th className="p-1.5 text-left border-r border-black w-[25%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Kullanılacak Renk</th>
                <th className="p-1.5 text-right border-r border-black w-[10%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Miktar</th>
                <th className="p-1.5 text-center w-[8%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Birim</th>
              </tr>
            </thead>

            <tbody>
              {groupedDepartments.map((deptGroup) => (
                <React.Fragment key={deptGroup.name}>
                  {/* Department Section Banner (Bright Yellow Bar) */}
                  <tr>
                    <td 
                      colSpan={5} 
                      className="font-black text-[11px] uppercase tracking-wider py-1 px-2.5 border-y border-black"
                      style={{ backgroundColor: '#ffff00', color: '#000000', verticalAlign: 'middle', lineHeight: '1.4' }}
                    >
                      {deptGroup.name}
                    </td>
                  </tr>

                  {/* Department Rows */}
                  {deptGroup.items.map((row: any, rIdx: number) => (
                    <tr key={rIdx} className="border-b border-black text-[9.5px]">
                      {/* Raw material name */}
                      <td className="p-1.5 font-bold border-r border-black text-black uppercase" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {row.rawName}
                      </td>

                      {/* Part / Explanation (Bold Blue) */}
                      <td className="p-1.5 font-black border-r border-black uppercase text-[9.5px]" style={{ color: '#0033cc', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {row.partName}
                      </td>

                      {/* Color */}
                      <td className="p-1.5 font-bold border-r border-black uppercase text-[9px]" style={{ color: '#0f172a', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {row.color}
                      </td>

                      {/* Quantity */}
                      <td className="p-1.5 font-black border-r border-black text-right text-[10px] text-black font-mono" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {formatQty(row.batchQty, row.unit)}
                      </td>

                      {/* Unit */}
                      <td className="p-1.5 font-bold text-center text-[9px] uppercase" style={{ color: '#1e293b', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {row.unit}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Footer Info & Signature Boxes */}
        <div className="mt-4 pt-2 border-t-2 border-black flex items-center justify-between text-[10px] font-bold" style={{ lineHeight: '1.4' }}>
          <div>
            <span>Model : </span>
            <strong className="text-[11px] font-black uppercase" style={{ color: '#b91c1c' }}>
              {moldCode ? `KALIP:${moldCode}` : 'KALIP:018'}
            </strong>
            {workOrder.notes && (
              <span className="ml-3 font-medium" style={{ color: '#475569' }}>({workOrder.notes})</span>
            )}
          </div>

          <div className="flex items-center gap-6 text-[9px] font-bold uppercase" style={{ color: '#334155' }}>
            <span>Kesim Onay: ________</span>
            <span>Saya Onay: ________</span>
            <span>Montaj Onay: ________</span>
            <span>Kontrol / Sevk: ________</span>
          </div>
        </div>
      </div>
    </div>
  );
}
