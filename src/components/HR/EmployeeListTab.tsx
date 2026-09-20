import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Phone, 
  Mail, 
  Calendar, 
  Shield, 
  DollarSign, 
  UserCheck, 
  Users, 
  Building2,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Table
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Employee, SgkStatus, EmployeeDepartment } from '../../types';
import { hrService } from '../../services/hrService';
import EmployeeModal from './EmployeeModal';

interface EmployeeListTabProps {
  employees: Employee[];
  onRefresh: () => void;
}

export default function EmployeeListTab({ employees, onRefresh }: EmployeeListTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sgkFilter, setSgkFilter] = useState<'all' | SgkStatus>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'passive'>('active');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`${emp.name} isimli personeli silmek istediğinize emin misiniz?`)) return;
    try {
      await hrService.deleteEmployee(emp.id!);
      onRefresh();
    } catch (err: any) {
      alert(err?.message || 'Personel silinemedi.');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
    if (sgkFilter !== 'all' && emp.sgkStatus !== sgkFilter) return false;
    if (deptFilter !== 'all' && emp.department !== deptFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = emp.name.toLowerCase().includes(q);
      const matchCode = emp.employeeCode.toLowerCase().includes(q);
      const matchPos = emp.position.toLowerCase().includes(q);
      const matchPhone = emp.phone?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchPos && !matchPhone) return false;
    }
    return true;
  });

  // Department list from existing employees
  const departments = Array.from(new Set(employees.map(e => e.department)));

  return (
    <div className="space-y-4">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs">
        
        {/* Search and Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 w-full sm:w-auto">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Personel adı, sicil, görev..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50 dark:bg-slate-800/50/50 focus:bg-white dark:bg-slate-900"
            />
          </div>

          {/* SGK Status Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs shrink-0">
            <button
              onClick={() => setSgkFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-colors cursor-pointer ${
                sgkFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü ({employees.length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_li')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_li' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              SGK'lı ({employees.filter(e => e.sgkStatus === 'sgk_li').length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_siz')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_siz' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <DollarSign className="w-3 h-3 text-amber-600" />
              Yevmiyeli ({employees.filter(e => e.sgkStatus === 'sgk_siz').length})
            </button>
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
          >
            <option value="all">Tüm Departmanlar</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle & Add Button */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end shrink-0">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'table' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs font-semibold" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
              title="Tablo Görünümü"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tablo</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'cards' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs font-semibold" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
              title="Kart Görünümü"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartlar</span>
            </button>
          </div>

          <button
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Personel</span>
          </button>
        </div>
      </div>

      {/* Main Employee Content (Table vs Cards) */}
      {filteredEmployees.length === 0 ? (
        <div className="p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-center text-slate-400 text-xs">
          Arama kriterlerinize uygun personel bulunamadı.
        </div>
      ) : viewMode === 'table' ? (
        /* TABLO GÖRÜNÜMÜ */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50/80 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Sicil & Personel</th>
                  <th className="py-3 px-4">Görev / Departman</th>
                  <th className="py-3 px-4">SGK Durumu</th>
                  <th className="py-3 px-4">Ücret Tipi & Baz Maaş</th>
                  <th className="py-3 px-4">İşe Giriş</th>
                  <th className="py-3 px-4">Kalan İzin</th>
                  <th className="py-3 px-4">İletişim</th>
                  <th className="py-3 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const isSgk = emp.sgkStatus === 'sgk_li';
                  const remainingLeave = Math.max(0, (emp.entitledAnnualLeave ?? 14) - (emp.usedAnnualLeave ?? 0));

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors group">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSgk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors block">
                              {emp.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {emp.employeeCode}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <div>
                          <span className="font-medium text-slate-800 dark:text-slate-200 block">
                            {emp.position}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {emp.department}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          isSgk 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
                            : 'bg-amber-50 text-amber-700 border-amber-200/60'
                        }`}>
                          {isSgk ? <Shield className="w-3 h-3 text-emerald-600" /> : <DollarSign className="w-3 h-3 text-amber-600" />}
                          {isSgk ? 'SGK\'lı' : 'Yevmiyeli'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 font-mono">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          ₺{emp.baseSalary.toLocaleString('tr-TR')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {emp.salaryType === 'daily' ? 'Günlük Yevmiye' : emp.salaryType === 'monthly_gross' ? 'Aylık Brüt' : 'Aylık Net'}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                        {new Date(emp.hireDate).toLocaleDateString('tr-TR')}
                      </td>

                      <td className="py-2.5 px-4">
                        <span className="font-mono font-semibold text-indigo-600 text-[11px]">
                          {remainingLeave} Gün
                        </span>
                      </td>

                      <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                        <div>{emp.phone || '-'}</div>
                        {emp.iban && (
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]" title={emp.iban}>
                            {emp.iban}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(emp)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* KART GÖRÜNÜMÜ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEmployees.map((emp) => {
            const isSgk = emp.sgkStatus === 'sgk_li';
            const remainingLeave = Math.max(0, (emp.entitledAnnualLeave ?? 14) - (emp.usedAnnualLeave ?? 0));

            return (
              <div
                key={emp.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs hover:border-slate-300 transition-all p-4 flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  {/* Top info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isSgk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                          {emp.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{emp.employeeCode}</span>
                          <span>•</span>
                          <span>{emp.position}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      isSgk 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
                        : 'bg-amber-50 text-amber-700 border-amber-200/60'
                    }`}>
                      {isSgk ? 'SGK\'lı' : 'Yevmiyeli'}
                    </span>
                  </div>

                  {/* Department & Wage details */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Departman:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{emp.department}</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {emp.salaryType === 'daily' ? 'Günlük Yevmiye:' : 'Aylık Ücret:'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-[11px]">
                        ₺{emp.baseSalary.toLocaleString('tr-TR')} 
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-normal ml-1">
                          {emp.salaryType === 'daily' ? '/ gün' : emp.salaryType === 'monthly_gross' ? '(Brüt)' : '(Net)'}
                        </span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Kalan İzin:</span>
                      <span className="font-mono font-semibold text-indigo-600 text-[11px]">
                        {remainingLeave} Gün
                      </span>
                    </div>
                  </div>

                  {/* Contact Snippets */}
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {emp.phone && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                    {emp.paymentMethod === 'bank' && emp.iban && (
                      <div className="text-[10px] font-mono text-slate-400 truncate" title={emp.iban}>
                        IBAN: {emp.iban}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Giriş: {new Date(emp.hireDate).toLocaleDateString('tr-TR')}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(emp)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Düzenle"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employee={editingEmployee}
        onSaved={onRefresh}
      />
    </div>
  );
}
