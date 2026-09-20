import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { 
  Users, 
  ShieldCheck, 
  FileText, 
  UserPlus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Edit, 
  Trash2, 
  MoreVertical, 
  Lock, 
  Unlock, 
  Phone, 
  Mail, 
  Building2, 
  KeyRound, 
  Shield, 
  Calendar,
  Layers,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import PageHeader from '../PageHeader';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import UserModal from './UserModal';
import RoleModal from './RoleModal';
import RolePermissionsMatrix from './RolePermissionsMatrix';
import AuditLogTab from './AuditLogTab';
import type { AppUser, Role, UserStatus } from '../../types';

export default function UsersManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';

  const { currentUser, currentRole, switchUser, isSuperAdmin, hasPermission } = useAuth();

  // Queries
  const users = useApiQuery(() => api.users.list(), [], ['users']) || [];
  const roles = useApiQuery(() => api.roles.list(), [], ['roles']) || [];
  const auditLogsCount = useApiQuery(() => api.auditLogs.count(), [], ['auditLogs']) || 0;

  // Filters & State for Users Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | undefined>(undefined);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  // User counts by role
  const userCountByRole: Record<string, number> = {};
  users.forEach(u => {
    userCountByRole[u.roleCode] = (userCountByRole[u.roleCode] || 0) + 1;
  });

  // Filtered users
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.title && u.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDept = departmentFilter === 'all' || u.department === departmentFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchesRole = roleFilter === 'all' || u.roleCode === roleFilter;

    return matchesSearch && matchesDept && matchesStatus && matchesRole;
  });

  // Departments list from existing users
  const departments = Array.from(new Set(users.map(u => u.department).filter(Boolean)));

  // User handlers
  const handleSaveUser = async (userData: Partial<AppUser>) => {
    if (editingUser?.id) {
      await userService.updateUser(editingUser.id, userData);
    } else {
      await userService.createUser(userData as Omit<AppUser, 'id'>);
    }
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (!user.id) return;
    if (window.confirm(`"${user.fullName}" kullanıcısını silmek istediğinize emin misiniz?`)) {
      try {
        await userService.deleteUser(user.id);
      } catch (err: any) {
        alert(err.message || 'Kullanıcı silinemedi.');
      }
    }
  };

  const handleToggleUserStatus = async (user: AppUser) => {
    if (!user.id) return;
    const nextStatus: UserStatus = user.status === 'active' ? 'passive' : 'active';
    const msg = nextStatus === 'active' 
      ? `"${user.fullName}" kullanıcısı aktif edilsin mi?` 
      : `"${user.fullName}" kullanıcısı pasif duruma getirilsin mi? (Sisteme giriş yapamaz)`;
    
    if (window.confirm(msg)) {
      await userService.toggleUserStatus(user.id, nextStatus);
    }
  };

  // Role handlers
  const handleSaveRole = async (roleData: Partial<Role>) => {
    if (editingRole?.id) {
      await userService.updateRole(editingRole.id, roleData);
    } else {
      const newId = await userService.createRole(roleData as Omit<Role, 'id'>);
      setSelectedRoleId(newId);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!role.id) return;
    if (window.confirm(`"${role.name}" rolünü silmek istediğinize emin misiniz?`)) {
      try {
        await userService.deleteRole(role.id);
        if (selectedRoleId === role.id && roles[0]?.id) {
          setSelectedRoleId(roles[0].id);
        }
      } catch (err: any) {
        alert(err.message || 'Rol silinemedi.');
      }
    }
  };

  const handleResetRolesToDefault = async () => {
    if (window.confirm('Ön tanımlı fabrika rollerini ve yetki matrislerini varsayılan ayarlara sıfırlamak istiyor musunuz?')) {
      await userService.resetRolesToDefaults();
    }
  };

  // Metrics
  const activeUsersCount = users.filter(u => u.status === 'active').length;
  const passiveUsersCount = users.filter(u => u.status !== 'active').length;
  const superAdminCount = users.filter(u => u.roleCode === 'super_admin').length;

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <PageHeader
        icon={ShieldCheck}
        title="Kullanıcı & Yetki Yönetimi"
        subtitle="Kullanıcı hesapları, departman yetkileri, rol matrisi (RBAC) ve denetim kayıtları"
        badge="Sistem Güvenliği & RBAC"
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam Kullanıcı</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{users.length}</span>
            <span className="text-xs font-semibold text-emerald-600">({activeUsersCount} Aktif)</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">{passiveUsersCount} pasif/askıda hesap</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tanımlı Roller</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{roles.length}</span>
            <span className="text-xs font-semibold text-indigo-600">
              ({roles.filter(r => !r.isSystem).length} Özel Rol)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">6 kademeli yetki matrisi</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sistem Yöneticileri</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{superAdminCount}</span>
            <span className="text-xs font-semibold text-purple-600">Süper Admin</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Tam yetkili kök hesap</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">İşlem Denetim İzi</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{auditLogsCount}</span>
            <span className="text-xs font-semibold text-slate-600">Kayıt</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Gerçek zamanlı audit günlüğü</span>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => handleTabChange('users')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Kullanıcı Hesapları ({users.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('roles')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'roles'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Roller & Yetki Matrisi ({roles.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('audit')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>İşlem Denetim İzi (Audit Log)</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          
          {/* Action & Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Ad soyad, kullanıcı adı veya e-posta..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>

              {/* Department filter */}
              <div className="w-full sm:w-44">
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option value="all">Tüm Departmanlar</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div className="w-full sm:w-36">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="passive">Pasif</option>
                  <option value="suspended">Askıda</option>
                </select>
              </div>

              {/* Role filter */}
              <div className="w-full sm:w-44">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option value="all">Tüm Roller</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Add User Button */}
            <button
              onClick={() => {
                setEditingUser(null);
                setIsUserModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs inline-flex items-center gap-2 self-end md:self-center shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Yeni Kullanıcı Ekle</span>
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                    <th className="py-3 px-4 min-w-[220px]">Kullanıcı Bilgisi</th>
                    <th className="py-3 px-3 min-w-[150px]">Departman & Görev</th>
                    <th className="py-3 px-3 min-w-[150px]">Yetki Rolü</th>
                    <th className="py-3 px-3 min-w-[140px]">İletişim</th>
                    <th className="py-3 px-3 min-w-[100px]">Durum</th>
                    <th className="py-3 px-3 min-w-[120px]">Son Giriş</th>
                    <th className="py-3 px-4 text-right min-w-[160px]">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold text-xs text-slate-600">Filtreye uygun kullanıcı bulunamadı.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isCurrent = currentUser?.id === u.id;
                      const isActive = u.status === 'active';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50 dark:bg-slate-800/50/70 transition-colors">
                          {/* User Avatar & Name */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-2xs"
                                style={{ backgroundColor: u.color || '#4f46e5' }}
                              >
                                {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{u.fullName}</span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                                      Siz
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-slate-400 block truncate">@{u.username}</span>
                              </div>
                            </div>
                          </td>

                          {/* Dept & Title */}
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">{u.department || '-'}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">{u.title || '-'}</span>
                          </td>

                          {/* Role */}
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                              <Shield className="w-3 h-3 text-indigo-500" />
                              {u.roleName || u.roleCode}
                            </span>
                          </td>

                          {/* Contact */}
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                            <div className="flex items-center gap-1 truncate" title={u.email}>
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{u.email}</span>
                            </div>
                            {u.phone && (
                              <div className="flex items-center gap-1 mt-0.5 text-slate-500 dark:text-slate-400 truncate">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{u.phone}</span>
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3">
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                                u.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : u.status === 'suspended'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                              }`}
                              title="Tıklandığında durumu değiştir"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                u.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                              }`} />
                              {u.status === 'active' ? 'Aktif' : (u.status === 'suspended' ? 'Askıda' : 'Pasif')}
                            </button>
                          </td>

                          {/* Last Login */}
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('tr-TR') : 'Giriş Yapılmadı'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Switch user simulator button */}
                              {!isCurrent && isActive && (
                                <button
                                  type="button"
                                  onClick={() => switchUser(u.id!)}
                                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold transition-all inline-flex items-center gap-1"
                                  title="Bu kullanıcıya geçiş yap ve arayüzü test et"
                                >
                                  <span>Giriş Yap</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setIsUserModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4" />
                              </button>

                              {/* Prevent deleting last super admin */}
                              {u.username !== 'mdemir' && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Sil"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSION MATRIX */}
      {activeTab === 'roles' && (
        <RolePermissionsMatrix
          roles={roles}
          selectedRoleId={selectedRoleId}
          onSelectRole={(r) => setSelectedRoleId(r.id)}
          onEditRole={(r) => {
            setEditingRole(r);
            setIsRoleModalOpen(true);
          }}
          onDeleteRole={handleDeleteRole}
          onAddNewRole={() => {
            setEditingRole(null);
            setIsRoleModalOpen(true);
          }}
          onResetDefaults={handleResetRolesToDefault}
          userCountByRole={userCountByRole}
        />
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <AuditLogTab />
      )}

      {/* User Modal */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSave={handleSaveUser}
        user={editingUser}
        roles={roles}
      />

      {/* Role Modal */}
      <RoleModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        onSave={handleSaveRole}
        role={editingRole}
        existingRoles={roles}
      />
    </div>
  );
}
