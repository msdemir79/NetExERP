import { api } from '../api/client';
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

// Ayarlar > İK & Bordro Parametreleri ekranında tanımlanmayan alanlar için yasal varsayılanlar
export const HR_DEFAULT_PARAMS: HRModuleSettings = {
  weeklyWorkHours: 45,
  dailyWorkHours: 8,
  weekendDays: [0],
  overtimeWeekdayMultiplier: 1.5,
  overtimeWeekendMultiplier: 2.0,
  annualLeaveBaseDays: 14,
  sgkEmployeeRate: 14,
  unemploymentEmployeeRate: 1,
  sgkEmployerRate: 15.5,
  unemploymentEmployerRate: 2,
  incomeTaxRate: 15,
  stampTaxPerMille: 7.59,
  minWageGross: 26005,
  minWageNet: 22104,
  minWageIncomeTaxExemption: 3315.64,
  minWageStampTaxExemption: 197.38,
  sgkMonthlyHours: 225,
  nonSgkMonthlyHours: 240
};

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
    // Bağlı puantaj ve bordroları temizle
    await api.attendanceRecords.removeWhere({ employeeId: id });
    await api.leaveRequests.removeWhere({ employeeId: id });
    await api.payrollRecords.removeWhere({ employeeId: id });
    await api.advanceRequests.removeWhere({ employeeId: id });
    await api.employees.remove(id);
  },

  // ==================== PUANTAJ VE DÖNEM KİLİTLEME ====================
  async getPeriodLock(month: number, year: number): Promise<AttendancePeriodLock | undefined> {
    const numMonth = Number(month);
    const numYear = Number(year);
    return (await api.periodLocks.list())
      .filter(l => Number(l.month) === numMonth && Number(l.year) === numYear)[0];
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
  calculatePayrollForEmployee(
    employee: Employee,
    attendanceList: AttendanceRecord[],
    advances: AdvanceRequest[],
    month: number,
    year: number,
    params: HRModuleSettings = HR_DEFAULT_PARAMS
  ): Omit<PayrollRecord, 'id' | 'createdAt'> {
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Puantaj kayıtlarını tarih bazlı haritaya al
    const attMap = new Map<string, AttendanceRecord>();
    attendanceList.forEach(att => {
      if (att.date) attMap.set(att.date, att);
    });

    const weekendDays = params.weekendDays ?? [0];
    const sgkWorkerRate = params.sgkEmployeeRate / 100;
    const unemploymentWorkerRate = params.unemploymentEmployeeRate / 100;
    const sgkEmployerRate = params.sgkEmployerRate / 100;
    const unemploymentEmployerRate = params.unemploymentEmployerRate / 100;
    const incomeTaxRate = params.incomeTaxRate / 100;
    const stampTaxRate = params.stampTaxPerMille / 1000;

    let daysWorked = 0;
    let halfDays = 0;
    let weeklyRestDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;
    let overtimeWeekdayHours = 0;
    let overtimeWeekendHours = 0;

    // Ayın 1'inden son gününe kadar her takvim gününü değerlendir
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rec = attMap.get(dateStr);
      const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0: Pazar
      const isWeekend = weekendDays.includes(dayOfWeek);

      // Kayıt yoksa: hafta tatili günleri hafta tatili, diğer günler fiili çalışma varsayılır
      const status: AttendanceStatus = rec?.status || (isWeekend ? 'weekly_rest' : 'present');

      if (status === 'present') {
        daysWorked += 1;
      } else if (status === 'half_day') {
        halfDays += 1;
        daysWorked += 0.5;
      } else if (status === 'weekly_rest') {
        weeklyRestDays += 1;
      } else if (status === 'paid_leave' || status === 'public_holiday' || status === 'sick_leave') {
        paidLeaveDays += 1;
      } else if (status === 'unpaid_leave') {
        unpaidLeaveDays += 1;
      } else if (status === 'absent') {
        absentDays += 1;
      }

      if (rec?.overtimeHours) {
        if (isWeekend || status === 'public_holiday') {
          overtimeWeekendHours += rec.overtimeHours;
        } else {
          overtimeWeekdayHours += rec.overtimeHours;
        }
      }
    }

    const overtimeHours = overtimeWeekdayHours + overtimeWeekendHours;

    // Ücret kesintisine tabi toplam gün sayısı (devamsızlık + ücretsiz izin + yarım gün açığı)
    const totalDeductedDays = absentDays + unpaidLeaveDays + (halfDays * 0.5);

    // Toplam Avans Kesintisi
    const employeeAdvances = advances.filter(a => a.employeeId === employee.id && a.status === 'paid');
    const advanceDeduction = employeeAdvances.reduce((sum, a) => sum + a.amount, 0);

    const isSgkLi = employee.sgkStatus === 'sgk_li';

    // -------------------------------------------------------------
    // SENARYO 1: SGK'LI PERSONEL (Bordrolu / Yasal Kesintili Hesaplama)
    // -------------------------------------------------------------
    if (isSgkLi) {
      // Netten Brüte veya Brüt bazlı hesaplama
      let grossSalary = 0;
      if (employee.salaryType === 'monthly_net') {
        const targetNet = employee.baseSalary || 30000;
        // Asgari ücret üstü kısım için marjinal net katsayısı; işçi SGK/işsizlik,
        // gelir vergisi ve damga vergisi kesintilerinden türetilir
        const netFactor = 1 - sgkWorkerRate - unemploymentWorkerRate
          - incomeTaxRate * (1 - sgkWorkerRate - unemploymentWorkerRate) - stampTaxRate;
        grossSalary = targetNet <= params.minWageNet
          ? params.minWageGross
          : params.minWageGross + (targetNet - params.minWageNet) / netFactor;
      } else {
        grossSalary = employee.baseSalary;
      }

      // Çalışılan güne oranla temel hak ediş (30 gün standardı)
      const standardDays = 30;
      const effectiveDays = Math.max(0, standardDays - totalDeductedDays);
      const basePay = (grossSalary / standardDays) * effectiveDays;

      // Fazla mesai brüt ücreti (saatlik brüt * gün tipine göre çarpan)
      const hourlyGross = grossSalary / params.sgkMonthlyHours;
      const overtimePay =
        hourlyGross * params.overtimeWeekdayMultiplier * overtimeWeekdayHours +
        hourlyGross * params.overtimeWeekendMultiplier * overtimeWeekendHours;
      const bonusPay = 0; // Yol, yemek, prim eklenebilir

      const totalGrossPay = basePay + overtimePay + bonusPay;

      // Yasal Kesintiler
      const employeeSgkShare = totalGrossPay * sgkWorkerRate;
      const employeeUnemploymentShare = totalGrossPay * unemploymentWorkerRate;

      // Gelir Vergisi Matrahı
      const incomeTaxBase = totalGrossPay - employeeSgkShare - employeeUnemploymentShare;
      const rawIncomeTax = incomeTaxBase * incomeTaxRate;
      // Asgari Ücret Vergi İstisnası Düşümü
      const incomeTax = Math.max(0, rawIncomeTax - params.minWageIncomeTaxExemption);

      // Damga Vergisi Matrahı & İstisnası
      const rawStampTax = totalGrossPay * stampTaxRate;
      const stampTax = Math.max(0, rawStampTax - params.minWageStampTaxExemption);

      const totalLegalDeductions = employeeSgkShare + employeeUnemploymentShare + incomeTax + stampTax;

      // Net Ödenecek
      const netSalary = Math.max(0, totalGrossPay - totalLegalDeductions - advanceDeduction);

      // İşveren Maliyeti
      const employerSgkShare = totalGrossPay * sgkEmployerRate;
      const employerUnemploymentShare = totalGrossPay * unemploymentEmployerRate;
      const totalEmployerCost = totalGrossPay + employerSgkShare + employerUnemploymentShare;

      return {
        employeeId: employee.id!,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        month,
        year,
        sgkStatus: 'sgk_li',
        salaryType: employee.salaryType,
        daysWorked,
        weeklyRestDays,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        totalDays: effectiveDays,
        overtimeHours,
        baseSalary: Math.round(grossSalary),
        basePay: Math.round(basePay),
        overtimePay: Math.round(overtimePay),
        bonusPay,
        totalGrossPay: Math.round(totalGrossPay),
        employeeSgkShare: Math.round(employeeSgkShare),
        employeeUnemploymentShare: Math.round(employeeUnemploymentShare),
        incomeTax: Math.round(incomeTax),
        stampTax: Math.round(stampTax),
        totalLegalDeductions: Math.round(totalLegalDeductions),
        advanceDeduction: Math.round(advanceDeduction),
        otherDeductions: 0,
        netSalary: Math.round(netSalary),
        employerSgkShare: Math.round(employerSgkShare),
        employerUnemploymentShare: Math.round(employerUnemploymentShare),
        totalEmployerCost: Math.round(totalEmployerCost),
        paymentStatus: 'unpaid',
        isAccounted: false,
        notes: `SGK'lı Bordro Hesabı (${effectiveDays} gün hak ediş${absentDays > 0 ? `, ${absentDays} gün devamsız` : ''}${unpaidLeaveDays > 0 ? `, ${unpaidLeaveDays} gün ücr. izin` : ''}${overtimeHours > 0 ? `, ${overtimeHours} sa mesai` : ''})`
      };
    } 
    
    // -------------------------------------------------------------
    // SENARYO 2: SGK'SIZ / GÜNLÜK YEVMİYELİ / HARİCİ PERSONEL
    // (Vergi ve SGK kesintisi yok, fiili net hakediş ve yevmiye bazlı)
    // -------------------------------------------------------------
    else {
      let basePay = 0;
      let hourlyRate = 0;

      if (employee.salaryType === 'daily') {
        // Günlük Yevmiye:
        // Fiili çalışılan gün sayısı + Ücretli izin günleri üzerinden ödenir.
        // Devamsızlık veya ücretsiz izin günleri kesinlikle ödenmez.
        const dailyRate = employee.baseSalary || 1500;
        const payableDays = Math.max(0, daysWorked + paidLeaveDays);
        basePay = dailyRate * payableDays;
        hourlyRate = dailyRate / params.dailyWorkHours;
      } else if (employee.salaryType === 'hourly') {
        hourlyRate = employee.baseSalary || 200;
        basePay = (daysWorked * params.dailyWorkHours) * hourlyRate;
      } else {
        // Aylık sabit net anlaşılan tutar: 30 gün standardı üzerinden devamsızlık düşülür
        const monthlyNet = employee.baseSalary || 30000;
        const standardDays = 30;
        const effectiveDays = Math.max(0, standardDays - totalDeductedDays);
        basePay = (monthlyNet / standardDays) * effectiveDays;
        hourlyRate = monthlyNet / params.nonSgkMonthlyHours;
      }

      // Fazla Mesai (saatlik ücret * gün tipine göre çarpan)
      const overtimePay =
        hourlyRate * params.overtimeWeekdayMultiplier * overtimeWeekdayHours +
        hourlyRate * params.overtimeWeekendMultiplier * overtimeWeekendHours;
      const bonusPay = 0;
      const totalNetEarned = basePay + overtimePay + bonusPay;

      // Net Ödenecek (Avanslar Düşülür)
      const netSalary = Math.max(0, totalNetEarned - advanceDeduction);

      // SGK'sız personelde işveren maliyeti net ödenen toplam tutardır (Ek yasal prim maliyeti yoktur)
      const totalEmployerCost = totalNetEarned;

      return {
        employeeId: employee.id!,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        month,
        year,
        sgkStatus: 'sgk_siz',
        salaryType: employee.salaryType,
        daysWorked,
        weeklyRestDays,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        totalDays: employee.salaryType === 'daily' ? Math.max(0, daysWorked + paidLeaveDays) : Math.max(0, 30 - totalDeductedDays),
        overtimeHours,
        baseSalary: employee.baseSalary,
        basePay: Math.round(basePay),
        overtimePay: Math.round(overtimePay),
        bonusPay,
        totalGrossPay: Math.round(totalNetEarned),
        employeeSgkShare: 0,
        employeeUnemploymentShare: 0,
        incomeTax: 0,
        stampTax: 0,
        totalLegalDeductions: 0,
        advanceDeduction: Math.round(advanceDeduction),
        otherDeductions: 0,
        netSalary: Math.round(netSalary),
        employerSgkShare: 0,
        employerUnemploymentShare: 0,
        totalEmployerCost: Math.round(totalEmployerCost),
        paymentStatus: 'unpaid',
        isAccounted: false,
        notes: `SGK'sız / Yevmiyeli Net Hak Ediş (${daysWorked} fiili gün${absentDays > 0 ? `, ${absentDays} gün devamsız` : ''}${unpaidLeaveDays > 0 ? `, ${unpaidLeaveDays} gün ücr. izin` : ''}${overtimeHours > 0 ? `, ${overtimeHours} sa mesai` : ''})`
      };
    }
  },

  // Tüm personeller için seçilen ayın bordrosunu hesaplayıp veritabanına kaydet/güncelle
  async generateMonthlyPayroll(month: number, year: number): Promise<PayrollRecord[]> {
    const params = await loadHRParams();
    const employees = await api.employees.list({ where: { status: 'active' } });
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const attendanceRecords = (await api.attendanceRecords.list())
      .filter(r => (r.date && r.date.startsWith(monthPrefix)) || (Number(r.year) === Number(year) && Number(r.month) === Number(month)));

    const advances = (await api.advanceRequests.list({ where: { year } }))
      .filter(a => a.month === month && a.status === 'paid');

    const generated: PayrollRecord[] = [];

    for (const emp of employees) {
      if (!emp.id) continue;
      const empAttendance = attendanceRecords.filter(a => a.employeeId === emp.id);
      
      const payrollData = this.calculatePayrollForEmployee(emp, empAttendance, advances, month, year, params);

      // Varolan bordro kaydı var mı
      const existing = (await api.payrollRecords.list({ where: { employeeId: emp.id } }))
        .filter(p => p.month === month && p.year === year)[0];

      if (existing && existing.id) {
        await api.payrollRecords.update(existing.id, {
          ...payrollData,
          paymentStatus: existing.paymentStatus,
          isAccounted: existing.isAccounted,
          journalEntryId: existing.journalEntryId
        });
        generated.push({ ...payrollData, id: existing.id, createdAt: existing.createdAt });
      } else {
        const id = await api.payrollRecords.create({
          ...payrollData,
          createdAt: new Date()
        }) as number;
        generated.push({ ...payrollData, id, createdAt: new Date() });
      }
    }

    return generated;
  },

  // Bordroyu Muhasebeleştirme (Genel Muhasebe Yevmiye Fişi Oluşturma)
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

    await api.payrollRecords.update(payrollId, {
      isAccounted: true,
      journalEntryId: journalEntryId as number
    });
  }
};
