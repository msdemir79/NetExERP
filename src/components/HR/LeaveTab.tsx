import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  User
} from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from '../Common/DataGrid';
import type { Employee, LeaveRequest, LeaveType } from '../../types';
import { hrService } from '../../services/hrService';

interface LeaveTabProps {
  employees: Employee[];
  onLeavesUpdated?: () => void;
}

const LEAVE_TYPE_CONFIG: Record<LeaveType, { label: string; tone: PillTone }> = {
  annual: { label: 'Yıllık İzin', tone: 'blue' },
  excuse: { label: 'Mazeret İzni', tone: 'amber' },
  unpaid: { label: 'Ücretsiz İzin', tone: 'slate' },
  sick: { label: 'Sağlık / Rapor', tone: 'violet' },
  marriage: { label: 'Evlilik İzni', tone: 'cyan' },
  maternity: { label: 'Doğum İzni', tone: 'cyan' },
  bereavement: { label: 'Vefat İzni', tone: 'slate' }
};

const LEAVE_STATUS_CONFIG: Record<LeaveRequest['status'], { label: string; tone: PillTone }> = {
  approved: { label: 'Onaylandı', tone: 'green' },
  pending: { label: 'Bekliyor', tone: 'amber' },
  rejected: { label: 'Reddedildi', tone: 'red' }
};

export default function LeaveTab({ employees, onLeavesUpdated }: LeaveTabProps) {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(employees[0]?.id || 0);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [days, setDays] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLeaves = async () => {
    try {
      setLoading(true);
      const data = await hrService.getLeaveRequests();
      setLeaves(data);
    } catch (err) {
      console.error('İzin kayıtları yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  // Recalculate days when start or end date changes
  useEffect(() => {
    if (startDate && endDate) {
      const d1 = new Date(startDate);
      const d2 = new Date(endDate);
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
      setDays(diffDays);
    }
  }, [startDate, endDate]);

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setFormError('Lütfen bir personel seçiniz.');
      return;
    }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) {
      setFormError('Seçilen personel bulunamadı.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      await hrService.addLeaveRequest({
        employeeId: emp.id!,
        employeeName: emp.name,
        leaveType,
        startDate,
        endDate,
        days: Number(days) || 1,
        status: 'pending',
        reason: reason.trim() || undefined
      });

      await loadLeaves();
      onLeavesUpdated?.();
      setIsModalOpen(false);
      setReason('');
    } catch (err: any) {
      setFormError(err?.message || 'İzin kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await hrService.approveLeaveRequest(id);
      await loadLeaves();
      onLeavesUpdated?.();
    } catch (err) {
      console.error('İzin onaylama hatası:', err);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await hrService.rejectLeaveRequest(id);
      await loadLeaves();
      onLeavesUpdated?.();
    } catch (err) {
      console.error('İzin reddetme hatası:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bu izin kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await hrService.deleteLeaveRequest(id);
      await loadLeaves();
      onLeavesUpdated?.();
    } catch (err) {
      console.error('İzin silme hatası:', err);
    }
  };

  const filteredLeaves = leaves.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  });

  const leaveColumns: GridColumn<LeaveRequest>[] = [
    {
      key: 'employeeName',
      title: 'Personel',
      render: (leave) => (
        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{leave.employeeName}</span>
      ),
      filterValue: (leave) => leave.employeeName
    },
    {
      key: 'leaveType',
      title: 'İzin Türü',
      render: (leave) => {
        const typeCfg = LEAVE_TYPE_CONFIG[leave.leaveType] || LEAVE_TYPE_CONFIG.annual;
        return <StatusPill tone={typeCfg.tone}>{typeCfg.label}</StatusPill>;
      },
      filterValue: (leave) => (LEAVE_TYPE_CONFIG[leave.leaveType] || LEAVE_TYPE_CONFIG.annual).label
    },
    {
      key: 'days',
      title: 'Gün',
      align: 'center',
      render: (leave) => (
        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{leave.days} Gün</span>
      ),
      filterValue: (leave) => String(leave.days)
    },
    {
      key: 'dates',
      title: 'Tarih Aralığı',
      render: (leave) => (
        <span className="font-mono text-[11px] text-slate-600">
          {new Date(leave.startDate).toLocaleDateString('tr-TR')} - {new Date(leave.endDate).toLocaleDateString('tr-TR')}
        </span>
      ),
      filterValue: (leave) =>
        `${new Date(leave.startDate).toLocaleDateString('tr-TR')} ${new Date(leave.endDate).toLocaleDateString('tr-TR')}`
    },
    {
      key: 'reason',
      title: 'Açıklama / Gerekçe',
      render: (leave) => (
        <span className="italic text-slate-500 dark:text-slate-400 max-w-xs truncate block">
          {leave.reason || '-'}
        </span>
      ),
      filterValue: (leave) => leave.reason ?? ''
    },
    {
      key: 'status',
      title: 'Durum',
      align: 'center',
      render: (leave) => (
        <StatusPill tone={LEAVE_STATUS_CONFIG[leave.status].tone}>
          {LEAVE_STATUS_CONFIG[leave.status].label}
        </StatusPill>
      ),
      filterValue: (leave) => LEAVE_STATUS_CONFIG[leave.status].label
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü ({leaves.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'pending' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Bekleyen ({leaves.filter(l => l.status === 'pending').length})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'approved' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Onaylanan ({leaves.filter(l => l.status === 'approved').length})
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            if (employees.length > 0) setSelectedEmployeeId(employees[0].id!);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni İzin Talebi
        </button>
      </div>

      {/* Grid: Leaves Table & Leave Balances Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Leave Requests List */}
        <div className="lg:col-span-2">
          <DataGrid
            columns={leaveColumns}
            data={filteredLeaves}
            rowKey={(leave) => leave.id ?? `${leave.employeeId}-${leave.startDate}`}
            loading={loading}
            emptyMessage="Kayıtlı izin talebi bulunmuyor."
            toolbar={
              <>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  İzin Talepleri & Geçmişi
                </h3>
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 font-medium">{filteredLeaves.length} Talep</span>
              </>
            }
            rowActions={(leave) => (
              <>
                {leave.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApprove(leave.id!)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Onayla
                    </button>
                    <button
                      onClick={() => handleReject(leave.id!)}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3 h-3" />
                      Reddet
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(leave.id!)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                  title="Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          />
        </div>

        {/* Right 1 Col: Employee Leave Balances Overview */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <User className="w-4 h-4 text-indigo-600" />
            Personel Yıllık İzin Durumu
          </h3>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {employees.map((emp) => {
              const entitled = emp.entitledAnnualLeave ?? 14;
              const used = emp.usedAnnualLeave ?? 0;
              const remaining = Math.max(0, entitled - used);
              const percent = Math.min(100, Math.round((used / (entitled || 1)) * 100));

              return (
                <div key={emp.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-800 dark:text-slate-200">{emp.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{emp.position}</p>
                    </div>
                    <span className="text-xs font-mono font-black text-indigo-600">
                      {remaining} Gün Kaldı
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        percent > 80 ? 'bg-rose-500' : percent > 50 ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>Hak Edilen: <b>{entitled}g</b></span>
                    <span>Kullanılan: <b>{used}g</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* NEW LEAVE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">Yeni İzin Talebi</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateLeave} className="flex-1 min-h-0 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                  Personel *
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode} - {emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                  İzin Türü *
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                >
                  <option value="annual">Yıllık Ücretli İzin</option>
                  <option value="excuse">Mazeret İzni</option>
                  <option value="unpaid">Ücretsiz İzin</option>
                  <option value="sick">Sağlık / Rapor İzni</option>
                  <option value="marriage">Evlilik İzni</option>
                  <option value="maternity">Doğum İzni</option>
                  <option value="bereavement">Vefat İzni</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                    Başlangıç Tarihi
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                    Bitiş Tarihi
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                  İzin Gün Sayısı
                </label>
                <input
                  type="number"
                  min="1"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-bold font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">
                  Gerekçe / Açıklama
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="İzin nedeni, seyahat veya mazeret açıklaması..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Talebi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
