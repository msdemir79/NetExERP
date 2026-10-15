import { HR_DEFAULT_PARAMS } from '../lib/hrDefaults';
import { calculateEmployeePayroll } from '../lib/employeePayroll';
import { api, callOp } from '../api/client';
import type { 
  Employee, 
  AttendanceRecord, 
  AttendanceStatus, 
  LeaveRequest, 
  LeaveType, 
  PayrollRecord, 
  AdvanceRequest,
  SgkStatus,
  AttendancePeriodLock,
  HRModuleSettings
} from '../types';
import { accountingService } from './accountingService';
import { settingsService } from './settingsService';
import {
  calculateProgressiveIncomeTaxKurus,
  toKurus,
  fromKurus,
  HR_CONSTANTS_2026,
  minimumWageTaxExemptionKurus,
} from '../lib/payrollCalculator';

// Ayarlar > İK & Bordro Parametreleri ekranında tanımlanmayan alanlar için yasal varsayılanlar
export { HR_DEFAULT_PARAMS } from '../lib/hrDefaults';

async function loadHRParams(): Promise<HRModuleSettings> {
  try {
    const settings = await settingsService.getSystemSettings();
    return { ...HR_DEFAULT_PARAMS, ...(settings.hr || {}) };
  } catch (err) {
    console.error('İK parametreleri okunamadı, yasal varsayılanlar kullanılıyor:', err);
    return { ...HR_DEFAULT_PARAMS };
  }
}

export const hrService = {
  // ==================== İK PARAMETRELERİ ====================
  async getHRParameters(): Promise<HRModuleSettings> {
    return await loadHRParams();
  },

  // ==================== PERSONEL (EMPLOYEE) ====================
  async getEmployees(): Promise<Employee[]> {
    return await api.employees.list({ orderBy: 'name' });
  },

  async getEmployeeById(id: number): Promise<Employee | undefined> {
    return await api.employees.get(id);
  },

  async addEmployee(data: Omit<Employee, 'id' | 'createdAt'>): Promise<number> {
    return await api.employees.create({
      ...data,
      createdAt: new Date()
    }) as number;
  },

  async updateEmployee(id: number, data: Partial<Employee>): Promise<number> {
    return await api.employees.update(id, data);
  },

  async deleteEmployee(id: number): Promise<void> {
    // Bağlı puantaj/bordro/izin/avans kaydı varsa sunucu 409 ile reddeder;
    // kart yalnızca ilişkisi yokken (parolasız) silinebilir.
    await api.employees.remove(id);
  },

  // ==================== PUANTAJ VE DÖNEM KİLİTLEME ====================
  async getPeriodLock(month: number, year: number): Promise<AttendancePeriodLock | undefined> {
    const numMonth = Number(month);
    const numYear = Number(year);
    return (await api.periodLocks.list())
      .filter(l => (l.scope || 'hr') === 'hr' && Number(l.month) === numMonth && Number(l.year) === numYear)[0];
  },

  async isPeriodLocked(month: number, year: number): Promise<boolean> {
    const lock = await this.getPeriodLock(month, year);
    return !!lock?.isLocked;
  },

  async setPeriodLock(
    month: number, 
    year: number, 
    isLocked: boolean, 
    lockedBy = 'İK Yöneticisi', 
    notes?: string
  ): Promise<AttendancePeriodLock> {
    const numMonth = Number(month);
    const numYear = Number(year);
    const existing = await this.getPeriodLock(numMonth, numYear);

    if (existing && existing.id) {
      await api.periodLocks.update(existing.id, {
        isLocked,
        lockedAt: isLocked ? new Date() : undefined,
        lockedBy: isLocked ? lockedBy : undefined,
        notes: notes ?? existing.notes
      });
      return {
        ...existing,
        isLocked,
        lockedAt: isLocked ? new Date() : undefined,
        lockedBy: isLocked ? lockedBy : undefined,
        notes: notes ?? existing.notes
      };
    } else {
      const newLock: AttendancePeriodLock = {
        scope: 'hr',
        month: numMonth,
        year: numYear,
        isLocked,
        lockedAt: isLocked ? new Date() : undefined,
        lockedBy: isLocked ? lockedBy : undefined,
        notes
      };
      const id = await api.periodLocks.create(newLock);
      return { ...newLock, id: id as number };
    }
  },

  async getAttendanceForMonth(month: number, year: number): Promise<AttendanceRecord[]> {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    return (await api.attendanceRecords.list())
      .filter(r => (r.date && r.date.startsWith(monthPrefix)) || (Number(r.year) === Number(year) && Number(r.month) === Number(month)));
  },

  async saveAttendanceRecord(record: {
    employeeId: number;
    date: string; // YYYY-MM-DD
    status: AttendanceStatus;
    overtimeHours?: number;
    normalHours?: number;
    notes?: string;
  }): Promise<void> {
    const [yearStr, monthStr] = record.date.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (await this.isPeriodLocked(month, year)) {
      throw new Error(`${month}/${year} dönemi kilitlenmiştir. Puantaj kaydı üzerinde değişiklik yapılamaz.`);
    }

    const existing = await api.attendanceRecords.findOne({ 'employeeId+date': [record.employeeId, record.date] });

    if (existing && existing.id) {
      await api.attendanceRecords.update(existing.id, {
        month,
        year,
        status: record.status,
        overtimeHours: record.overtimeHours ?? existing.overtimeHours ?? 0,
        normalHours: record.normalHours ?? existing.normalHours ?? 8,
        notes: record.notes ?? existing.notes
      });
    } else {
      await api.attendanceRecords.create({
        employeeId: record.employeeId,
        date: record.date,
        month,
        year,
        status: record.status,
        normalHours: record.normalHours ?? (record.status === 'present' ? 8 : 0),
        overtimeHours: record.overtimeHours ?? 0,
        notes: record.notes
      });
    }
  },

  // Bir ay için tüm aktif personelin puantajını otomatik oluştur / doldur (Hızlı toplu işlem)
  async autoPopulateMonthAttendance(month: number, year: number, overwriteExisting = true): Promise<void> {
    if (await this.isPeriodLocked(month, year)) {
      throw new Error(`${month}/${year} dönemi kilitlenmiştir. Otomatik puantaj doldurma işlemi yapılamaz.`);
    }

    const params = await loadHRParams();
    const weekendDays = params.weekendDays ?? [0];
    const employees = await api.employees.list({ where: { status: 'active' } });
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Onaylı izinleri al
    const approvedLeaves = await api.leaveRequests.list({ where: { status: 'approved' } });

    // Mevcut puantaj kayıtlarını tek sorguda çek
    const existingRecords = (await api.attendanceRecords.list({ where: { year } }))
      .filter(r => r.month === month);

    const recordMap = new Map<string, AttendanceRecord>();
    for (const r of existingRecords) {
      recordMap.set(`${r.employeeId}_${r.date}`, r);
    }

    const recordsToSave: AttendanceRecord[] = [];

    for (const emp of employees) {
      if (!emp.id) continue;
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0: Pazar

        // İzin kontrolü
        const activeLeave = approvedLeaves.find(l => 
          l.employeeId === emp.id && 
          dateStr >= l.startDate && 
          dateStr <= l.endDate
        );

        let status: AttendanceStatus = 'present';
        let normalHours = 8;

        if (weekendDays.includes(dayOfWeek)) {
          // Hafta Tatili
          status = 'weekly_rest';
          normalHours = 0;
        } else if (activeLeave) {
          status = activeLeave.leaveType === 'unpaid' ? 'unpaid_leave' : 
                   activeLeave.leaveType === 'sick' ? 'sick_leave' : 'paid_leave';
          normalHours = 0;
        }

        const key = `${emp.id}_${dateStr}`;
        const existing = recordMap.get(key);

        if (existing) {
          if (overwriteExisting) {
            recordsToSave.push({
              ...existing,
              status,
              normalHours,
              overtimeHours: existing.overtimeHours || 0
            });
          }
        } else {
          recordsToSave.push({
            employeeId: emp.id,
            date: dateStr,
            month,
            year,
            status,
            normalHours,
            overtimeHours: 0
          });
        }
      }
    }

    if (recordsToSave.length > 0) {
      await api.attendanceRecords.saveMany(recordsToSave);
    }
  },

  // Seçili veya tüm personeller için puantaj durumunu toplu güncelle
  async bulkSetAttendanceForEmployees(
    employeeIds: number[],
    month: number,
    year: number,
    targetStatus: AttendanceStatus,
    respectWeekend = true
  ): Promise<void> {
    if (await this.isPeriodLocked(month, year)) {
      throw new Error(`${month}/${year} dönemi kilitlenmiştir. Toplu puantaj güncellemesi yapılamaz.`);
    }

    const params = await loadHRParams();
    const weekendDays = params.weekendDays ?? [0];
    const daysInMonth = new Date(year, month, 0).getDate();

    // Mevcut kayıtları çek
    const existingRecords = (await api.attendanceRecords.list({ where: { year } }))
      .filter(r => r.month === month && employeeIds.includes(r.employeeId));

    const recordMap = new Map<string, AttendanceRecord>();
    for (const r of existingRecords) {
      recordMap.set(`${r.employeeId}_${r.date}`, r);
    }

    const recordsToSave: AttendanceRecord[] = [];

    for (const empId of employeeIds) {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0: Pazar

        let status: AttendanceStatus = targetStatus;
        let normalHours = targetStatus === 'present' ? 8 : (targetStatus === 'half_day' ? 4 : 0);

        if (respectWeekend && weekendDays.includes(dayOfWeek)) {
          status = 'weekly_rest';
          normalHours = 0;
        }

        const key = `${empId}_${dateStr}`;
        const existing = recordMap.get(key);

        if (existing) {
          recordsToSave.push({
            ...existing,
            status,
            normalHours
          });
        } else {
          recordsToSave.push({
            employeeId: empId,
            date: dateStr,
            month,
            year,
            status,
            normalHours,
            overtimeHours: 0
          });
        }
      }
    }

    if (recordsToSave.length > 0) {
      await api.attendanceRecords.saveMany(recordsToSave);
    }
  },

  // Ay için puantaj kayıtlarını temizle
  async bulkClearMonthAttendance(month: number, year: number, employeeIds?: number[]): Promise<void> {
    if (await this.isPeriodLocked(month, year)) {
      throw new Error(`${month}/${year} dönemi kilitlenmiştir. Puantaj kayıtları silinemez.`);
    }

    const records = (await api.attendanceRecords.list({ where: { year } }))
      .filter(r => r.month === month && (!employeeIds || employeeIds.includes(r.employeeId)));

    const idsToDelete = records.map(r => r.id!).filter(Boolean);
    if (idsToDelete.length > 0) {
      await api.attendanceRecords.removeMany(idsToDelete);
    }
  },

  // ==================== İZİN TAKİBİ (LEAVE MANAGEMENT) ====================
  async getLeaveRequests(employeeId?: number): Promise<LeaveRequest[]> {
    let list: LeaveRequest[];
    if (employeeId) {
      list = await api.leaveRequests.list({ where: { employeeId } });
    } else {
      list = await api.leaveRequests.list();
    }
    return list.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (a.startDate ? new Date(a.startDate).getTime() : 0);
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (b.startDate ? new Date(b.startDate).getTime() : 0);
      return timeB - timeA;
    });
  },

  async addLeaveRequest(data: Omit<LeaveRequest, 'id' | 'createdAt'>): Promise<number> {
    return await api.leaveRequests.create({
      ...data,
      createdAt: new Date()
    }) as number;
  },

  async approveLeaveRequest(id: number, approvedBy = 'Yönetim'): Promise<void> {
    const leave = await api.leaveRequests.get(id);
    if (!leave) throw new Error('İzin talebi bulunamadı');

    await api.leaveRequests.update(id, {
      status: 'approved',
      approvedBy
    });

    // Personelin kullanılan izin sayacını güncelle (yıllık izin ise)
    if (leave.leaveType === 'annual') {
      const emp = await api.employees.get(leave.employeeId);
      if (emp && emp.id) {
        await api.employees.update(emp.id, {
          usedAnnualLeave: (emp.usedAnnualLeave || 0) + leave.days
        });
      }
    }

    // Puantaj tablosuna otomatik yansıt (Kilitli olmayan dönemler için)
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const month = d.getMonth() + 1;
      const year = d.getFullYear();

      // Kilitli dönem kontrolü
      if (await this.isPeriodLocked(month, year)) {
        continue;
      }

      const status: AttendanceStatus = leave.leaveType === 'unpaid' ? 'unpaid_leave' : 
                                      leave.leaveType === 'sick' ? 'sick_leave' : 'paid_leave';

      const existing = await api.attendanceRecords.findOne({ 'employeeId+date': [leave.employeeId, dateStr] });

      if (existing && existing.id) {
        await api.attendanceRecords.update(existing.id, {
          status,
          normalHours: 0
        });
      } else {
        await api.attendanceRecords.create({
          employeeId: leave.employeeId,
          date: dateStr,
          month,
          year,
          status,
          normalHours: 0,
          overtimeHours: 0
        });
      }
    }
  },

  async rejectLeaveRequest(id: number): Promise<void> {
    await api.leaveRequests.update(id, { status: 'rejected' });
  },

  async deleteLeaveRequest(id: number): Promise<void> {
    await api.leaveRequests.remove(id);
  },

  // ==================== AVANS YÖNETİMİ ====================
  async getAdvances(month?: number, year?: number): Promise<AdvanceRequest[]> {
    let list: AdvanceRequest[];
    if (month && year) {
      list = (await api.advanceRequests.list({ where: { year } }))
        .filter(a => a.month === month);
    } else {
      list = await api.advanceRequests.list();
    }
    return list.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });
  },

  async addAdvance(data: Omit<AdvanceRequest, 'id' | 'createdAt' | 'isDeducted'>): Promise<number> {
    return await api.advanceRequests.create({
      ...data,
      isDeducted: false,
      createdAt: new Date()
    }) as number;
  },

  async updateAdvanceStatus(id: number, status: 'pending' | 'paid' | 'rejected'): Promise<void> {
    await api.advanceRequests.update(id, { status });
  },

  // ==================== BORDRO VE ÜCRET HESAPLAMA MOTORU ====================
  // Tek bir personel için aylık bordro ve maliyet hesabı
  calculatePayrollForEmployee: calculateEmployeePayroll,

  async generateMonthlyPayroll(month: number, year: number): Promise<PayrollRecord[]> {
    return callOp<PayrollRecord[]>('generate-payroll', { month, year });
  },
  async accountPayroll(payrollId: number): Promise<void> {
    const record = await api.payrollRecords.get(payrollId);
    if (!record) throw new Error('Bordro kaydı bulunamadı.');
    if (record.isAccounted) throw new Error('Bu bordro zaten muhasebeleştirilmiş.');

    const isSgk = record.sgkStatus === 'sgk_li';

    // Üretim Departmanları 720 (Direkt İşçilik), İdari Departmanlar 770 (Genel Yönetim Giderleri)
    const isProduction = ['KESİM', 'SAYA', 'MONTA', 'FİNİSAJ', 'KALİTE & PAKET'].includes(record.department);
    const expenseAccountCode = isProduction ? '720.01' : '770.01';
    const expenseAccountName = isProduction ? 'Direkt İşçilik Giderleri' : 'Personel Ücret Giderleri';

    const items: Array<{
      accountId: number;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];

    // Muhasebe hesaplarını bul veya oluştur
    const expenseAcc = await accountingService.registerAccountFromCode({
      code: expenseAccountCode,
      name: expenseAccountName,
      type: 'expense',
      currency: 'TRY',
      sourceModule: 'manual'
    });

    const netPayableAcc = await accountingService.registerAccountFromCode({
      code: '335.01',
      name: 'Personele Borçlar (Net Ücretler)',
      type: 'liability',
      currency: 'TRY',
      sourceModule: 'manual'
    });

    if (isSgk) {
      // SGK'lı Personel Yevmiye Maddesi
      // Borç: 720/770 İşveren Toplam Maliyeti (Brüt + İşveren SGK + İşsizlik)
      // Alacak: 335 Personele Borçlar (Net Maaş)
      // Alacak: 360 Ödenecek Gelir & Damga Vergisi
      // Alacak: 361 Ödenecek Sosyal Güvenlik Primleri (İşçi + İşveren)
      const taxPayableAcc = await accountingService.registerAccountFromCode({
        code: '360.01',
        name: 'Ödenecek Gelir ve Damga Vergisi',
        type: 'liability',
        currency: 'TRY',
        sourceModule: 'manual'
      });

      const sgkPayableAcc = await accountingService.registerAccountFromCode({
        code: '361.01',
        name: 'Ödenecek SGK ve İşsizlik Primleri',
        type: 'liability',
        currency: 'TRY',
        sourceModule: 'manual'
      });

      const totalSgkPayable = record.employeeSgkShare + record.employeeUnemploymentShare + 
                              record.employerSgkShare + record.employerUnemploymentShare;
      const totalTaxPayable = record.incomeTax + record.stampTax;

      // 1. Gider Borç
      items.push({
        accountId: expenseAcc?.id || 0,
        accountCode: expenseAcc?.code || expenseAccountCode,
        accountName: expenseAcc?.name || expenseAccountName,
        debit: record.totalEmployerCost,
        credit: 0,
        description: `${record.employeeName} ${record.month}/${record.year} Bordro Tahakkuku`
      });

      // 2. Personele Net Borç Alacak
      items.push({
        accountId: netPayableAcc?.id || 0,
        accountCode: netPayableAcc?.code || '335.01',
        accountName: netPayableAcc?.name || 'Personele Borçlar (Net Ücretler)',
        debit: 0,
        credit: record.netSalary + record.advanceDeduction,
        description: `${record.employeeName} Net Ücret Hakedişi`
      });

      // 3. Vergi Alacak
      if (totalTaxPayable > 0) {
        items.push({
          accountId: taxPayableAcc?.id || 0,
          accountCode: taxPayableAcc?.code || '360.01',
          accountName: taxPayableAcc?.name || 'Ödenecek Gelir ve Damga Vergisi',
          debit: 0,
          credit: totalTaxPayable,
          description: `${record.employeeName} Stopaj ve Damga Vergisi`
        });
      }

      // 4. SGK Primleri Alacak
      items.push({
        accountId: sgkPayableAcc?.id || 0,
        accountCode: sgkPayableAcc?.code || '361.01',
        accountName: sgkPayableAcc?.name || 'Ödenecek SGK ve İşsizlik Primleri',
        debit: 0,
        credit: totalSgkPayable,
        description: `${record.employeeName} SGK İşçi+İşveren Primleri`
      });
    } else {
      // SGK'sız Personel Yevmiye Maddesi
      // Borç: 720/770 Direkt İşçilik / Yevmiye Gideri
      // Alacak: 335 Personele Borçlar
      items.push({
        accountId: expenseAcc?.id || 0,
        accountCode: expenseAcc?.code || expenseAccountCode,
        accountName: expenseAcc?.name || expenseAccountName,
        debit: record.totalEmployerCost,
        credit: 0,
        description: `${record.employeeName} Yevmiyeli/Harici İşçilik Hak Edişi`
      });

      items.push({
        accountId: netPayableAcc?.id || 0,
        accountCode: netPayableAcc?.code || '335.01',
        accountName: netPayableAcc?.name || 'Personele Borçlar (Net Ücretler)',
        debit: 0,
        credit: record.totalEmployerCost,
        description: `${record.employeeName} Net Ödenecek Yevmiye Bedeli`
      });
    }

    const lines = items.map((item, idx) => ({
      id: `payroll-${payrollId}-${idx}`,
      accountCode: item.accountCode,
      accountName: item.accountName,
      description: item.description,
      debit: Number(item.debit.toFixed(2)),
      credit: Number(item.credit.toFixed(2))
    }));

    const journalEntryId = await accountingService.createJournalEntry({
      date: new Date(record.year, record.month - 1, 28),
      description: `${record.employeeCode} - ${record.employeeName} (${record.month}/${record.year}) Personel Ücret Tahakkuku`,
      entryType: 'mahsup',
      documentType: 'manual',
      documentNumber: `BRD-${record.year}${String(record.month).padStart(2, '0')}-${record.employeeCode}`,
      lines
    });

    await callOp('account-payroll', {
      payrollId,
      journalEntryId: journalEntryId as number
    });
  }
};
