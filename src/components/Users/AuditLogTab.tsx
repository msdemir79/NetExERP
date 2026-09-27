import React, { useState } from 'react';
import {
  FileText,
  Download
} from 'lucide-react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { userService } from '../../services/userService';
import { exportToCsv } from '../../lib/exportService';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from '../Common/DataGrid';
import type { AuditLog, AuditActionType } from '../../types';
import { ALL_APP_MODULES } from '../../data/initialRoles';

const ACTION_LABELS: Record<AuditActionType, { label: string; tone: PillTone }> = {
  create: { label: 'Yeni Kayıt', tone: 'green' },
  update: { label: 'Güncelleme', tone: 'blue' },
  delete: { label: 'Silme / İptal', tone: 'red' },
  login: { label: 'Oturum Açma', tone: 'cyan' },
  logout: { label: 'Çıkış Yapma', tone: 'slate' },
  export: { label: 'Dışa Aktarma', tone: 'amber' },
  approve: { label: 'Özel Onay', tone: 'violet' },
  status_change: { label: 'Durum Değişimi', tone: 'orange' },
  permission_change: { label: 'Yetki Güncellemesi', tone: 'blue' },
  system: { label: 'Sistem Olayı', tone: 'slate' }
};

export default function AuditLogTab() {
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);

  // Live query for audit logs sorted by reverse timestamp
  const logs = useApiQuery(() => userService.getAuditLogs({
    search: '',
    module: selectedModule,
    action: selectedAction
  }), [selectedModule, selectedAction], ['auditLogs']) || [];

  const logColumns: GridColumn<AuditLog>[] = [
    {
      key: 'timestamp',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600">
          {new Date(log.timestamp).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </span>
      ),
    },
    {
      key: 'userName',
      title: 'Kullanıcı & Rol',
      render: (log) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {log.userName}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            {log.userRole}
          </div>
        </>
      ),
      filterValue: (log) => `${log.userName} ${log.userRole}`,
    },
    {
      key: 'module',
      title: 'Modül',
      render: (log) => (
        <StatusPill tone="slate" className="font-mono uppercase">{log.module}</StatusPill>
      ),
    },
    {
      key: 'action',
      title: 'İşlem Türü',
      render: (log) => (
        <StatusPill tone={ACTION_LABELS[log.action]?.tone ?? 'slate'}>
          {ACTION_LABELS[log.action]?.label || log.action}
        </StatusPill>
      ),
      filterValue: (log) => ACTION_LABELS[log.action]?.label || log.action,
    },
    {
      key: 'description',
      title: 'İşlem Açıklaması & Detay',
      render: (log) => (
        <>
          <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
            {log.description}
          </div>
          {log.details && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
              {log.details}
            </div>
          )}
        </>
      ),
      filterValue: (log) => `${log.description} ${log.details ?? ''}`,
    },
    {
      key: 'ipAddress',
      title: 'İstemci IP',
      align: 'right',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-400">{log.ipAddress || '192.168.1.100'}</span>
      ),
      filterValue: (log) => log.ipAddress ?? '',
    },
  ];

  const handleExport = () => {
    if (logs.length === 0) {
      alert('Dışa aktarılacak denetim kaydı bulunamadı.');
      return;
    }

    const headers = [
      'Tarih & Saat',
      'Kullanıcı',
      'Rolü',
      'Modül',
      'Eylem Türü',
      'Açıklama',
      'Detay',
      'IP Adresi'
    ];

    const rows = logs.map(l => [
      new Date(l.timestamp).toLocaleString('tr-TR'),
      l.userName,
      l.userRole,
      l.module,
      ACTION_LABELS[l.action]?.label || l.action,
      l.description,
      l.details || '-',
      l.ipAddress || '192.168.1.100'
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(`ProERP_Denetim_Izi_${dateStr}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Module Filter */}
          <div className="w-full sm:w-48">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">Tüm Modüller</option>
              <option value="auth">Oturum / Giriş</option>
              <option value="users">Kullanıcılar & Roller</option>
              <option value="system">Sistem Olayları</option>
              {ALL_APP_MODULES.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div className="w-full sm:w-44">
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">Tüm Eylemler</option>
              {Object.entries(ACTION_LABELS).map(([actKey, actObj]) => (
                <option key={actKey} value={actKey}>{actObj.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Excel'e Aktar
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <DataGrid
        columns={logColumns}
        data={logs}
        rowKey={(log) => log.id ?? `${new Date(log.timestamp).getTime()}-${log.userName}`}
        onRowClick={(log) => setSelectedLogDetail(log)}
        emptyMessage="Henüz kayıtlı bir denetim hareketi bulunamadı. Sistemde işlem yapıldıkça hareketler burada listelenecektir."
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Kullanıcı İşlem Hareketleri ({logs.length} Kayıt)
              </h3>
            </div>
            <span className="ml-auto text-[11px] text-slate-400">
              Otomatik kaydedilen gerçek zamanlı denetim izi
            </span>
          </>
        }
      />

      {/* Log Detail Modal */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold">Denetim Hareketi Detayı</h3>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Tarih & Saat</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(selectedLogDetail.timestamp).toLocaleString('tr-TR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">İşlem Türü</span>
                  <span className="font-bold text-indigo-700">
                    {ACTION_LABELS[selectedLogDetail.action]?.label || selectedLogDetail.action}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">İşlemi Yapan</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLogDetail.userName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Rolü</span>
                  <span className="font-mono text-slate-700 dark:text-slate-200">
                    {selectedLogDetail.userRole}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Açıklama</span>
                <p className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-slate-100">
                  {selectedLogDetail.description}
                </p>
              </div>

              {selectedLogDetail.details && (
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ek Detaylar & Parametreler</span>
                  <p className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-200 text-[11px] whitespace-pre-wrap">
                    {selectedLogDetail.details}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Modül: <strong className="text-slate-800 dark:text-slate-200 uppercase">{selectedLogDetail.module}</strong></span>
                <span>İstemci: <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedLogDetail.ipAddress || '192.168.1.100'}</strong></span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 text-right">
              <button
                onClick={() => setSelectedLogDetail(null)}
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
