import React, { useEffect, useState } from 'react';
import {
  Cpu,
  RefreshCw,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  MonitorSmartphone
} from 'lucide-react';
import type { DesktopUpdateState, DesktopVersionInfo } from '../../types/desktop';

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatSpeed(bytesPerSecond?: number) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  return `${formatBytes(bytesPerSecond)}/sn`;
}

function formatReleaseDate(date?: string) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function UpdateSettings() {
  const desktop = window.proerpApp;
  const [versionInfo, setVersionInfo] = useState<DesktopVersionInfo | null>(null);
  const [update, setUpdate] = useState<DesktopUpdateState>({ status: 'idle' });
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop) return;
    desktop.getVersion().then(setVersionInfo).catch(() => { /* köprü hazır değil */ });
    desktop.getUpdateState().then(setUpdate).catch(() => { /* henüz durum yok */ });
    return desktop.onUpdateState(setUpdate);
  }, [desktop]);

  const handleCheck = async () => {
    if (!desktop || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      const res = await desktop.checkForUpdates();
      if (!res.ok && res.error) setActionError(res.error);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!desktop || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      const res = await desktop.downloadUpdate();
      if (!res.ok && res.error) setActionError(res.error);
    } finally {
      setIsBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!desktop || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      const res = await desktop.installUpdate();
      if (!res.ok && res.error) {
        setActionError(res.error);
        setIsBusy(false);
      }
      // Başarılıysa uygulama yeniden başlayacak; busy kalması doğal.
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setIsBusy(false);
    }
  };

  const checking = update.status === 'checking' || (isBusy && update.status === 'idle');
  const percent = Math.max(0, Math.min(100, Math.round(update.percent || 0)));

  const renderUpdateBody = () => {
    // Tarayıcıdan erişim: masaüstü köprüsü yok.
    if (!desktop) {
      return (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-start gap-3">
          <MonitorSmartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Masaüstü uygulaması gerekiyor</h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 leading-relaxed">
              Otomatik güncelleme denetimi yalnız ProERP masaüstü (Windows) uygulamasında kullanılabilir.
              Tarayıcıdan eriştiğiniz bu sunucunun sürümünü sistem yöneticiniz güncelleyebilir.
            </p>
          </div>
        </div>
      );
    }

    // Geliştirme modunda gereksiz denetim yapılmaz.
    if (versionInfo && !versionInfo.updatesEnabled) {
      return (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">Geliştirme modunda güncelleme denetimi yapılmaz</h4>
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium mt-1">
              Bu oturum paketlenmiş bir ProERP sürümü değil; otomatik güncelleme yalnız kurulu üretim sürümünde etkindir.
            </p>
          </div>
        </div>
      );
    }

    switch (update.status) {
      case 'available':
        return (
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                    Yeni sürüm bulundu: v{update.version}
                  </h4>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 font-semibold mt-0.5">
                    Mevcut sürüm: v{versionInfo?.version || '—'}
                    {update.releaseDate ? ` · Yayın tarihi: ${formatReleaseDate(update.releaseDate)}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isBusy}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Güncellemeyi İndir
              </button>
            </div>
            {update.releaseNotes && (
              <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 rounded-lg p-3">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Sürüm Notları</p>
                <pre className="text-[11px] text-slate-700 dark:text-slate-200 font-medium whitespace-pre-wrap leading-relaxed">{update.releaseNotes}</pre>
              </div>
            )}
          </div>
        );

      case 'downloading':
        return (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Güncelleme indiriliyor... %{percent}
                </h4>
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {formatBytes(update.transferred)} / {formatBytes(update.total)}
                {formatSpeed(update.bytesPerSecond) ? ` · ${formatSpeed(update.bytesPerSecond)}` : ''}
              </span>
            </div>
            <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(percent, 2)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              Uygulamayı kapatmadan çalışmaya devam edebilirsiniz; indirme arka planda tamamlanır.
            </p>
          </div>
        );

      case 'downloaded':
        return (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                  Yeni sürüm hazır: v{update.version}
                </h4>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                  Güncelleme indirildi ve bütünlüğü doğrulandı. Yeniden başlatıldığında otomatik uygulanır — kurulum dosyasını elle çalıştırmanız gerekmez.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              disabled={isBusy}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Şimdi Yeniden Başlat
            </button>
          </div>
        );

      case 'not-available':
        return (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">ProERP güncel.</h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                Yüklü sürümünüz (v{versionInfo?.version || update.version || '—'}) en son yayınlanan sürümdür.
              </p>
            </div>
          </div>
        );

      case 'checking':
        return (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Güncellemeler kontrol ediliyor...</h4>
          </div>
        );

      case 'error':
        return (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-rose-900 dark:text-rose-200 uppercase tracking-wider">Yeni sürüm kontrol edilemedi.</h4>
                <p className="text-xs text-rose-800 dark:text-rose-300 font-medium mt-0.5">
                  Uygulama çalışmaya devam ediyor; internet bağlantınızı kontrol edip tekrar deneyebilirsiniz.
                </p>
                {update.message && (
                  <p className="text-[11px] text-rose-700 dark:text-rose-400 font-medium mt-1 bg-rose-100/70 dark:bg-rose-900/30 rounded-md px-2 py-1">
                    {update.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      default: // idle
        return (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Güncellemeleri kontrol et</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                  Yüklü sürümünüzden yeni bir ProERP sürümü yayınlanıp yayınlanmadığını şimdi denetleyin.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCheck}
              disabled={isBusy || checking}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              Güncellemeleri Kontrol Et
            </button>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      {actionError && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-4 rounded-xl flex items-start justify-between shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            <p className="text-xs font-bold">{actionError}</p>
          </div>
        </div>
      )}

      {/* SECTION 1: SİSTEM BİLGİLERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Sistem Bilgileri</h3>
              <p className="text-slate-400 text-xs font-medium">Yüklü ProERP sürümü ve çalışma ortamı</p>
            </div>
          </div>
          <span className="text-sm font-black tracking-tight bg-white/10 border border-white/20 rounded-lg px-3 py-1.5">
            ProERP v{versionInfo?.version || (desktop ? '—' : 'web')}
          </span>
        </div>
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'ProERP Sürümü', value: versionInfo?.version || (desktop ? '—' : 'Tarayıcı') },
            { label: 'Electron', value: versionInfo?.electron || '—' },
            { label: 'Node.js', value: versionInfo?.node || '—' },
            { label: 'Platform', value: versionInfo ? (versionInfo.platform === 'win32' ? 'Windows (x64)' : versionInfo.platform) : 'web' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.label}</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: GÜNCELLEMELER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Güncellemeler</h3>
              <p className="text-slate-400 text-xs font-medium">Yeni sürüm denetimi, indirme ve otomatik kurulum</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {renderUpdateBody()}
          <div className="flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-px" />
            <p>
              Güncellemeler GitHub üzerinden SHA-512 bütünlük doğrulamasıyla indirilir ve kurulumdan önce denetlenir.
              Uygulama açılışında arka planda da denetim yapılır; çevrimdışıysanız ProERP normal çalışmaya devam eder.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
