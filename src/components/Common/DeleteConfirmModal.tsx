import React, { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle, Trash2, ShieldAlert, KeyRound, Loader2, Link2 } from 'lucide-react';
import { deleteApi, type DeletePlan } from '../../api/client';

/**
 * Ortak silme onay modalı.
 *
 * Sunucudan silme planını çeker ve kademeeye göre davranır:
 *   0 — tek onay,  1 — cascade/uyarı listesiyle onay,
 *   2 — gerekçe + oturum parolası,  3 — silme kapalı (yalnızca bilgi).
 *
 * Silme fizikseldir; bakiye/stok gibi türetilmiş alanlar sunucuda geri
 * hesaplanır. Bu nedenle modal "ne silinecek / ne değişecek" bilgisini
 * göstermekle yükümlüdür.
 */

interface DeleteConfirmModalProps {
  resource: string;
  id: string | number | null;
  /** Varsayılan başlık "<Tür> Kaydını Sil" biçimindedir. */
  title?: string;
  onClose: () => void;
  onDeleted?: (message: string) => void;
}

const TIER_META: Record<number, { label: string; className: string }> = {
  0: { label: 'Standart silme', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  1: { label: 'Uyarılı silme', className: 'bg-amber-100 text-amber-900' },
  2: { label: 'Şifreli silme', className: 'bg-rose-100 text-rose-800' },
  3: { label: 'Silinemez', className: 'bg-slate-800 text-white' },
};

export default function DeleteConfirmModal({ resource, id, title, onClose, onDeleted }: DeleteConfirmModalProps) {
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id === null || id === undefined) return;
    setLoading(true);
    setLoadError(null);
    try {
      setPlan(await deleteApi.plan(resource, id));
    } catch (err: any) {
      setLoadError(err?.message || 'Silme bilgisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [resource, id]);

  useEffect(() => {
    setPlan(null);
    setReason('');
    setPassword('');
    setError(null);
    load();
  }, [load]);

  if (id === null || id === undefined) return null;

  const blocked = plan?.blocked ?? null;
  const tier = plan?.tier ?? 0;
  const tierMeta = TIER_META[tier] || TIER_META[0];
  const needsReason = Boolean(plan?.reasonRequired);
  const needsPassword = Boolean(plan?.passwordRequired);
  const reasonOk = !needsReason || reason.trim().length >= 3;
  const passwordOk = !needsPassword || password.length > 0;
  const canDelete = Boolean(plan) && !blocked && reasonOk && passwordOk;

  const handleDelete = async () => {
    if (!plan || !canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteApi.remove(resource, id, {
        ...(needsReason ? { reason: reason.trim() } : {}),
        ...(needsPassword ? { password } : {}),
      });
      setPassword('');
      onDeleted?.(`${plan.label} kaydı silindi.`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Silme işlemi sırasında bir hata oluştu.');
      setPassword('');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        {/* Başlık */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-200">
              {blocked ? <ShieldAlert className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 tracking-tight">
                {title || (plan ? `${plan.label} Kaydını Sil` : 'Kaydı Sil')}
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                {blocked ? 'Bu kayıt silinemez' : 'Bu işlem geri alınamaz'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-rose-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="p-6 space-y-4 text-xs flex-1 min-h-0 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Silme bilgisi hazırlanıyor...
            </div>
          )}

          {!loading && loadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">{loadError}</div>
          )}

          {!loading && plan && (
            <>
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">{error}</div>
              )}

              {blocked ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-950">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    Silme Engellendi
                  </div>
                  <p className="leading-relaxed">{blocked.message}</p>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Kalıcı Olarak Silinecek
                  </div>
                  <p className="leading-relaxed">
                    Kayıt ve aşağıda listelenen bağlı kayıtlar veritabanından kaldırılır. Bakiye, stok ve
                    muhasebe etkileri aynı işlem içinde geri hesaplanır; ters kayıt oluşturulmaz.
                    Silinen kayıt yalnızca <strong>db:restore</strong> yedeğinden geri getirilebilir.
                  </p>
                </div>
              )}

              {/* Silinecek kayıt */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">Kayıt</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tierMeta.className}`}>
                    {tierMeta.label}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">{plan.summary}</p>
              </div>

              {/* Birlikte silinecekler */}
              {plan.cascade.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <Link2 className="w-3.5 h-3.5" />
                    Birlikte silinecek kayıtlar
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {plan.cascade.map((c) => (
                      <li key={c.label} className="px-4 py-2 flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{c.label}</span>
                        <span className="font-mono font-bold text-rose-700 dark:text-rose-400">{c.count} kayıt</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Uyarılar */}
              {plan.warnings.length > 0 && (
                <ul className="space-y-1.5">
                  {plan.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200 leading-relaxed">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Kademe 2: gerekçe + parola */}
              {needsReason && !blocked && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Silme gerekçesi <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Örn: hatalı cariye kesilmiş, belge iptal edildi"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      Gerekçe denetim kaydına yazılır ve "Silinen Kayıtlar" ekranında görünür.
                    </p>
                  </div>
                </div>
              )}

              {needsPassword && !blocked && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> Parolanız <span className="text-rose-600">*</span>
                    </span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Oturum parolanız"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    Parola yalnızca doğrulama için kullanılır; hiçbir yere kaydedilmez.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Alt şerit */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {blocked ? 'Kapat' : 'Vazgeç'}
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? 'Siliniyor...' : 'Evet, Sil'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
