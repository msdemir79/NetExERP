import React from 'react';
import { Eye, ZoomOut, ZoomIn, Package, Tag } from 'lucide-react';
import { BarcodeSvg } from '../../BarcodeSvg';
import type { Product } from '../../../types';

export interface BoxLabelItem {
  color: string;
  barcode: string;
  boxIndex: number;
  totalBoxesForColor: number;
  image: string | null;
}

export interface VariantLabelItem {
  color: string;
  size: string;
  barcode: string;
  ratio: number;
  index: number;
  image: string | null;
}

interface LabelPreviewPanelProps {
  activeTab: 'box' | 'variant';
  product: Product;
  dims: { width: number; height: number };
  totalLabelsCount: number;
  previewZoom: number;
  setPreviewZoom: React.Dispatch<React.SetStateAction<number>>;
  boxLabelsToPrint: BoxLabelItem[];
  variantLabelsToPrint: VariantLabelItem[];
  labelPadding: number;
  fontScale: number;
  imageFramePx: number;
  imageFit: 'contain' | 'cover';
  companyHeader: string;
  showPrice: boolean;
  showBoxSerial: boolean;
  effectiveAssortment: { size: string; quantity: number }[];
  totalPairsPerBox: number;
  barcodeHeight: number;
}

export default function LabelPreviewPanel({
  activeTab,
  product,
  dims,
  totalLabelsCount,
  previewZoom,
  setPreviewZoom,
  boxLabelsToPrint,
  variantLabelsToPrint,
  labelPadding,
  fontScale,
  imageFramePx,
  imageFit,
  companyHeader,
  showPrice,
  showBoxSerial,
  effectiveAssortment,
  totalPairsPerBox,
  barcodeHeight,
}: LabelPreviewPanelProps) {
  return (
          <div className="xl:col-span-7 space-y-2 xl:sticky xl:top-4">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200 truncate">
                  Canlı Önizleme
                </span>
                <span className="text-[10px] font-black bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full uppercase shrink-0">
                  {dims.width} × {dims.height} mm · {totalLabelsCount} Etiket
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                  title="Uzaklaştır"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-black text-slate-600 dark:text-slate-300 w-10 text-center">
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                  title="Yakınlaştır"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className="px-2 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase transition-colors"
                  title="Gerçek boyut (1:1)"
                >
                  1:1
                </button>
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 min-h-[480px] xl:max-h-[calc(100vh-15rem)] overflow-auto shadow-inner">
              {/* Zoom wrapper OUTSIDE printable area so print output is unaffected */}
              <div style={{ zoom: previewZoom }}>
                <div id="barcode-printable-area" className="flex flex-wrap justify-center gap-4">

                  {/* BOX LABELS */}
                  {activeTab === 'box' && (
                    boxLabelsToPrint.length === 0 ? (
                      <div className="w-full py-24 text-center space-y-2">
                        <Package className="w-12 h-12 mx-auto opacity-30 text-purple-400" />
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Yazdırılacak koli miktarı girilmedi
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          Soldaki panelden koli adedi belirleyerek başlayın
                        </p>
                      </div>
                    ) : (
                      boxLabelsToPrint.map((label, idx) => (
                        <div
                          key={`box-${idx}`}
                          className="print-card bg-white border border-black rounded-md shadow-sm text-black overflow-hidden flex flex-col justify-between"
                          style={{ width: `${dims.width}mm`, minHeight: `${dims.height}mm`, padding: `${labelPadding}px` }}
                        >
                          <div style={{ zoom: fontScale }} className="flex flex-col justify-between gap-2 flex-1 min-h-0">
                            {/* Header */}
                            <div className="flex items-start justify-between border-b-2 border-black pb-2 gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {label.image && (
                                  <div
                                    className="label-img-frame rounded-lg border-2 border-black overflow-hidden bg-white shrink-0 flex items-center justify-center p-0.5"
                                    style={{ width: `${imageFramePx}px`, height: `${imageFramePx}px`, minWidth: `${imageFramePx}px`, minHeight: `${imageFramePx}px`, boxSizing: 'border-box' }}
                                  >
                                    <img
                                      src={label.image}
                                      alt="Ürün Görseli"
                                      style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: imageFit, objectPosition: 'center', display: 'block', margin: 'auto' }}
                                    />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black tracking-widest text-slate-600 uppercase">
                                    {companyHeader}
                                  </div>
                                  <h2 className="text-base font-black uppercase tracking-tight text-black leading-tight">
                                    {product.name}
                                  </h2>
                                  {product.brand && (
                                    <div className="text-[9px] font-bold uppercase text-slate-600">
                                      {product.brand}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-mono font-black bg-black text-white px-2 py-1 rounded uppercase">
                                  {product.code}
                                </div>
                                {showPrice && product.sellingPrice > 0 && (
                                  <div className="text-xs font-black font-mono text-black mt-1">
                                    ₺{product.sellingPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Color & box serial */}
                            <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg font-bold">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase text-slate-500">RENK:</span>
                                <span className="text-sm font-black uppercase text-black">{label.color}</span>
                              </div>
                              {showBoxSerial && (
                                <div className="text-xs font-mono font-black text-black">
                                  KOLİ: {label.boxIndex} / {label.totalBoxesForColor}
                                </div>
                              )}
                            </div>

                            {/* Assortment table */}
                            {product.isFootwear && (
                              <div className="space-y-1">
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex justify-between">
                                  <span>KOLİ İÇİ ASORTİ DAĞILIMI</span>
                                  <span className="font-mono">{totalPairsPerBox} ÇİFT / KOLİ</span>
                                </div>
                                <div className="border border-black rounded-lg overflow-hidden grid grid-flow-col auto-cols-fr text-center divide-x divide-black">
                                  {effectiveAssortment.map((a, i) => (
                                    <div key={i} className="flex flex-col">
                                      <div className="bg-slate-200 font-bold text-[10px] py-1 border-b border-black">
                                        {a.size}
                                      </div>
                                      <div className="font-mono font-black text-xs py-1.5 bg-white">
                                        {a.quantity}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Barcode */}
                            <div className="pt-1 flex flex-col items-center justify-center border-t border-slate-300">
                              <BarcodeSvg
                                value={label.barcode}
                                height={barcodeHeight}
                                showText={true}
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* VARIANT LABELS */}
                  {activeTab === 'variant' && (
                    variantLabelsToPrint.length === 0 ? (
                      <div className="w-full py-24 text-center space-y-2">
                        <Tag className="w-12 h-12 mx-auto opacity-30 text-purple-400" />
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Yazdırılacak beden etiketi yok
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          Soldaki panelden koli adedi girin veya beden adetlerini belirleyin
                        </p>
                      </div>
                    ) : (
                      variantLabelsToPrint.map((label, idx) => (
                        <div
                          key={`var-${idx}`}
                          className="print-card bg-white border border-black rounded-md shadow-sm text-black overflow-hidden flex flex-col justify-between"
                          style={{ width: `${dims.width}mm`, minHeight: `${dims.height}mm`, padding: `${labelPadding}px` }}
                        >
                          <div style={{ zoom: fontScale }} className="flex flex-col justify-between gap-1.5 flex-1 min-h-0">
                            {/* Top row */}
                            <div className="flex items-start justify-between border-b border-black pb-1 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {label.image && (
                                  <div
                                    className="label-img-frame rounded-md border border-black overflow-hidden bg-white shrink-0 p-0.5 flex items-center justify-center"
                                    style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px', boxSizing: 'border-box' }}
                                  >
                                    <img
                                      src={label.image}
                                      alt="Ürün Görseli"
                                      style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: imageFit, objectPosition: 'center', display: 'block', margin: 'auto' }}
                                    />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-700">
                                    {product.brand || companyHeader}
                                  </div>
                                  <div className="text-xs font-black uppercase text-black line-clamp-1">
                                    {product.name}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[9px] font-mono font-black uppercase bg-black text-white px-1.5 py-0.5 rounded shrink-0">
                                {product.code}
                              </span>
                            </div>

                            {/* Color & size highlight */}
                            <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-lg">
                              <div className="text-[10px] font-bold uppercase text-slate-600">
                                RENK: <span className="font-black text-black">{label.color}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-[9px] font-bold text-slate-500 uppercase mr-1.5">BEDEN:</span>
                                <span className="text-lg font-black font-mono text-black bg-white px-2 py-0.5 rounded-md border border-slate-400 shadow-xs">
                                  {label.size}
                                </span>
                              </div>
                            </div>

                            {showPrice && product.sellingPrice > 0 && (
                              <div className="text-right text-[11px] font-mono font-black text-black">
                                FİYAT: ₺{product.sellingPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                              </div>
                            )}

                            {/* Barcode */}
                            <div className="pt-0.5 flex flex-col items-center justify-center">
                              <BarcodeSvg
                                value={label.barcode}
                                height={barcodeHeight}
                                showText={true}
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )
                  )}

                </div>
              </div>
            </div>
          </div>
  );
}
