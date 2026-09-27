import { useState } from 'react';
import { Mail, X, Check, Copy, ExternalLink } from 'lucide-react';

interface PoEmailModalProps {
  initialSubject: string;
  initialBody: string;
  initialRecipient: string;
  onClose: () => void;
}

export function PoEmailModal({ initialSubject, initialBody, initialRecipient, onClose }: PoEmailModalProps) {
  const [emailSubject, setEmailSubject] = useState(initialSubject);
  const [emailBody, setEmailBody] = useState(initialBody);
  const [emailRecipient, setEmailRecipient] = useState(initialRecipient);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailBody);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 text-white max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-black text-white">
                  Tedarikçiye E-Posta İle Sipariş Gönder
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs flex-1 min-h-0 overflow-y-auto">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Alıcı Tedarikçi E-Posta:</label>
                <input
                  type="email"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  placeholder="tedarikci@firma.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">E-Posta Konusu:</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Mesaj Metni & Beden Dağılımı:</label>
                <textarea
                  rows={9}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono text-[11px] leading-relaxed focus:outline-hidden focus:border-blue-500 select-text"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
              >
                {copiedEmail ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedEmail ? 'Metin Kopyalandı!' : 'Metni Kopyala'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Kapat
                </button>
                <a
                  href={`mailto:${emailRecipient}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mail İstemcisinde Aç</span>
                </a>
              </div>
            </div>
          </div>
        </div>
  );
}
