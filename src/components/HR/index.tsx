import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Calendar, 
  FileText, 
  DollarSign, 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  Briefcase,
  TrendingUp,
  Building2,
  Sparkles,
  BarChart3,
  ExternalLink
} from 'lucide-react';
import type { Employee } from '../../types';
import { hrService } from '../../services/hrService';
import PageHeader from '../PageHeader';
import EmployeeListTab from './EmployeeListTab';
import AttendanceTab from './AttendanceTab';
import LeaveTab from './LeaveTab';
import PayrollTab from './PayrollTab';
import AdvanceTab from './AdvanceTab';
import HRReport from '../Reports/HRReport';

export default function HRManagement() {
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'leaves' | 'payroll' | 'advances' | 'reports'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const list = await hrService.getEmployees();
      setEmployees(list);
    } catch (err) {
      console.error('Personel listesi yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // Stats
  const activeEmployees = employees.filter(e => e.status === 'active');
  const sgkLiCount = activeEmployees.filter(e => e.sgkStatus === 'sgk_li').length;
  const sgkSizCount = activeEmployees.filter(e => e.sgkStatus === 'sgk_siz').length;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-200">
      
      {/* Top Banner / Header */}
      <PageHeader
        title="İnsan Kaynakları & Bordro Sistemi"
        subtitle="Personel puantajı, izin yönetimi, SGK'lı/yevmiyeli bordro ve muhasebe fişleri"
        badge="İK Yönetimi"
        icon={UserCheck}
        iconColor="indigo"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Toplam</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200">{activeEmployees.length}</span>
            </div>

            <div className="bg-emerald-50/80 px-3 py-1.5 rounded-lg border border-emerald-200/80 text-center">
              <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3" /> SGK'lı
              </span>
              <span className="text-sm font-black text-emerald-800">{sgkLiCount}</span>
            </div>

            <div className="bg-amber-50/80 px-3 py-1.5 rounded-lg border border-amber-200/80 text-center">
              <span className="text-[10px] font-bold text-amber-600 uppercase flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Yevmiyeli
              </span>
              <span className="text-sm font-black text-amber-800">{sgkSizCount}</span>
            </div>
          </div>
        }
      />

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-xl px-4 shadow-xs">
        <button
          onClick={() => setActiveTab('employees')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'employees'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Personel Listesi ({employees.length})
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'attendance'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Puantaj & Devam Takibi
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'leaves'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          İzin Yönetimi
        </button>

        <button
          onClick={() => setActiveTab('payroll')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'payroll'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Bordro & Ücret Hesaplama
        </button>

        <button
          onClick={() => setActiveTab('advances')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'advances'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Avans Takibi
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3.5 px-5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-indigo-600" />
          İK & Bordro Raporu
        </button>

        <div className="ml-auto flex items-center pr-2">
          <Link
            to="/reports?tab=hr"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'employees' && (
          <EmployeeListTab employees={employees} onRefresh={loadEmployees} />
        )}

        {activeTab === 'attendance' && (
          <AttendanceTab employees={employees} onAttendanceChanged={loadEmployees} />
        )}

        {activeTab === 'leaves' && (
          <LeaveTab employees={employees} onLeavesUpdated={loadEmployees} />
        )}

        {activeTab === 'payroll' && (
          <PayrollTab employees={employees} onPayrollUpdated={loadEmployees} />
        )}

        {activeTab === 'advances' && (
          <AdvanceTab employees={employees} onAdvancesUpdated={loadEmployees} />
        )}

        {activeTab === 'reports' && (
          <HRReport />
        )}
      </div>
    </div>
  );
}
