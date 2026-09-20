import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  X, 
  Receipt, 
  Ban, 
  QrCode, 
  Building2, 
  User, 
  Calendar, 
  CreditCard, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  Layers, 
  Sparkles,
  Info,
  Download,
  FileCode2,
  Code
} from 'lucide-react';
import { erpService } from '../../services/erpService';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { generateUblTrInvoiceXml, downloadXmlFile } from '../../lib/ublTrGenerator';
import { UblXmlViewerModal } from '../Common/UblXmlViewerModal';
import { cn } from '../../lib/utils';
import type { Invoice } from '../../types';

// =========================================================================================
// HELPER: TÜRKÇE YAZIYLA TUTAR FONKSİYONU (Resmi e-Fatura Zorunluluğu)
// =========================================================================================
export function numberToTurkishWords(num: number): string {
  if (isNaN(num)) return '';
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const lira = Math.floor(absNum);
  const kurus = Math.round((absNum - lira) * 100);

  const ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
  const tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];

  function threeDigitToWords(n: number): string {
    let result = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h === 1) {
      result += 'YÜZ';
    } else if (h > 1) {
      result += ones[h] + 'YÜZ';
    }

    if (t > 0) {
      result += tens[t];
    }

    if (o > 0) {
      result += ones[o];
    }

    return result;
  }

  function convertInteger(val: number): string {
    if (val === 0) return 'SIFIR';

    const billions = Math.floor(val / 1000000000);
    const millions = Math.floor((val % 1000000000) / 1000000);
    const thousands = Math.floor((val % 1000000) / 1000);
    const remainder = val % 1000;

    let res = '';

    if (billions > 0) {
      res += threeDigitToWords(billions) + 'MİLYAR';
    }

    if (millions > 0) {
      res += threeDigitToWords(millions) + 'MİLYON';
    }

    if (thousands > 0) {
      if (thousands === 1) {
        res += 'BİN';
      } else {
        res += threeDigitToWords(thousands) + 'BİN';
      }
    }

    if (remainder > 0) {
      res += threeDigitToWords(remainder);
    }

    return res;
  }

  const liraText = convertInteger(lira);
  const kurusText = kurus > 0 ? convertInteger(kurus) : 'SIFIR';

  const prefix = isNegative ? 'EKSİ ' : '';
  return `#${prefix}${liraText} TÜRK LİRASI ${kurusText} KURUŞ#`;
}

// Şablon Tipleri
export type InvoiceTemplateType = 'official_gib' | 'corporate_modern' | 'compact_delivery';

interface InvoicePrintModalProps {
  invoiceId: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenActionModal?: (invoice: Invoice) => void;
}

export function InvoicePrintModal({ 
  invoiceId, 
  isOpen, 
  onClose, 
  onOpenActionModal 
}: InvoicePrintModalProps) {
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<InvoiceTemplateType>('official_gib');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [currentXmlContent, setCurrentXmlContent] = useState('');
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      const [data, sysSettings] = await Promise.all([
        erpService.getInvoice(invoiceId),
        erpService.getSystemSettings()
      ]);
      setInvoiceDetail(data);
      if (sysSettings?.company) {
        setCompanySettings(sysSettings.company);
      }
      setLoading(false);
    }
    if (invoiceId) {
      fetchDetail();
    }
  }, [invoiceId]);

  if (!isOpen) return null;

  // KDV Oranlarına Göre Dağılım Hesabı
  const taxBreakdown: { [rate: number]: { matrah: number; tax: number; total: number } } = {};
  if (invoiceDetail?.items) {
    invoiceDetail.items.forEach((item: any) => {
      const rate = Number(item.taxRate) || 0;
      const itemMatrah = (Number(item.quantity) * Number(item.unitPrice)) - (Number(item.discountAmount) || 0);
      const itemTax = Number(item.taxAmount) || (itemMatrah * (rate / 100));
      
      if (!taxBreakdown[rate]) {
        taxBreakdown[rate] = { matrah: 0, tax: 0, total: 0 };
      }
      taxBreakdown[rate].matrah += itemMatrah;
      taxBreakdown[rate].tax += itemTax;
      taxBreakdown[rate].total += (itemMatrah + itemTax);
    });
  }

  // Fatura Tarihi ve Saati Formatlama
  const invoiceDate = invoiceDetail?.date ? new Date(invoiceDetail.date) : new Date();
  const formattedDate = invoiceDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = invoiceDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dueDateFormatted = invoiceDetail?.dueDate ? new Date(invoiceDetail.dueDate).toLocaleDateString('tr-TR') : null;

  // Türkçe Yazıyla Tutar
  const amountInWords = invoiceDetail ? numberToTurkishWords(invoiceDetail.grandTotal || 0) : '';

  // Firma Bilgileri (Dinamik Ayarlardan)
  const compName = companySettings?.companyName || 'ProERP Ayakkabı';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'PROERP AYAKKABI SAN. VE TİC. LTD. ŞTİ.';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'Organize Sanayi Bölgesi 12. Cadde No: 45 / Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7340592811';
  const compTradeReg = companySettings?.tradeRegistryNo || '948123-5';
  const compPhone = companySettings?.phone || '(0212) 555 01 99';
  const compEmail = companySettings?.email || 'muhasebe@proerp.com';
  const compWebsite = companySettings?.website || 'www.proerp.com.tr';
  const compBank = companySettings?.bankName || 'T.C. Ziraat Bankası - İkitelli Şubesi';
  const compIban = companySettings?.iban || 'TR33 0001 0002 0003 0004 0005 01';

  // Yazdırma İşlemi (Universal Print Service)
  const handlePrint = (openInNewTab: boolean = false) => {
    if (!printContainerRef.current) {
      window.print();
      return;
    }

    const htmlContent = printContainerRef.current.innerHTML;
    const pageTitle = `Fatura_${invoiceDetail?.invoiceNumber || 'Belge'}`;

    const printCss = `
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      @media print {
        body {
          background-color: #ffffff !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print { display: none !important; }
      }
      body {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
        color: #111827;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; }
    `;

    if (openInNewTab) {
      openPrintWindow(htmlContent, pageTitle, { css: printCss, landscape: false });
    } else {
      printHtml(htmlContent, { title: pageTitle, css: printCss, landscape: false });
    }
  };

  const handleDownloadDirectPdf = async () => {
    if (!printContainerRef.current || !invoiceDetail) return;
    setDownloadingPdf(true);
    try {
      const invNo = invoiceDetail.invoiceNumber || 'FATURA';
      await downloadElementAsPdf(printContainerRef.current, {
        filename: `${invNo}.pdf`,
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
    if (!invoiceDetail) return;
    const xml = generateUblTrInvoiceXml(invoiceDetail, companySettings);
    const invNo = invoiceDetail.invoiceNumber || 'FATURA';
    downloadXmlFile(xml, `${invNo}_UBL_TR12.xml`);
  };

  const handleOpenXmlPreview = () => {
    if (!invoiceDetail) return;
    const xml = generateUblTrInvoiceXml(invoiceDetail, companySettings);
    setCurrentXmlContent(xml);
    setXmlModalOpen(true);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[96vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
        
        {/* ========================================================================= */}
        {/* ÜST EYLEM VE ŞABLON SEÇİM ÇUBUĞU (Ekranda görünür, baskıda gizlenir) */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Resmi Fatura Önizleme & Baskı
                </span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-400/20">
                  {invoiceDetail?.invoiceNumber || '...'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                GİB standartlarına tam uyumlu A4 resmi baskı tasarımı
              </p>
            </div>
          </div>

          {/* Şablon Seçici (Tasarım Seçenekleri - Tamamı GİB Resmi Standartlarında) */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setTemplate('official_gib')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'official_gib'
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="Gelir İdaresi Başkanlığı resmi standart e-Arşiv / e-Fatura formatı (Kırmızı GİB Rozetli Klasik)"
            >
              <div className="w-2 h-2 rounded-full bg-white dark:bg-slate-900 animate-pulse" />
              1. GİB Klasik Resmi
            </button>

            <button
              onClick={() => setTemplate('corporate_modern')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'corporate_modern'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="GİB resmi standardında, kurumsal lacivert ve üst düzey yönetici e-Fatura düzeni"
            >
              <Sparkles className="w-3.5 h-3.5" />
              2. GİB Kurumsal Lacivert
            </button>

            <button
              onClick={() => setTemplate('compact_delivery')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'compact_delivery'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="GİB resmi standardında, VUK 509 İrsaliye Yerine Geçen Sevk ve Lojistik e-Arşiv Fatura"
            >
              <Layers className="w-3.5 h-3.5" />
              3. GİB İrsaliyeli Resmi (Sevk)
            </button>
          </div>

          {/* Eylem Butonları */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onOpenActionModal && invoiceDetail && (
              <button
                onClick={() => onOpenActionModal(invoiceDetail)}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                {invoiceDetail.status === 'issued' ? 'İptal Et' : 'Sil'}
              </button>
            )}

            {/* GİB UBL-TR XML Butonları */}
            <button
              onClick={handleOpenXmlPreview}
              className="bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="GİB UBL-TR 1.2 e-Fatura XML Kodunu Önizle / Doğrula"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>XML Önizle</span>
            </button>

            <button
              onClick={handleDownloadUblXml}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="GİB UBL-TR 1.2 formatında e-Fatura XML dosyasını indir"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>GİB XML İndir</span>
            </button>

            {/* Tek Tıkla Doğrudan PDF İndir */}
            <button
              onClick={handleDownloadDirectPdf}
              disabled={downloadingPdf}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="Tek tıkla kurumsal A4 formatında PDF olarak indir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            <button
              onClick={() => handlePrint(true)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs"
              title="Tam ekran A4 sekmesinde açarak tarayıcıdan yazdırma"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">Yeni Sekme</span>
            </button>

            <button
              onClick={() => handlePrint(false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition-colors border border-slate-700 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* BELGE GÖRÜNTÜLEME ALANI */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 print:p-0 print:bg-white dark:bg-slate-900 print:overflow-visible">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 dark:text-slate-400 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs font-bold uppercase tracking-wider">Fatura detayları yükleniyor...</div>
            </div>
          ) : !invoiceDetail ? (
            <div className="text-center py-24 text-slate-400 text-sm">Fatura kaydı bulunamadı.</div>
          ) : (
            <div 
              ref={printContainerRef}
              className="max-w-[210mm] mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md print:border-none print:shadow-none print:p-0 text-slate-900 dark:text-slate-100 relative print:m-0"
              style={{ minHeight: '270mm' }}
            >
              
              {/* İptal Edilmiş Fatura Damgası */}
              {invoiceDetail.status === 'cancelled' && (
                <div className="mb-4 bg-rose-50 border-2 border-rose-500 p-3 rounded-xl text-center space-y-0.5 print:border-rose-600">
                  <div className="flex items-center justify-center gap-2 text-rose-800 font-black tracking-widest text-sm uppercase">
                    <Ban className="w-5 h-5 text-rose-600" />
                    BU FATURA İPTAL EDİLMİŞTİR
                  </div>
                  <p className="text-[11px] text-rose-700 font-medium">
                    Bu belge resmi geçerliliğini yitirmiştir. Bakiyeler, sipariş adetleri ve stok hareketleri ters kayıtla iade edilmiştir.
                  </p>
                </div>
              )}

              {/* Seçilen Şablona Göre İçerik Gösterimi */}
              {template === 'official_gib' && (
                <GibOfficialTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
              )}

              {template === 'corporate_modern' && (
                <CorporateModernTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
              )}

              {template === 'compact_delivery' && (
                <CompactDeliveryTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
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
        filename={`${invoiceDetail?.invoiceNumber || 'FATURA'}_UBL_TR12.xml`}
        documentType="invoice"
        documentNumber={invoiceDetail?.invoiceNumber || ''}
      />
    </div>
  );
}

// =========================================================================================
// ŞABLON 1: GELİR İDARESİ BAŞKANLIĞI RESMİ E-ARŞİV / E-FATURA STANDARDI
// =========================================================================================
function GibOfficialTemplate({
  invoice,
  taxBreakdown,
  formattedDate,
  formattedTime,
  dueDateFormatted,
  amountInWords,
  companySettings
}: any) {
  const compLogo = companySettings?.logo;
  const compName = companySettings?.companyName || 'PROERP';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'PROERP AYAKKABI SAN. VE TİC. LTD. ŞTİ.';
  const compAddress = companySettings?.address || 'İkitelli OSB Aykosan San. Sit. 4. Ada A Blok No:12-14 Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7320491820';
  const compTradeReg = companySettings?.tradeRegistryNo || '948210';
  const compPhone = companySettings?.phone || '0 (212) 671 20 20';
  const compEmail = companySettings?.email || 'info@proerp.com.tr';
  const compWebsite = companySettings?.website || 'www.proerp.com.tr';
  const compBank = companySettings?.bankName || 'Ziraat Bankası';
  const compIban = companySettings?.iban || 'TR12 0001 0002 0003 0004 0005 06';

  const isSales = invoice.type === 'sales';
  const isCancelled = invoice.status === 'cancelled';
  const invoiceTitle = isCancelled 
    ? 'İPTAL EDİLMİŞ FATURA' 
    : (isSales ? 'e-ARŞİV FATURA' : 'ALIŞ FATURASI');

  return (
    <div className="space-y-4 font-sans text-xs text-slate-900 dark:text-slate-100">
      
      {/* 1. Üst Başlık Şeridi: Sol Kurumsal Logo & Ortada GİB e-Arşiv Rozeti & Sağda Belge Bilgileri */}
      <div className="grid grid-cols-12 gap-3 pb-3 border-b-2 border-slate-900 items-center">
        
        {/* Sol Sütun: Firma Logosu */}
        <div className="col-span-4 flex items-center gap-3">
          {compLogo ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center p-0.5 border border-slate-300 shrink-0 overflow-hidden shadow-xs">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-2xl tracking-tighter italic border border-slate-800 shrink-0">
              {compName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-sm tracking-tight text-slate-900 dark:text-slate-100 leading-tight uppercase truncate">
              {compName}
            </div>
            <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider line-clamp-1">
              {compTitle}
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
              {compWebsite}
            </div>
          </div>
        </div>

        {/* Orta Sütun: Resmi e-Arşiv Fatura Logosu ve Damgası */}
        <div className="col-span-4 text-center flex flex-col items-center justify-center">
          {/* Resmi GİB Kırmızı Hilal/Yıldız e-Arşiv Görsel Rozeti */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-md mb-1">
            <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
              ★
            </div>
            <span className="font-black text-red-700 tracking-wider text-xs uppercase">
              {invoiceTitle}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            GİB 509 Sıra No.lu VUK Genel Tebliği Standardı
          </div>
        </div>

        {/* Sağ Sütun: Resmi e-Belge Kimlik Bilgileri Kutusu */}
        <div className="col-span-4 text-right">
          <div className="inline-block bg-slate-50 dark:bg-slate-800/50 border border-slate-300 rounded p-2 text-[10px] space-y-1 w-full text-left font-mono">
            <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">Fatura No:</span>
              <span className="font-black text-slate-900 dark:text-slate-100">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Fatura Tarihi:</span>
              <span className="font-bold">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Düzenleme Saati:</span>
              <span>{formattedTime}</span>
            </div>
            {dueDateFormatted && (
              <div className="flex justify-between text-indigo-700 font-bold">
                <span className="font-sans">Vade Tarihi:</span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 2. ETTN (Evrensel Tekil Tanımlama No) ve Senaryo Şeridi */}
      <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded border border-slate-300 text-[10px] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="font-bold text-slate-600 uppercase">ETTN (UUID):</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 break-all">{invoice.ettn || '00000000-0000-0000-0000-000000000000'}</span>
        </div>
        <div className="flex items-center gap-4 text-slate-700 dark:text-slate-200">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Senaryo: </span>
            <span className="font-black uppercase">{invoice.scenario === 'commercial' ? 'TİCARİ FATURA' : (invoice.scenario === 'withholding' ? 'TEVKİFAT' : 'TEMEL FATURA')}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Fatura Tipi: </span>
            <span className="font-black uppercase">{isSales ? 'SATIŞ' : 'ALIŞ'}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Para Birimi: </span>
            <span className="font-black font-mono">{invoice.currency || 'TRY'}</span>
          </div>
        </div>
      </div>

      {/* 3. Satıcı ve Alıcı Bilgileri (Çift Kutu) */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* SATICI KUTUSU */}
        <div className="border border-slate-300 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-slate-800 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SATICI BİLGİLERİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase">
            {compTitle}
          </div>
          <div className="text-slate-600">
            {compAddress}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div><span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {compTaxOffice}</div>
            <div><span className="font-sans font-bold text-slate-600">VKN:</span> {compTaxNumber} <span className="font-sans font-bold text-slate-600 ml-2">Ticaret Sicil:</span> {compTradeReg}</div>
            <div><span className="font-sans font-bold text-slate-600">Tel:</span> {compPhone} | <span className="font-sans font-bold text-slate-600">E-Posta:</span> {compEmail}</div>
          </div>
        </div>

        {/* ALICI (MÜŞTERİ / CARİ) KUTUSU */}
        <div className="border border-slate-300 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-indigo-800 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SAYIN (ALICI / MÜŞTERİ BİLGİLERİ)
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {invoice.contact?.companyTitle || invoice.contact?.name || 'MÜŞTERİ BİLGİSİ GİRİLMEMİŞ'}
          </div>
          <div className="text-slate-600">
            {invoice.contact?.address || 'Fatura adresi belirtilmemiştir.'}
            {invoice.contact?.district ? ` ${invoice.contact.district} /` : ''}
            {invoice.contact?.city ? ` ${invoice.contact.city}` : ''}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div>
              <span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {invoice.contact?.taxOffice ? `${invoice.contact.taxOffice} V.D.` : '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">VKN / TCKN:</span> {invoice.contact?.taxNumber || invoice.contact?.tcKimlik || '11111111111'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">Cari Kodu:</span> {invoice.contact?.code || '-'} 
              <span className="font-sans font-bold text-slate-600 ml-2">Tel:</span> {invoice.contact?.phone || invoice.contact?.mobile || '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">E-Posta:</span> {invoice.contact?.email || '-'}
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bağlı Sipariş & İrsaliye Bilgileri Şeridi */}
      <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-sans font-bold text-slate-500 dark:text-slate-400">Sipariş No: </span>
            <span className="font-bold text-indigo-700">{invoice.orderNumber || (invoice.orderId ? `SIP-${invoice.orderId}` : '-')}</span>
          </div>
          {invoice.waybillNumber && (
            <div>
              <span className="font-sans font-bold text-slate-500 dark:text-slate-400">İrsaliye No: </span>
              <span className="font-bold text-purple-700">{invoice.waybillNumber}</span>
            </div>
          )}
          <div>
            <span className="font-sans font-bold text-slate-500 dark:text-slate-400">Düzenleme Tarihi: </span>
            <span>{invoice.date ? new Date(invoice.date).toLocaleDateString('tr-TR') : formattedDate}</span>
          </div>
        </div>
        <div className="text-slate-600 font-sans italic font-medium">
          {invoice.waybillNumber 
            ? `* İrsaliye (${invoice.waybillNumber}) istinaden düzenlenmiştir.` 
            : '* Bu belgenin sevk irsaliyesi yerine geçtiği kabul edilmiştir (VUK 509).'}
        </div>
      </div>

      {/* 5. Mal / Hizmet Satırları Tablosu */}
      <div className="border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <tr>
              <th className="p-2 text-center border-r border-slate-300 w-8">S.No</th>
              <th className="p-2 border-r border-slate-300">Mal / Hizmet Açıklaması</th>
              <th className="p-2 text-right border-r border-slate-300 w-16">Miktar</th>
              <th className="p-2 text-center border-r border-slate-300 w-12">Birim</th>
              <th className="p-2 text-right border-r border-slate-300 w-20">Birim Fiyat</th>
              <th className="p-2 text-right border-r border-slate-300 w-14">İskonto</th>
              <th className="p-2 text-right border-r border-slate-300 w-20">Mal/Hizmet Tutarı</th>
              <th className="p-2 text-center border-r border-slate-300 w-12">KDV %</th>
              <th className="p-2 text-right border-r border-slate-300 w-18">KDV Tutarı</th>
              <th className="p-2 text-right w-24">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item: any, idx: number) => {
                const lineDiscount = Number(item.discountAmount) || 0;
                const lineMatrah = (Number(item.quantity) * Number(item.unitPrice)) - lineDiscount;
                const lineTax = Number(item.taxAmount) || (lineMatrah * ((Number(item.taxRate) || 0) / 100));
                const lineTotal = Number(item.total) || (lineMatrah + lineTax);

                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50/50'}>
                    <td className="p-2 text-center font-mono border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.productName}</div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        {item.productCode && <span>Kod: {item.productCode}</span>}
                        {item.color && <span>Renk: {item.color}</span>}
                        {item.size && <span>Beden/No: {item.size}</span>}
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">
                      {item.quantity}
                    </td>
                    <td className="p-2 text-center text-slate-600 border-r border-slate-200 dark:border-slate-700">
                      {item.unit || 'Çift'}
                    </td>
                    <td className="p-2 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                      ₺{Number(item.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-mono text-slate-600 border-r border-slate-200 dark:border-slate-700">
                      {item.discountRate > 0 ? `%${item.discountRate}` : '-'}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">
                      ₺{lineMatrah.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center font-mono border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                      %{item.taxRate}
                    </td>
                    <td className="p-2 text-right font-mono border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                      ₺{lineTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="p-4 text-center text-slate-400">Fatura kalemleri bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Alt Bölüm: Sol Tarafta KDV Dağılımı + Notlar + QR / Sağ Tarafta Mali Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1">
        
        {/* Sol Alan: KDV Dağılım Tablosu & Notlar (7 Sütun) */}
        <div className="col-span-7 space-y-3">
          
          {/* Resmi KDV Dağılım Tablosu */}
          <div>
            <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Vergi / KDV Matrah Dağılımı
            </div>
            <table className="w-full text-[10px] border border-slate-300 rounded overflow-hidden">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-300 text-[9px] uppercase">
                <tr>
                  <th className="p-1.5 text-center border-r border-slate-300">KDV Oranı</th>
                  <th className="p-1.5 text-right border-r border-slate-300">KDV Hariç Tutar (Matrah)</th>
                  <th className="p-1.5 text-right border-r border-slate-300">Hesaplanan KDV</th>
                  <th className="p-1.5 text-right">KDV Dahil Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {Object.keys(taxBreakdown).length > 0 ? (
                  Object.entries(taxBreakdown).map(([rate, vals]: [string, any]) => (
                    <tr key={rate}>
                      <td className="p-1.5 text-center font-bold border-r border-slate-200 dark:border-slate-700">%{rate}</td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700">
                        ₺{Number(vals?.matrah || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700 text-indigo-700 font-bold">
                        ₺{Number(vals?.tax || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right font-bold text-slate-900 dark:text-slate-100">
                        ₺{Number(vals?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-1.5 text-center text-slate-400">Vergi kaydı yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Fatura Açıklaması / Notlar */}
          {invoice.notes && (
            <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 text-[10px]">
              <span className="font-bold text-slate-700 dark:text-slate-200 block text-[9px] uppercase">Açıklama & Notlar:</span>
              <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Banka Hesap Bilgileri */}
          <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] space-y-0.5">
            <div className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[9px] flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-indigo-600" />
              Banka & Havale Bilgileri:
            </div>
            <div className="text-slate-800 dark:text-slate-200 font-medium">
              <span className="font-bold">Banka:</span> {compBank} | <span className="font-bold">Hesap Sahibi:</span> {compTitle}
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-[10px]">
              IBAN: {compIban} (TRY)
            </div>
          </div>

          {/* Resmi Karekod & VUK Bilgilendirme */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-14 h-14 border border-slate-300 rounded p-1 flex items-center justify-center bg-white dark:bg-slate-900 shadow-xs">
              <QrCode className="w-12 h-12 text-slate-800 dark:text-slate-200" />
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              <span className="font-bold text-slate-700 dark:text-slate-200 block">Karekodlu Resmi e-Belge Doğrulama:</span>
              Bu fatura Gelir İdaresi Başkanlığı 509 Sıra No.lu VUK Genel Tebliği uyarınca elektronik ortamda tanzim edilmiştir. E-İmza ile onaylanmıştır.
            </div>
          </div>

        </div>

        {/* Sağ Alan: Resmi Toplamlar Tablosu (5 Sütun) */}
        <div className="col-span-5 space-y-2">
          
          <div className="border-2 border-slate-900 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-700 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span>Mal / Hizmet Toplam Tutarı:</span>
              <span className="font-mono font-bold">
                ₺{Number(invoice.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-rose-600 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Toplam İskonto Tutarı:</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.discountTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-800 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold">Hesaplanan KDV:</span>
              <span className="font-mono font-bold text-indigo-700">
                ₺{Number(invoice.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.withholdingAmount) > 0 && (
              <div className="flex justify-between text-purple-700 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Tevkifat Tutarı ({invoice.withholdingRate || 5}/10):</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.withholdingAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline font-sans">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">ÖDENECEK TOPLAM:</span>
              <span className="text-lg font-black font-mono text-slate-950">
                ₺{Number(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* YAZIYLA TUTAR KUTUSU */}
          <div className="border border-slate-300 rounded p-2 bg-slate-100 dark:bg-slate-800 text-[9px] text-center font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            YALNIZ: {amountInWords}
          </div>

        </div>

      </div>

      {/* 7. Resmi İmza ve Mühür Bölümü */}
      <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-300 text-center text-[10px]">
        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">Düzenleyen / Teslim Eden</div>
          <div className="h-14 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50/50">
            <span className="font-sans font-bold text-[9px] text-indigo-800">ProERP Muhasebe Departmanı</span>
            <span className="text-[8px] text-slate-400">5070 Sayılı Kanun Uyarınca e-İmzalıdır</span>
          </div>
          <div className="text-[9px] text-slate-400">İmza / Kaşe</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">Teslim Alan / Alıcı</div>
          <div className="h-14 flex items-center justify-center font-serif italic text-slate-600 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50/50">
            {invoice.contact?.name || 'Teslim Alan Yetkili'}
          </div>
          <div className="text-[9px] text-slate-400">Ad Soyad / İmza / Kaşe</div>
        </div>
      </div>

    </div>
  );
}

// =========================================================================================
// ŞABLON 2: GİB KURUMSAL LACİVERT e-FATURA / e-ARŞİV (YÖNETİCİ STANDARDI)
// =========================================================================================
function CorporateModernTemplate({
  invoice,
  taxBreakdown,
  formattedDate,
  formattedTime,
  dueDateFormatted,
  amountInWords,
  companySettings
}: any) {
  const isSales = invoice.type === 'sales';
  const isCancelled = invoice.status === 'cancelled';
  const invoiceTitle = isCancelled 
    ? 'İPTAL EDİLMİŞ FATURA' 
    : (isSales ? 'e-ARŞİV FATURA' : 'ALIŞ FATURASI');

  const compName = companySettings?.companyName || 'ProERP Ayakkabı';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'PROERP AYAKKABI SAN. VE TİC. LTD. ŞTİ.';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'Organize Sanayi Bölgesi 12. Cadde No: 45 / Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7340592811';
  const compTradeReg = companySettings?.tradeRegistryNo || '948123-5';
  const compPhone = companySettings?.phone || '(0212) 555 01 99';
  const compEmail = companySettings?.email || 'muhasebe@proerp.com';
  const compWebsite = companySettings?.website || 'www.proerp.com.tr';
  const compBank = companySettings?.bankName || 'T.C. Ziraat Bankası - İkitelli Şubesi';
  const compIban = companySettings?.iban || 'TR33 0001 0002 0003 0004 0005 01';

  return (
    <div className="space-y-4 font-sans text-xs text-slate-900 dark:text-slate-100">
      
      {/* 1. Üst Başlık Şeridi: Kurumsal Lacivert Logo & Ortada GİB e-Arşiv Rozeti & Sağda Belge Bilgileri */}
      <div className="grid grid-cols-12 gap-3 pb-3 border-b-2 border-indigo-950 items-center">
        
        {/* Sol Sütun: Firma Logosu ve Resmi Ünvan */}
        <div className="col-span-4 flex items-center gap-3">
          {compLogo ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center p-0.5 border border-indigo-200 shrink-0 overflow-hidden shadow-xs">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-indigo-950 rounded-lg flex items-center justify-center text-white font-black text-2xl tracking-tighter italic border border-indigo-900 shrink-0 shadow-xs">
              {compName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-sm tracking-tight text-indigo-950 leading-tight uppercase truncate">
              {compName}
            </div>
            <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider line-clamp-1">
              {compTitle}
            </div>
            <div className="text-[9px] text-indigo-700 font-mono mt-0.5 truncate">
              {compWebsite}
            </div>
          </div>
        </div>

        {/* Orta Sütun: GİB Resmi Hilal/Yıldız Rozeti (Kurumsal Lacivert Vurgulu) */}
        <div className="col-span-4 text-center flex flex-col items-center justify-center">
          <div className="flex items-center gap-1.5 px-3.5 py-1 bg-indigo-50 border border-indigo-200 rounded-md mb-1 shadow-2xs">
            <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
              ★
            </div>
            <span className="font-black text-indigo-950 tracking-wider text-xs uppercase">
              {invoiceTitle}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            GİB 509 Sıra No.lu VUK Genel Tebliği Standardı
          </div>
          <div className="text-[8px] text-slate-400">
            Elektronik Ortamda Tanzim Edilmiş Resmi Belgedir
          </div>
        </div>

        {/* Sağ Sütun: Resmi e-Belge Kimlik Bilgileri Kutusu */}
        <div className="col-span-4 text-right">
          <div className="inline-block bg-indigo-50/40 border border-indigo-200 rounded p-2 text-[10px] space-y-1 w-full text-left font-mono">
            <div className="flex justify-between border-b border-indigo-100 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">Fatura No:</span>
              <span className="font-black text-indigo-950">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Fatura Tarihi:</span>
              <span className="font-bold">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Düzenleme Saati:</span>
              <span>{formattedTime}</span>
            </div>
            {dueDateFormatted && (
              <div className="flex justify-between text-indigo-800 font-bold border-t border-indigo-100 pt-0.5">
                <span className="font-sans">Vade Tarihi:</span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 2. ETTN (Evrensel Tekil Tanımlama No) ve Senaryo Şeridi */}
      <div className="bg-indigo-950 text-white p-2 rounded text-[10px] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-indigo-300 uppercase tracking-wider">ETTN (UUID):</span>
          <span className="font-mono font-bold text-indigo-100 break-all">{invoice.ettn || '00000000-0000-0000-0000-000000000000'}</span>
        </div>
        <div className="flex items-center gap-4 text-indigo-200">
          <div>
            <span className="text-indigo-400">Senaryo: </span>
            <span className="font-black uppercase text-white">{invoice.scenario === 'commercial' ? 'TİCARİ FATURA' : (invoice.scenario === 'withholding' ? 'TEVKİFAT' : 'TEMEL FATURA')}</span>
          </div>
          <div>
            <span className="text-indigo-400">Fatura Tipi: </span>
            <span className="font-black uppercase text-white">{isSales ? 'SATIŞ' : 'ALIŞ'}</span>
          </div>
          <div>
            <span className="text-indigo-400">Para Birimi: </span>
            <span className="font-black font-mono text-white">{invoice.currency || 'TRY'}</span>
          </div>
        </div>
      </div>

      {/* 3. Satıcı ve Alıcı Bilgileri (Çift Kutu) */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* SATICI KUTUSU */}
        <div className="border border-indigo-200 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-indigo-950 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SATICI BİLGİLERİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase">
            {compTitle}
          </div>
          <div className="text-slate-600">
            {compAddress}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div><span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {compTaxOffice}</div>
            <div><span className="font-sans font-bold text-slate-600">VKN:</span> {compTaxNumber} <span className="font-sans font-bold text-slate-600 ml-2">Ticaret Sicil:</span> {compTradeReg}</div>
            <div><span className="font-sans font-bold text-slate-600">Tel:</span> {compPhone} | <span className="font-sans font-bold text-slate-600">E-Posta:</span> {compEmail}</div>
          </div>
        </div>

        {/* ALICI (MÜŞTERİ / CARİ) KUTUSU */}
        <div className="border border-indigo-200 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-indigo-800 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SAYIN (ALICI / MÜŞTERİ BİLGİLERİ)
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {invoice.contact?.companyTitle || invoice.contact?.name || 'MÜŞTERİ BİLGİSİ GİRİLMEMİŞ'}
          </div>
          <div className="text-slate-600">
            {invoice.contact?.address || 'Fatura adresi belirtilmemiştir.'}
            {invoice.contact?.district ? ` ${invoice.contact.district} /` : ''}
            {invoice.contact?.city ? ` ${invoice.contact.city}` : ''}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div>
              <span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {invoice.contact?.taxOffice ? `${invoice.contact.taxOffice} V.D.` : '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">VKN / TCKN:</span> {invoice.contact?.taxNumber || invoice.contact?.tcKimlik || '11111111111'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">Cari Kodu:</span> {invoice.contact?.code || '-'} 
              <span className="font-sans font-bold text-slate-600 ml-2">Tel:</span> {invoice.contact?.phone || invoice.contact?.mobile || '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">E-Posta:</span> {invoice.contact?.email || '-'}
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bağlı Sipariş & İrsaliye Bilgileri Şeridi */}
      <div className="border border-indigo-200 rounded p-2 bg-indigo-50/30 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş No: </span>
            <span className="font-bold text-indigo-900">{invoice.orderNumber || (invoice.orderId ? `SIP-${invoice.orderId}` : '-')}</span>
          </div>
          {invoice.waybillNumber && (
            <div>
              <span className="font-sans font-bold text-slate-600">İrsaliye No: </span>
              <span className="font-bold text-purple-900">{invoice.waybillNumber}</span>
            </div>
          )}
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş Tarihi: </span>
            <span>{invoice.order?.date ? new Date(invoice.order.date).toLocaleDateString('tr-TR') : formattedDate}</span>
          </div>
        </div>
        <div className="text-indigo-900 font-sans italic font-medium">
          {invoice.waybillNumber 
            ? `* İrsaliye (${invoice.waybillNumber}) istinaden düzenlenmiştir.` 
            : '* Bu belgenin sevk irsaliyesi yerine geçtiği kabul edilmiştir (VUK 509).'}
        </div>
      </div>

      {/* 5. Mal / Hizmet Satırları Tablosu (Tam 10 Sütunlu VUK Standardı) */}
      <div className="border border-indigo-900 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-indigo-950 text-white font-bold uppercase tracking-wider text-[9px]">
            <tr>
              <th className="p-2 text-center border-r border-indigo-900 w-8">S.No</th>
              <th className="p-2 border-r border-indigo-900">Mal / Hizmet Açıklaması</th>
              <th className="p-2 text-right border-r border-indigo-900 w-16">Miktar</th>
              <th className="p-2 text-center border-r border-indigo-900 w-12">Birim</th>
              <th className="p-2 text-right border-r border-indigo-900 w-20">Birim Fiyat</th>
              <th className="p-2 text-right border-r border-indigo-900 w-14">İskonto</th>
              <th className="p-2 text-right border-r border-indigo-900 w-20">Mal/Hizmet Tutarı</th>
              <th className="p-2 text-center border-r border-indigo-900 w-12">KDV %</th>
              <th className="p-2 text-right border-r border-indigo-900 w-18">KDV Tutarı</th>
              <th className="p-2 text-right w-24">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item: any, idx: number) => {
                const lineDiscount = Number(item.discountAmount) || 0;
                const lineMatrah = (Number(item.quantity) * Number(item.unitPrice)) - lineDiscount;
                const lineTax = Number(item.taxAmount) || (lineMatrah * ((Number(item.taxRate) || 0) / 100));
                const lineTotal = Number(item.total) || (lineMatrah + lineTax);

                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-indigo-50/20'}>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-sans">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.productName}</div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        {item.productCode && <span>Kod: {item.productCode}</span>}
                        {item.color && <span>Renk: {item.color}</span>}
                        {item.size && <span>Beden/No: {item.size}</span>}
                      </div>
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">{item.quantity}</td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-600 font-sans">{item.unit || 'Çift'}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{Number(item.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-rose-600">
                      {Number(item.discountRate) > 0 ? `%${item.discountRate}` : '-'}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{lineMatrah.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 font-bold">%{item.taxRate}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-indigo-900 font-bold">
                      ₺{lineTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-950">
                      ₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="p-4 text-center text-slate-400 font-sans">
                  Faturaya ait ürün veya hizmet kalemi bulunmamaktadır.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Alt Bölüm: Sol KDV Dağılımı Tablosu + Notlar/Banka & Sağ Resmi Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1 items-start">
        
        {/* Sol Alan: KDV Tablosu & Banka & Karekod */}
        <div className="col-span-7 space-y-2">
          
          {/* Resmi KDV Dağılım Tablosu */}
          <div className="border border-indigo-200 rounded overflow-hidden">
            <div className="bg-indigo-950 text-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex justify-between">
              <span>KDV Matrah & Vergi Dağılım Tablosu</span>
              <span className="font-mono text-indigo-300">VUK-509</span>
            </div>
            <table className="w-full text-[9px] border-collapse">
              <thead className="bg-indigo-50/50 border-b border-indigo-200 font-bold text-indigo-950">
                <tr>
                  <th className="p-1.5 text-center border-r border-indigo-200">KDV Oranı</th>
                  <th className="p-1.5 text-right border-r border-indigo-200">Vergi Hariç Tutar (Matrah)</th>
                  <th className="p-1.5 text-right border-r border-indigo-200">Hesaplanan KDV</th>
                  <th className="p-1.5 text-right">KDV Dahil Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {Object.keys(taxBreakdown).length > 0 ? (
                  Object.entries(taxBreakdown).map(([rate, vals]: [string, any]) => (
                    <tr key={rate}>
                      <td className="p-1.5 text-center font-bold border-r border-slate-200 dark:border-slate-700">%{rate}</td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700">
                        ₺{Number(vals?.matrah || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700 text-indigo-900 font-bold">
                        ₺{Number(vals?.tax || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right font-bold text-slate-900 dark:text-slate-100">
                        ₺{Number(vals?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-1.5 text-center text-slate-400 font-sans">KDV bilgisi yok</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notlar ve Banka Bilgisi */}
          <div className="border border-indigo-200 rounded p-2 bg-indigo-50/20 text-[10px] space-y-1">
            {invoice.notes && (
              <div className="pb-1 border-b border-indigo-100">
                <span className="font-bold text-indigo-950">Fatura Notu: </span>
                <span className="text-slate-700 dark:text-slate-200">{invoice.notes}</span>
              </div>
            )}
            <div className="text-[9px] text-slate-700 dark:text-slate-200">
              <span className="font-bold text-indigo-950">Ödeme & Banka Bilgisi: </span>
              {compBank} ({compTitle})
            </div>
            <div className="font-mono font-bold text-indigo-950 text-[10px]">
              IBAN: {compIban} (TRY)
            </div>
          </div>

          {/* Resmi Karekod & VUK Bilgilendirme */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-14 h-14 border border-indigo-200 rounded p-1 flex items-center justify-center bg-white dark:bg-slate-900 shadow-2xs">
              <QrCode className="w-12 h-12 text-indigo-950" />
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              <span className="font-bold text-indigo-950 block">Karekodlu Resmi e-Belge Doğrulama:</span>
              Bu fatura Gelir İdaresi Başkanlığı 509 Sıra No.lu VUK Genel Tebliği uyarınca elektronik ortamda tanzim edilmiştir. 5070 Sayılı Kanun Uyarınca E-İmza ile onaylanmıştır.
            </div>
          </div>

        </div>

        {/* Sağ Alan: Resmi Toplamlar Tablosu */}
        <div className="col-span-5 space-y-2">
          
          <div className="border-2 border-indigo-950 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-700 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span>Mal / Hizmet Toplam Tutarı:</span>
              <span className="font-mono font-bold">
                ₺{Number(invoice.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-rose-600 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Toplam İskonto Tutarı:</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.discountTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-800 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold">Hesaplanan KDV:</span>
              <span className="font-mono font-bold text-indigo-900">
                ₺{Number(invoice.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.withholdingAmount) > 0 && (
              <div className="flex justify-between text-purple-700 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Tevkifat Tutarı ({invoice.withholdingRate || 5}/10):</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.withholdingAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-indigo-950 flex justify-between items-baseline font-sans">
              <span className="text-xs font-black text-indigo-950 uppercase">ÖDENECEK TOPLAM:</span>
              <span className="text-lg font-black font-mono text-indigo-950">
                ₺{Number(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* YAZIYLA TUTAR KUTUSU */}
          <div className="border border-indigo-200 rounded p-2 bg-indigo-50/50 text-[9px] text-center font-bold text-indigo-950 uppercase tracking-wide">
            YALNIZ: {amountInWords}
          </div>

        </div>

      </div>

      {/* 7. Resmi İmza ve Mühür Bölümü */}
      <div className="grid grid-cols-2 gap-8 pt-4 border-t border-indigo-200 text-center text-[10px]">
        <div className="space-y-1">
          <div className="font-bold text-indigo-950 uppercase">Düzenleyen / Teslim Eden</div>
          <div className="h-14 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-indigo-200 rounded p-1 bg-indigo-50/20">
            <span className="font-sans font-bold text-[9px] text-indigo-900">ProERP Muhasebe Departmanı</span>
            <span className="text-[8px] text-slate-400">5070 Sayılı Kanun Uyarınca e-İmzalıdır</span>
          </div>
          <div className="text-[9px] text-slate-400">İmza / Kaşe</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-indigo-950 uppercase">Teslim Alan / Alıcı</div>
          <div className="h-14 flex items-center justify-center font-serif italic text-slate-600 border border-dashed border-indigo-200 rounded p-1 bg-indigo-50/20">
            {invoice.contact?.name || 'Teslim Alan Yetkili'}
          </div>
          <div className="text-[9px] text-slate-400">Ad Soyad / İmza / Kaşe</div>
        </div>
      </div>

    </div>
  );
}

// =========================================================================================
// ŞABLON 3: GİB İRSALİYELİ RESMİ e-ARŞİV FATURA (SEVK VE LOJİSTİK STANDARDI)
// =========================================================================================
function CompactDeliveryTemplate({
  invoice,
  taxBreakdown,
  formattedDate,
  formattedTime,
  dueDateFormatted,
  amountInWords,
  companySettings
}: any) {
  const isSales = invoice.type === 'sales';
  const isCancelled = invoice.status === 'cancelled';
  const invoiceTitle = isCancelled 
    ? 'İPTAL EDİLMİŞ FATURA' 
    : (isSales ? 'İRSALİYELİ e-ARŞİV FATURA' : 'İRSALİYELİ ALIŞ FATURASI');

  const compName = companySettings?.companyName || 'ProERP Ayakkabı';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'PROERP AYAKKABI SAN. VE TİC. LTD. ŞTİ.';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'Organize Sanayi Bölgesi 12. Cadde No: 45 / Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7340592811';
  const compTradeReg = companySettings?.tradeRegistryNo || '948123-5';
  const compPhone = companySettings?.phone || '(0212) 555 01 99';
  const compEmail = companySettings?.email || 'muhasebe@proerp.com';
  const compWebsite = companySettings?.website || 'www.proerp.com.tr';
  const compBank = companySettings?.bankName || 'T.C. Ziraat Bankası - İkitelli Şubesi';
  const compIban = companySettings?.iban || 'TR33 0001 0002 0003 0004 0005 01';

  return (
    <div className="space-y-3.5 font-sans text-xs text-slate-900 dark:text-slate-100">
      
      {/* 1. Resmi İrsaliye Yerine Geçer Yasal İhtar Şeridi */}
      <div className="bg-emerald-800 text-white p-2 rounded text-[10px] text-center font-bold tracking-wide border border-emerald-900 space-y-0.5">
        <div className="uppercase tracking-widest text-[11px] font-black flex items-center justify-center gap-2">
          <span>★</span>
          <span>509 SIRA NO.LU VUK GENEL TEBLİĞİ UYARINCA İRSALİYE YERİNE GEÇER</span>
          <span>★</span>
        </div>
        <div className="text-[9px] text-emerald-100 font-normal">
          Malın teslimi ve sevki anında düzenlenmiştir. Belge üzerinde düzenleme ve fiili sevk zamanı yer aldığından ayrıca sevk irsaliyesi aranmaz.
        </div>
      </div>

      {/* 2. Üst Başlık Şeridi: Sol Firma & Orta İrsaliyeli Rozet & Sağ Belge & Sevk Zamanı */}
      <div className="grid grid-cols-12 gap-3 pb-3 border-b-2 border-emerald-950 items-center">
        
        {/* Sol Sütun: Firma Bilgileri */}
        <div className="col-span-4 flex items-center gap-3">
          {compLogo ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center p-0.5 border border-emerald-300 shrink-0 overflow-hidden shadow-xs">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-emerald-950 rounded-lg flex items-center justify-center text-white font-black text-2xl tracking-tighter italic border border-emerald-900 shrink-0 shadow-xs">
              {compName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-sm tracking-tight text-emerald-950 leading-tight uppercase truncate">
              {compName}
            </div>
            <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider line-clamp-1">
              {compTitle}
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
              VKN: {compTaxNumber} | {compTaxOffice}
            </div>
          </div>
        </div>

        {/* Orta Sütun: GİB İrsaliyeli e-Arşiv Resmi Rozeti */}
        <div className="col-span-4 text-center flex flex-col items-center justify-center">
          <div className="flex items-center gap-1.5 px-3.5 py-1 bg-emerald-50 border border-emerald-300 rounded-md mb-1 shadow-2xs">
            <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
              ★
            </div>
            <span className="font-black text-emerald-950 tracking-wider text-xs uppercase">
              {invoiceTitle}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            T.C. Gelir İdaresi Başkanlığı e-Belge Sistemi
          </div>
          <div className="text-[8px] text-emerald-800 font-bold">
            Resmi Sevk & Satış Belgesi
          </div>
        </div>

        {/* Sağ Sütun: Fatura ve Fiili Sevk Tarihleri Kutusu */}
        <div className="col-span-4 text-right">
          <div className="inline-block bg-emerald-50/40 border border-emerald-300 rounded p-2 text-[10px] space-y-1 w-full text-left font-mono">
            <div className="flex justify-between border-b border-emerald-200 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">Fatura No:</span>
              <span className="font-black text-emerald-950">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Düzenleme Tarihi/Saati:</span>
              <span className="font-bold">{formattedDate} {formattedTime}</span>
            </div>
            <div className="flex justify-between text-emerald-900 font-bold border-t border-emerald-200 pt-0.5">
              <span className="font-sans">Fiili Sevk Tarihi/Saati:</span>
              <span>{formattedDate} {formattedTime}</span>
            </div>
            {dueDateFormatted && (
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span className="font-sans">Vade Tarihi:</span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. ETTN (UUID) ve Lojistik Sevk / Taşıma Şeridi */}
      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 rounded p-2 text-[10px] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-600 uppercase">ETTN:</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 break-all">{invoice.ettn || '00000000-0000-0000-0000-000000000000'}</span>
        </div>
        <div className="flex items-center gap-4 text-slate-700 dark:text-slate-200">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Taşıma Türü: </span>
            <span className="font-bold uppercase">Karayolu (Özmal / Ambar)</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Senaryo: </span>
            <span className="font-black uppercase">{invoice.scenario === 'commercial' ? 'TİCARİ FATURA' : 'TEMEL FATURA'}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Para Birimi: </span>
            <span className="font-black font-mono">{invoice.currency || 'TRY'}</span>
          </div>
        </div>
      </div>

      {/* 4. Satıcı Bilgileri & Alıcı / Teslimat (Sevk) Adresi Kutusu */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* SATICI KUTUSU */}
        <div className="border border-slate-300 rounded p-2.5 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SATICI BİLGİLERİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase">
            {compTitle}
          </div>
          <div className="text-slate-600">
            {compAddress}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div><span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {compTaxOffice} | <span className="font-sans font-bold text-slate-600">VKN:</span> {compTaxNumber}</div>
            <div><span className="font-sans font-bold text-slate-600">Tic. Sicil:</span> {compTradeReg}</div>
            <div><span className="font-sans font-bold text-slate-600">Tel:</span> {compPhone} | <span className="font-sans font-bold text-slate-600">E-Posta:</span> {compEmail}</div>
          </div>
        </div>

        {/* ALICI VE SEVK / TESLİMAT KUTUSU */}
        <div className="border border-slate-300 rounded p-2.5 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-emerald-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            ALICI VE TESLİMAT / SEVK ADRESİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {invoice.contact?.companyTitle || invoice.contact?.name || 'MÜŞTERİ BİLGİSİ GİRİLMEMİŞ'}
          </div>
          <div className="text-slate-600">
            <span className="font-bold text-slate-700 dark:text-slate-200">Sevk Adresi: </span>
            {invoice.contact?.address || 'Belirtilmemiştir.'}
            {invoice.contact?.district ? ` ${invoice.contact.district} /` : ''}
            {invoice.contact?.city ? ` ${invoice.contact.city}` : ''}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div>
              <span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {invoice.contact?.taxOffice ? `${invoice.contact.taxOffice} V.D.` : '-'} | 
              <span className="font-sans font-bold text-slate-600 ml-1">VKN/TCKN:</span> {invoice.contact?.taxNumber || invoice.contact?.tcKimlik || '11111111111'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">Cari Kodu:</span> {invoice.contact?.code || '-'} | 
              <span className="font-sans font-bold text-slate-600 ml-1">İletişim:</span> {invoice.contact?.phone || invoice.contact?.email || '-'}
            </div>
          </div>
        </div>

      </div>

      {/* 5. Bağlı Sipariş & Sevk Notu */}
      <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-sans font-bold text-slate-600">Bağlı Sipariş No: </span>
            <span className="font-bold text-emerald-800">{invoice.orderNumber || (invoice.orderId ? `SIP-${invoice.orderId}` : '-')}</span>
          </div>
          {invoice.waybillNumber && (
            <div>
              <span className="font-sans font-bold text-slate-600">İrsaliye No: </span>
              <span className="font-bold text-purple-800">{invoice.waybillNumber}</span>
            </div>
          )}
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş Tarihi: </span>
            <span>{invoice.order?.date ? new Date(invoice.order.date).toLocaleDateString('tr-TR') : formattedDate}</span>
          </div>
        </div>
        <div className="text-slate-600 font-sans italic">
          {invoice.waybillNumber 
            ? `* İrsaliye (${invoice.waybillNumber}) istinaden faturalandırılmıştır.` 
            : '* İrsaliyeli faturadaki mallar hasarsız ve tam teslim alınmıştır.'}
        </div>
      </div>

      {/* 6. Mal / Hizmet Satırları Tablosu (Tam 10 Sütunlu VUK Standardı) */}
      <div className="border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-slate-800 text-white font-bold uppercase tracking-wider text-[9px]">
            <tr>
              <th className="p-2 text-center border-r border-slate-700 w-8">S.No</th>
              <th className="p-2 border-r border-slate-700">Mal / Hizmet Açıklaması (Sevk Edilen)</th>
              <th className="p-2 text-right border-r border-slate-700 w-16">Miktar</th>
              <th className="p-2 text-center border-r border-slate-700 w-12">Birim</th>
              <th className="p-2 text-right border-r border-slate-700 w-20">Birim Fiyat</th>
              <th className="p-2 text-right border-r border-slate-700 w-14">İskonto</th>
              <th className="p-2 text-right border-r border-slate-700 w-20">Mal/Hizmet Tutarı</th>
              <th className="p-2 text-center border-r border-slate-700 w-12">KDV %</th>
              <th className="p-2 text-right border-r border-slate-700 w-18">KDV Tutarı</th>
              <th className="p-2 text-right w-24">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item: any, idx: number) => {
                const lineDiscount = Number(item.discountAmount) || 0;
                const lineMatrah = (Number(item.quantity) * Number(item.unitPrice)) - lineDiscount;
                const lineTax = Number(item.taxAmount) || (lineMatrah * ((Number(item.taxRate) || 0) / 100));
                const lineTotal = Number(item.total) || (lineMatrah + lineTax);

                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-sans">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.productName}</div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        {item.productCode && <span>Kod: {item.productCode}</span>}
                        {item.color && <span>Renk: {item.color}</span>}
                        {item.size && <span>Beden/No: {item.size}</span>}
                      </div>
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">{item.quantity}</td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-600 font-sans">{item.unit || 'Çift'}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{Number(item.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-rose-600">
                      {Number(item.discountRate) > 0 ? `%${item.discountRate}` : '-'}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{lineMatrah.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 font-bold">%{item.taxRate}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                      ₺{lineTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-950">
                      ₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="p-4 text-center text-slate-400 font-sans">
                  Faturaya ait sevk veya ürün kalemi bulunmamaktadır.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Alt Bölüm: KDV Dağılımı Tablosu + QR + Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1 items-start">
        
        {/* Sol Alan: KDV Tablosu & Banka & Karekod */}
        <div className="col-span-7 space-y-2">
          
          {/* Resmi KDV Dağılım Tablosu */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <div className="bg-slate-800 text-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex justify-between">
              <span>KDV Matrah & Vergi Dağılım Tablosu</span>
              <span className="font-mono text-slate-300">VUK-509</span>
            </div>
            <table className="w-full text-[9px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 font-bold text-slate-800 dark:text-slate-200">
                <tr>
                  <th className="p-1.5 text-center border-r border-slate-300">KDV Oranı</th>
                  <th className="p-1.5 text-right border-r border-slate-300">Vergi Hariç Tutar (Matrah)</th>
                  <th className="p-1.5 text-right border-r border-slate-300">Hesaplanan KDV</th>
                  <th className="p-1.5 text-right">KDV Dahil Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {Object.keys(taxBreakdown).length > 0 ? (
                  Object.entries(taxBreakdown).map(([rate, vals]: [string, any]) => (
                    <tr key={rate}>
                      <td className="p-1.5 text-center font-bold border-r border-slate-200 dark:border-slate-700">%{rate}</td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700">
                        ₺{Number(vals?.matrah || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                        ₺{Number(vals?.tax || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right font-bold text-slate-900 dark:text-slate-100">
                        ₺{Number(vals?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-1.5 text-center text-slate-400 font-sans">KDV bilgisi yok</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Banka & Sevk Açıklaması */}
          <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] space-y-1">
            {invoice.notes && (
              <div className="pb-1 border-b border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-200">Sevk / Teslimat Notu: </span>
                <span className="text-slate-700 dark:text-slate-200">{invoice.notes}</span>
              </div>
            )}
            <div className="text-[9px] text-slate-600">
              <span className="font-bold text-slate-800 dark:text-slate-200">Banka IBAN: </span>
              {compBank} | {compIban} (TRY)
            </div>
          </div>

          {/* Resmi Karekod & VUK Bilgilendirme */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-14 h-14 border border-slate-300 rounded p-1 flex items-center justify-center bg-white dark:bg-slate-900 shadow-2xs">
              <QrCode className="w-12 h-12 text-slate-900 dark:text-slate-100" />
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Karekodlu İrsaliyeli e-Arşiv Belge Doğrulama:</span>
              Bu belge 509 Sıra No.lu VUK Tebliği gereğince elektronik ortamda sevk irsaliyesi ve fatura olarak tanzim edilmiştir. 5070 Sayılı Kanun gereği e-imzalıdır.
            </div>
          </div>

        </div>

        {/* Sağ Alan: Resmi Toplamlar Tablosu */}
        <div className="col-span-5 space-y-2">
          
          <div className="border-2 border-slate-900 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-700 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span>Mal / Hizmet Toplam Tutarı:</span>
              <span className="font-mono font-bold">
                ₺{Number(invoice.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-rose-600 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Toplam İskonto Tutarı:</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.discountTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-800 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold">Hesaplanan KDV:</span>
              <span className="font-mono font-bold text-indigo-700">
                ₺{Number(invoice.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.withholdingAmount) > 0 && (
              <div className="flex justify-between text-purple-700 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Tevkifat Tutarı ({invoice.withholdingRate || 5}/10):</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.withholdingAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline font-sans">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">ÖDENECEK TOPLAM:</span>
              <span className="text-lg font-black font-mono text-slate-950">
                ₺{Number(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* YAZIYLA TUTAR KUTUSU */}
          <div className="border border-slate-300 rounded p-2 bg-slate-100 dark:bg-slate-800 text-[9px] text-center font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            YALNIZ: {amountInWords}
          </div>

        </div>

      </div>

      {/* 8. Üçlü Resmi Lojistik / Sevk İmzaları (GİB İrsaliyeli Fatura Standardı) */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-300 text-center text-[10px]">
        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">1. Düzenleyen / Muhasebe</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50/50">
            <span className="font-sans font-bold text-[9px] text-slate-800 dark:text-slate-200">ProERP Muhasebe</span>
            <span className="text-[8px] text-slate-400">e-İmza ile Onaylıdır</span>
          </div>
          <div className="text-[8px] text-slate-400">İmza / Kaşe</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">2. Taşıyıcı / Şoför (Teslim Eden)</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50/50">
            <span className="font-sans font-bold text-[9px] text-slate-700 dark:text-slate-200">Firma Sevkiyat Sorumlusu</span>
            <span className="text-[8px] text-slate-400">Araç Plaka / Ehliyet No</span>
          </div>
          <div className="text-[8px] text-slate-400">Ad Soyad / İmza</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">3. Teslim Alan / Müşteri</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-600 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50/50">
            <span className="font-sans font-bold text-[9px] text-slate-800 dark:text-slate-200 truncate max-w-[140px]">{invoice.contact?.name || 'Teslim Alan'}</span>
            <span className="text-[8px] text-slate-400">Malları Hasarsız Teslim Aldım</span>
          </div>
          <div className="text-[8px] text-slate-400">Kaşe / İmza / Tarih</div>
        </div>
      </div>

    </div>
  );
}
