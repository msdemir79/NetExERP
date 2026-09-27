import React, { useState, useEffect, useRef } from 'react';
import { Printer, X, Truck, Ban, Building2, FileText, CheckCircle2, Info, Package, Receipt, Download, FileCode2, Code, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { settingsService } from '../../services/settingsService';
import { waybillService } from '../../services/waybillService';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { generateUblTrDespatchXml, downloadXmlFile } from '../../lib/ublTrGenerator';
import { UblXmlViewerModal } from '../Common/UblXmlViewerModal';
import { ThermalShippingLabelModal } from '../Common/ThermalShippingLabelModal';
import { cn } from '../../lib/utils';
import type { Waybill } from '../../types';
import { GibStandardWaybillTemplate, GibCorporateWaybillTemplate, GibDispatchChecklistTemplate } from './WaybillPrintTemplates';

// Şablon Tipleri
export type WaybillTemplateType = 'gib_standard' | 'gib_corporate' | 'gib_dispatch_checklist';

interface WaybillPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  waybillId: number | null;
}

export function WaybillPrintModal({ isOpen, onClose, waybillId }: WaybillPrintModalProps) {
  const navigate = useNavigate();
  const [waybillData, setWaybillData] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<WaybillTemplateType>('gib_standard');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [currentXmlContent, setCurrentXmlContent] = useState('');
  const [thermalLabelModalOpen, setThermalLabelModalOpen] = useState(false);
  const printContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!isOpen || !waybillId) return;
      setLoading(true);
      try {
        const [data, sysSettings] = await Promise.all([
          waybillService.getWaybill(waybillId),
          settingsService.getSystemSettings()
        ]);
        setWaybillData(data);
        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }
      } catch (err) {
        console.error('İrsaliye verisi yüklenemedi:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen, waybillId]);

  if (!isOpen) return null;

  const handlePrint = async () => {
    if (!printContentRef.current || !waybillData) return;
    const printHtmlContent = printContentRef.current.innerHTML;
    
    await printHtml(printHtmlContent, {
      title: `${waybillData.waybillNumber || 'Irsaliye'}_Sevk_Irsaliyesi`,
      widthMm: 210,
      heightMm: 297
    });
  };

  const handleOpenNewTab = () => {
    if (!printContentRef.current || !waybillData) return;
    openPrintWindow(
      printContentRef.current.innerHTML,
      `${waybillData.waybillNumber || 'Irsaliye'}_Sevk_Irsaliyesi`
    );
  };

  const handleDownloadDirectPdf = async () => {
    if (!printContentRef.current || !waybillData) return;
    setDownloadingPdf(true);
    try {
      const wbNo = waybillData.waybillNumber || 'IRSALIYE';
      await downloadElementAsPdf(printContentRef.current, {
        filename: `${wbNo}.pdf`,
        format: 'a4',
        orientation: 'portrait',
        marginMm: 6
      });
    } catch (err) {
      console.error('PDF indirme hatası:', err);
      alert('PDF oluşturulamadı.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadUblXml = () => {
    if (!waybillData) return;
    const xml = generateUblTrDespatchXml(waybillData, companySettings);
    const wbNo = waybillData.waybillNumber || 'IRSALIYE';
    downloadXmlFile(xml, `${wbNo}_UBL_TR12_IRSALIYE.xml`);
  };

  const handleOpenXmlPreview = () => {
    if (!waybillData) return;
    const xml = generateUblTrDespatchXml(waybillData, companySettings);
    setCurrentXmlContent(xml);
    setXmlModalOpen(true);
  };

  const isCancelled = waybillData?.status === 'cancelled';
  const isDraft = waybillData?.status === 'draft';
  const isSales = waybillData?.type === 'sales';

  // Format Helpers
  const waybillDateStr = waybillData?.date ? new Date(waybillData.date).toLocaleDateString('tr-TR') : '-';
  const dispatchDateStr = waybillData?.dispatchDate ? new Date(waybillData.dispatchDate).toLocaleDateString('tr-TR') : waybillDateStr;
  const dispatchTimeStr = waybillData?.dispatchTime || '10:00';
  const waybillTimeStr = waybillData?.createdAt 
    ? new Date(waybillData.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '10:00';

  const totalQuantity = waybillData?.items?.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-100 dark:bg-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-700">
        
        {/* Top Control Bar */}
        <div className="bg-slate-900 text-white p-4 px-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">
                  {waybillData?.waybillNumber || 'İrsaliye Önizleme'}
                </h3>
                {isCancelled && (
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Ban className="w-3 h-3" /> İptal Edildi
                  </span>
                )}
                {isDraft && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                    Taslak
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                GİB 509 Sıra No.lu VUK Tebliği Uyumlu Resmi e-İrsaliye Belgesi
              </p>
            </div>
          </div>

          {/* Template Selection Tabs */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTemplate('gib_standard')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                activeTemplate === 'gib_standard'
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>GİB Standart e-İrsaliye</span>
            </button>

            <button
              onClick={() => setActiveTemplate('gib_corporate')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                activeTemplate === 'gib_corporate'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>GİB Kurumsal Lacivert</span>
            </button>

            <button
              onClick={() => setActiveTemplate('gib_dispatch_checklist')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                activeTemplate === 'gib_dispatch_checklist'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Package className="w-3.5 h-3.5" />
              <span>GİB Depo & Sevkiyat Çetelesi</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {waybillData && waybillData.status === 'issued' && (
              waybillData.invoicedStatus === 'invoiced' ? (
                <div className="hidden sm:flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Faturalandı: {waybillData.invoiceNumber || 'Kesildi'}</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    navigate(`/invoices?waybillId=${waybillData.id}&contactId=${waybillData.contactId}&type=${waybillData.type}`);
                    onClose();
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  title="Bu irsaliyeyi faturaya dönüştür"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Faturalandır</span>
                </button>
              )
            )}

            {/* 100x150 mm Termal Barkod / Koli Etiketi Butonu */}
            <button
              onClick={() => setThermalLabelModalOpen(true)}
              disabled={loading || !waybillData}
              className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="100x150 mm Lojistik Koli ve Barkod Etiketi Yazdır"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>100x150 Etiket</span>
            </button>

            {/* GİB UBL-TR XML Butonları */}
            <button
              onClick={handleOpenXmlPreview}
              disabled={loading || !waybillData}
              className="bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="GİB UBL-TR 1.2 e-İrsaliye XML Kodunu Önizle / Doğrula"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>XML Önizle</span>
            </button>

            <button
              onClick={handleDownloadUblXml}
              disabled={loading || !waybillData}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="GİB UBL-TR 1.2 formatında e-İrsaliye XML dosyasını indir"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>GİB XML İndir</span>
            </button>

            {/* Tek Tıkla Doğrudan PDF İndir */}
            <button
              onClick={handleDownloadDirectPdf}
              disabled={downloadingPdf || loading || !waybillData}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="Tek tıkla kurumsal A4 formatında PDF olarak indir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={loading || !waybillData}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>

            <button
              onClick={handleOpenNewTab}
              disabled={loading || !waybillData}
              title="Yeni Sekmede Aç"
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-xl text-xs transition-colors"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white p-2 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Scrollable Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center bg-slate-200/80">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-500 dark:text-slate-400">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold">İrsaliye Belgesi Hazırlanıyor...</p>
            </div>
          ) : !waybillData ? (
            <div className="p-12 text-center text-slate-400">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">İrsaliye kaydı bulunamadı.</p>
            </div>
          ) : (
            /* Printable Container: Standard A4 Ratio (210mm x 297mm) */
            <div 
              ref={printContentRef}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-8 shadow-2xl border border-slate-300 relative text-xs leading-relaxed selection:bg-rose-100"
              style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif" }}
            >
              {/* CANCELLED WATERMARK */}
              {isCancelled && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
                  <div className="border-8 border-rose-600/30 text-rose-600/30 font-black text-6xl tracking-widest uppercase px-16 py-6 rotate-[-25deg] rounded-3xl select-none">
                    İPTAL EDİLMİŞTİR
                  </div>
                </div>
              )}

              {/* DRAFT WATERMARK */}
              {isDraft && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
                  <div className="border-8 border-amber-600/20 text-amber-600/20 font-black text-6xl tracking-widest uppercase px-16 py-6 rotate-[-25deg] rounded-3xl select-none">
                    RESMİ DEĞİLDİR - TASLAK
                  </div>
                </div>
              )}

              {/* TEMPLATE RENDERER */}
              {activeTemplate === 'gib_standard' && (
                <GibStandardWaybillTemplate waybillData={waybillData} companySettings={companySettings} />
              )}
              {activeTemplate === 'gib_corporate' && (
                <GibCorporateWaybillTemplate waybillData={waybillData} companySettings={companySettings} />
              )}
              {activeTemplate === 'gib_dispatch_checklist' && (
                <GibDispatchChecklistTemplate waybillData={waybillData} companySettings={companySettings} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* GİB UBL-TR XML Görüntüleyici ve İndirici Modalı */}
      <UblXmlViewerModal
        isOpen={xmlModalOpen}
        onClose={() => setXmlModalOpen(false)}
        xmlContent={currentXmlContent}
        filename={`${waybillData?.waybillNumber || 'IRSALIYE'}_UBL_TR12.xml`}
        documentType="waybill"
        documentNumber={waybillData?.waybillNumber || ''}
      />

      {/* 100x150 mm Termal Sevk / Koli Barkod Etiketi Modalı */}
      {waybillData && (
        <ThermalShippingLabelModal
          isOpen={thermalLabelModalOpen}
          onClose={() => setThermalLabelModalOpen(false)}
          waybill={waybillData}
          companySettings={companySettings}
        />
      )}
    </div>
  );
}