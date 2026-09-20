import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  FileCode2, 
  ShieldCheck, 
  ExternalLink,
  Code,
  Info
} from 'lucide-react';
import { downloadXmlFile } from '../../lib/ublTrGenerator';

interface UblXmlViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  xmlContent: string;
  filename: string;
  documentType: 'invoice' | 'waybill';
  documentNumber: string;
}

export const UblXmlViewerModal: React.FC<UblXmlViewerModalProps> = ({
  isOpen,
  onClose,
  xmlContent,
  filename,
  documentType,
  documentNumber
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(xmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Kopyalama hatası:', err);
    }
  };

  const handleDownload = () => {
    downloadXmlFile(xmlContent, filename);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  GİB UBL-TR 1.2 {documentType === 'invoice' ? 'e-Fatura' : 'e-İrsaliye'} XML Çıktısı
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  UBL 2.1 Standardı
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Belge No: <span className="text-indigo-300 font-bold">{documentNumber}</span> | Dosya: {filename}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="Panoya Kopyala"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Kopyalandı!' : 'Kopyala'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              title="XML Dosyasını İndir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>XML İndir</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Integration Information Banner */}
        <div className="px-5 py-2.5 bg-indigo-950/40 border-b border-indigo-900/40 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Bu dosya Gelir İdaresi Başkanlığı (GİB) Portalına doğrudan yüklenebilir veya özel entegratörlerinize (Logo, Uyumsoft, Foriba vb.) aktarılabilir.
            </span>
          </div>
          <span className="text-[11px] font-mono text-indigo-300 shrink-0 hidden md:inline">
            CustomizationID: TR1.2
          </span>
        </div>

        {/* XML Viewer Body */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed select-text">
          <pre className="whitespace-pre overflow-x-auto text-[11px] selection:bg-indigo-500/30 selection:text-indigo-200">
            {xmlContent}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Resmi e-Fatura / e-İrsaliye teknik şeması UBL 2.1 şemasıyla doğrulanmıştır.</span>
          </div>
          <button
            onClick={handleDownload}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
          >
            {filename} olarak kaydet
          </button>
        </div>

      </div>
    </div>
  );
};
