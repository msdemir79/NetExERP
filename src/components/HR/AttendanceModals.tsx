import React from 'react';
import {
  Layers,
  X,
  Zap,
  Sparkles,
  Users,
  UserCheck,
  CheckSquare,
  RotateCcw,
  CheckCircle2,
  Unlock,
  Lock,
  Info,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { Employee, AttendanceRecord, AttendanceStatus, AttendancePeriodLock } from '../../types';
import { MONTH_NAMES, STATUS_CONFIG, formatWeekendDays } from './attendanceConstants';

export interface ActiveCell {
  employeeId: number;
  employeeName: string;
  date: string;
  day: number;
  currentRecord?: AttendanceRecord;
}

interface BulkAttendanceModalProps {
  selectedMonth: number;
  selectedYear: number;
  weekendDays: number[];
  employees: Employee[];
  selectedEmpIds: number[];
  bulkScope: 'all' | 'selected_single' | 'selected_multiple';
  setBulkScope: React.Dispatch<React.SetStateAction<'all' | 'selected_single' | 'selected_multiple'>>;
  bulkTargetEmployeeId: number;
  setBulkTargetEmployeeId: React.Dispatch<React.SetStateAction<number>>;
  bulkTargetStatus: AttendanceStatus;
  setBulkTargetStatus: React.Dispatch<React.SetStateAction<AttendanceStatus>>;
  bulkRespectWeekend: boolean;
  setBulkRespectWeekend: React.Dispatch<React.SetStateAction<boolean>>;
  isPopulating: boolean;
  setIsBulkModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleAutoPopulate: () => Promise<void>;
  handleClearAttendance: () => Promise<void>;
  handleExecuteBulkAction: () => Promise<void>;
}

export function BulkAttendanceModal({
  selectedMonth,
  selectedYear,
  weekendDays,
  employees,
  selectedEmpIds,
  bulkScope,
  setBulkScope,
  bulkTargetEmployeeId,
  setBulkTargetEmployeeId,
  bulkTargetStatus,
  setBulkTargetStatus,
  bulkRespectWeekend,
  setBulkRespectWeekend,
  isPopulating,
  setIsBulkModalOpen,
  handleAutoPopulate,
  handleClearAttendance,
  handleExecuteBulkAction,
}: BulkAttendanceModalProps) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-y-auto border border-slate-200 dark:border-slate-700 p-6 space-y-5 animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">Toplu Puantaj İşlemleri</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dönem: <b>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</b>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick 1-Click Action Card */}
            <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-900">En Hızlı Doldurma</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Tavsiye Edilen</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Tüm personelleri ayın tüm iş günleri için <b>'Geldi (N)'</b>, hafta tatili günleri ({formatWeekendDays(weekendDays)}) için <b>'Hafta Tatili (H)'</b> olarak tek tıkla ayarlar.
              </p>
              <button
                onClick={async () => {
                  await handleAutoPopulate();
                  setIsBulkModalOpen(false);
                }}
                disabled={isPopulating}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Tüm Personelleri Otomatik 'Geldi' Yap
              </button>
            </div>

            {/* Kapsam Seçimi (Scope) */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                Uygulanacak Kapsam
              </label>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBulkScope('all')}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                    bulkScope === 'all'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4 mx-auto mb-1 text-indigo-600" />
                  Tüm Personel ({employees.length})
                </button>

                <button
                  type="button"
                  onClick={() => setBulkScope('selected_single')}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                    bulkScope === 'selected_single'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-4 h-4 mx-auto mb-1 text-indigo-600" />
                  Tek Personel Seç
                </button>

                <button
                  type="button"
                  onClick={() => setBulkScope('selected_multiple')}
                  className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                    bulkScope === 'selected_multiple'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 mx-auto mb-1 text-indigo-600" />
                  İşaretlenenler ({selectedEmpIds.length})
                </button>
              </div>

              {/* Single Employee Picker if scope === selected_single */}
              {bulkScope === 'selected_single' && (
                <div className="pt-2 animate-in fade-in">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Personel Seçiniz
                  </label>
                  <select
                    value={bulkTargetEmployeeId}
                    onChange={(e) => setBulkTargetEmployeeId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                  >
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employeeCode} - {e.department})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Atanacak Durum */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                Atanacak Çalışma Durumu
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBulkTargetStatus(key as AttendanceStatus)}
                    className={`px-3 py-2 rounded-lg border text-left flex items-center gap-2 transition-all text-xs cursor-pointer ${
                      bulkTargetStatus === key
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                      {cfg.code}
                    </span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="bulkRespectWeekend"
                  checked={bulkRespectWeekend}
                  onChange={(e) => setBulkRespectWeekend(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="bulkRespectWeekend" className="text-xs text-slate-600 select-none cursor-pointer">
                  Hafta tatili günleri ({formatWeekendDays(weekendDays)}) <b>Hafta Tatili (H)</b> olarak korunsun
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleClearAttendance}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Puantaj kayıtlarını siler"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Puantajı Temizle
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkAction}
                  disabled={isPopulating}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isPopulating ? 'Uygulanıyor...' : 'İşlemi Uygula'}
                </button>
              </div>
            </div>

          </div>
        </div>
  );
}

interface LockPeriodModalProps {
  isLocked: boolean;
  selectedMonth: number;
  selectedYear: number;
  periodLock: AttendancePeriodLock | null;
  lockOperatorName: string;
  setLockOperatorName: React.Dispatch<React.SetStateAction<string>>;
  lockNotes: string;
  setLockNotes: React.Dispatch<React.SetStateAction<string>>;
  isLocking: boolean;
  setIsLockModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleLock: (targetLocked: boolean) => Promise<void>;
}

export function LockPeriodModal({
  isLocked,
  selectedMonth,
  selectedYear,
  periodLock,
  lockOperatorName,
  setLockOperatorName,
  lockNotes,
  setLockNotes,
  isLocking,
  setIsLockModalOpen,
  handleToggleLock,
}: LockPeriodModalProps) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 p-6 space-y-5 animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${isLocked ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {isLocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    {isLocked ? 'Dönem Kilidini Aç' : 'Puantaj Dönemini Kilitle'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Dönemi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLockModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Info */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
              {isLocked ? (
                <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/80 space-y-2 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <Info className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Dönem kilidi açılmak üzere</span>
                  </div>
                  <p className="leading-relaxed">
                    Kilidi açtığınızda, <b>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</b> dönemine ait puantaj kayıtları tekrar düzenlemeye, otomatik doldurmaya ve silmeye açılacaktır.
                  </p>
                  {periodLock && (
                    <div className="mt-2 pt-2 border-t border-amber-200/60 text-[11px] text-amber-800 space-y-0.5">
                      <div><b>Kitleyen:</b> {periodLock.lockedBy || 'Yetkili'}</div>
                      <div><b>Kilitleme Tarihi:</b> {new Date(periodLock.lockedAt).toLocaleString('tr-TR')}</div>
                      {periodLock.notes && <div><b>Mevcut Not:</b> {periodLock.notes}</div>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                  <div className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Kesinleşmiş Puantajı Koruma</span>
                  </div>
                  <p className="leading-relaxed">
                    <b>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</b> puantajını tamamlayıp kilitlediğinizde:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                    <li>Puantaj hücreleri yanlışlıkla değiştirilmeye karşı salt okunur olur.</li>
                    <li>Otomatik doldurma ve toplu işlemler kilitlenir.</li>
                    <li>İstediğiniz zaman Excel ve CSV çıktıları almaya devam edebilirsiniz.</li>
                  </ul>
                </div>
              )}

              {/* Form Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    İşlemi Yapan Yetkili
                  </label>
                  <input
                    type="text"
                    value={lockOperatorName}
                    onChange={(e) => setLockOperatorName(e.target.value)}
                    placeholder="Örn: İK Yöneticisi / Ad Soyad"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    {isLocked ? 'Kilit Açma Gerekçesi / Notu (Opsiyonel)' : 'Kilitleme Notu / Açıklama (Opsiyonel)'}
                  </label>
                  <textarea
                    value={lockNotes}
                    onChange={(e) => setLockNotes(e.target.value)}
                    placeholder={isLocked ? 'Örn: Düzeltme talebi üzerine kilit açıldı' : 'Örn: Puantaj kontrolleri tamamlandı, bordroya aktarıldı.'}
                    rows={2}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsLockModalOpen(false)}
                disabled={isLocking}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
              >
                Vazgeç
              </button>
              
              {isLocked ? (
                <button
                  type="button"
                  onClick={() => handleToggleLock(false)}
                  disabled={isLocking}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4" />
                  {isLocking ? 'Açılıyor...' : 'Kilidi Kaldır & Düzenlemeye İzin Ver'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleLock(true)}
                  disabled={isLocking}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  {isLocking ? 'Kilitleniyor...' : 'Dönemi Kesinleştir & Kilitle'}
                </button>
              )}
            </div>

          </div>
        </div>
  );
}

interface CellEditorModalProps {
  activeCell: ActiveCell;
  selectedMonth: number;
  selectedYear: number;
  editStatus: AttendanceStatus;
  setEditStatus: React.Dispatch<React.SetStateAction<AttendanceStatus>>;
  editOvertime: number;
  setEditOvertime: React.Dispatch<React.SetStateAction<number>>;
  saveCellError: string | null;
  isSavingCell: boolean;
  setActiveCell: React.Dispatch<React.SetStateAction<ActiveCell | null>>;
  handleSaveCell: () => Promise<void>;
}

export function CellEditorModal({
  activeCell,
  selectedMonth,
  selectedYear,
  editStatus,
  setEditStatus,
  editOvertime,
  setEditOvertime,
  saveCellError,
  isSavingCell,
  setActiveCell,
  handleSaveCell,
}: CellEditorModalProps) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="shrink-0 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{activeCell.employeeName}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeCell.day} {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Puantaj Girişi
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 uppercase">
                  Çalışma Durumu
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditStatus(key as AttendanceStatus)}
                      className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                        editStatus === key
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 font-bold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.code}
                      </span>
                      <span className="text-xs truncate">{cfg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase flex items-center justify-between">
                  <span>Fazla Mesai Saati</span>
                  <span className="text-indigo-600 font-mono font-bold">{editOvertime} Saat</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="12"
                    step="0.5"
                    value={editOvertime}
                    onChange={(e) => setEditOvertime(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={editOvertime}
                    onChange={(e) => setEditOvertime(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded text-center"
                  />
                </div>
              </div>
            </div>

            {saveCellError && (
              <div className="shrink-0 flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px] font-semibold">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{saveCellError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveCell(null)}
                disabled={isSavingCell}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSaveCell}
                disabled={isSavingCell}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5"
              >
                {isSavingCell && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSavingCell ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
  );
}
