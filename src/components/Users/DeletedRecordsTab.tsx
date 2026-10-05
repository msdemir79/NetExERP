import React, { useState } from 'react';
import { Trash2, Download, ShieldAlert, Info } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { userService } from '../../services/userService';
import { exportToCsv } from '../../lib/exportService';
import { showToast } from '../../lib/feedback';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from '../Common/DataGrid';
import type { AuditLog } from '../../types';
import { ALL_APP_MODULES } from '../../data/initialRoles';

/** Satırın ekran adı: kayıt tanıtıcısı varsa o, yoksa açıklama. */
function recordLabel(log: AuditLog): string {
  return log.recordSummary?.trim() || log.description;
}

function moduleLabel(moduleId: string): string {
  return ALL_APP_MODULES.find(m => m.id === moduleId)?.name || moduleId;
}

function formatTimestamp(value: Date | string): string {
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export default function DeletedRecordsTab() {
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const logs = useApiQuery(
    () => userService.getDeletedRecords({ module: selectedModule }),
    [selectedModule],
    ['auditLogs']
  ) || [];

  const deniedCount = logs.filter(l => l.action === 'delete_denied').length;

  const columns: GridColumn<AuditLog>[] = [
    {
      key: 'timestamp',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
          {formatTimestamp(log.timestamp)}
        </span>
      ),
      sortValue: (log) => new Date(log.timestamp).getTime(),
    },
    {
      key: 'userName',
      title: 'Kullanıcı & Rol',
      render: (log) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {log.userName}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5">
            {log.userRole}
          </div>
        </>
      ),
      filterValue: (log) => `${log.userName} ${log.userRole}`,
    },
    {
      key: 'module',
      title: 'Modül',
      render: (log) => <StatusPill tone="slate">{moduleLabel(log.module)}</StatusPill>,
      filterValue: (log) => moduleLabel(log.module),
    },
    {
      key: 'action',
      title: 'Sonuç',
      render: (log) => {
        const tone: PillTone = log.action === 'delete_denied' ? 'amber' : 'red';
        const label = log.action === 'delete_denied' ? 'Reddedildi' : 'Silindi';
        return <StatusPill tone={tone}>{label}</StatusPill>;
      },
      filterValue: (log) => (log.action === 'delete_denied' ? 'Reddedildi' : 'Silindi'),
    },
    {
      key: 'recordSummary',
      title: 'Kayıt',
      render: (log) => (
        <>
          <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
            {recordLabel(log)}
          </div>
          {log.details && (
            <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 mt-0.5">
              {log.details}
            </div>
          )}
        </>
      ),
      filterValue: (log) => `${recordLabel(log)} ${log.description} ${log.details ?? ''}`,
    },
    {
      key: 'reason',
      title: 'Gerekçe',
      render: (log) => (
        <span className="text-slate-700 dark:text-slate-300 line-clamp-2">
          {log.reason?.trim() || (log.action === 'delete_denied' ? 'Parola doğrulanamadı' : '—')}
        </span>
      ),
      filterValue: (log) => log.reason ?? '',
    },
    {
      key: 'ipAddress',
      title: 'İstemci IP',
      align: 'right',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
          {log.ipAddress || '—'}
        </span>
      ),
      filterValue: (log) => log.ipAddress ?? '',
    },
  ];

  const handleExport = () => {
    if (logs.length === 0) {
      showToast('Dışa aktarılacak silme kaydı bulunamadı.', 'warning');
      return;
    }

    const headers = ['Tarih & Saat', 'Kullanıcı', 'Rolü', 'Modül', 'Sonuç', 'Kayıt', 'Açıklama', 'Birlikte Silinenler', 'Gerekçe', 'IP Adresi'];
    const rows = logs.map(l => [
      formatTimestamp(l.timestamp),
      l.userName,
      l.userRole,
      moduleLabel(l.module),
      l.action === 'delete_denied' ? 'Reddedildi' : 'Silindi',
      recordLabel(l),
      l.description,
      l.details || '-',
      l.reason || '-',
      l.ipAddress || '-'
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(`ProERP_Silinen_Kayitlar_${dateStr}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="w-full sm:w-52">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">Tüm Modüller</option>
              <option value="users">Kullanıcılar & Roller</option>
              {ALL_APP_MODULES.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
            <span className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold">
              {logs.length - deniedCount} silinen
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold">
              {deniedCount} reddedilen
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Excel'e Aktar
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p>
          Silme hareketleri kalıcıdır: bu liste kimin, ne zaman, hangi kaydı sildiğini gösterir ancak
          kaydı geri yüklemez. Kurtarma yalnızca <code className="font-mono text-slate-900 dark:text-slate-100">npm run db:restore</code> ile
          alınan yedekten yapılır. Kademe 2 kayıtlarda gerekçe ve parola doğrulaması zorunludur; hatalı
          parola denemeleri de "Reddedildi" olarak burada iz bırakır.
        </p>
      </div>

      <DataGrid
        columns={columns}
        data={logs}
        rowKey={(log) => log.id ?? `${new Date(log.timestamp).getTime()}-${log.userName}`}
        onRowClick={(log) => setSelected(log)}
        defaultSort={{ key: 'timestamp', dir: 'desc' }}
        emptyMessage="Seçili modüle ait silme hareketi bulunamadı."
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Silinen Kayıtlar ({logs.length})
              </h3>
            </div>
            <span className="ml-auto text-[11px] text-slate-600 dark:text-slate-400">
              Denetim izinden otomatik süzülür (salt okunur)
            </span>
          </>
        }
      />

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className={`px-5 py-4 flex items-center justify-between shrink-0 text-white ${selected.action === 'delete_denied' ? 'bg-amber-600' : 'bg-rose-700'}`}>
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-sm font-bold">
                  {selected.action === 'delete_denied' ? 'Reddedilen Silme Denemesi' : 'Silme Hareketi Detayı'}
                </h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/80 hover:text-white p-1">✕</button>
            </div>

            <div className="p-5 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">Tarih & Saat</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatTimestamp(selected.timestamp)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">Sonuç</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {selected.action === 'delete_denied' ? 'Reddedildi' : 'Kalıcı olarak silindi'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">İşlemi Yapan</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{selected.userName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">Rolü</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selected.userRole}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">Modül</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{moduleLabel(selected.module)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block">İstemci IP</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selected.ipAddress || '—'}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block mb-1">Silinen Kayıt</span>
                <p className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100">
                  {recordLabel(selected)}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block mb-1">Açıklama</span>
                <p className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                  {selected.description}
                </p>
              </div>

              {selected.details && (
                <div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block mb-1">Birlikte Silinenler</span>
                  <p className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    {selected.details}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase block mb-1">Gerekçe</span>
                <p className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {selected.reason?.trim() || (selected.action === 'delete_denied' ? 'Parola doğrulanamadı; kayıt silinmedi.' : 'Gerekçe girilmedi (bu kademe için zorunlu değil).')}
                </p>
              </div>

              {selected.entityId != null && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400">
                  Kayıt kimliği: <strong className="font-mono text-slate-900 dark:text-slate-100">{String(selected.entityId)}</strong>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 text-right">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
