import React, { useState, useEffect } from 'react';
import { X, Shield, AlertCircle, Copy, Check } from 'lucide-react';
import type { Role } from '../../types';
import { createBlankPermissions, createFullPermissions } from '../../data/initialRoles';

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (roleData: Partial<Role>) => Promise<void>;
  role?: Role | null;
  existingRoles: Role[];
}

const ROLE_COLORS = [
  'indigo',
  'emerald',
  'amber',
  'violet',
  'cyan',
  'rose',
  'slate',
  'blue',
  'teal'
];

export default function RoleModal({
  isOpen,
  onClose,
  onSave,
  role,
  existingRoles
}: RoleModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('indigo');
  const [templateRoleCode, setTemplateRoleCode] = useState<string>('blank');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (role) {
      setName(role.name || '');
      setCode(role.code || '');
      setDescription(role.description || '');
      setColor(role.color || 'indigo');
      setTemplateRoleCode('keep');
    } else {
      setName('');
      setCode('');
      setDescription('');
      setColor('indigo');
      setTemplateRoleCode('blank');
    }
    setError(null);
  }, [role, isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!role) {
      const generated = val
        .trim()
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      if (generated && !code) {
        setCode(generated);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Rol adı alanı zorunludur.');
      return;
    }
    if (!code.trim()) {
      setError('Rol kodu alanı zorunludur.');
      return;
    }

    try {
      setIsSubmitting(true);

      let initialPermissions = role?.permissions;

      if (!role) {
        if (templateRoleCode === 'blank') {
          initialPermissions = createBlankPermissions();
        } else if (templateRoleCode === 'full') {
          initialPermissions = createFullPermissions();
        } else {
          const baseRole = existingRoles.find(r => r.code === templateRoleCode);
          initialPermissions = baseRole ? JSON.parse(JSON.stringify(baseRole.permissions)) : createBlankPermissions();
        }
      }

      await onSave({
        name: name.trim(),
        code: code.trim().toLowerCase(),
        description: description.trim(),
        color,
        isSystem: role?.isSystem || false,
        permissions: initialPermissions
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Rol kaydedilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {role ? 'Rol Bilgilerini Düzenle' : 'Yeni Özel Rol Tanımla'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Rol adı, sistem kodu ve başlangıç yetki şablonu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Rol Adı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Örn: Fason Saya Takipçisi"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Sistem Rol Kodu <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={Boolean(role && role.isSystem)}
              placeholder="Örn: fason_tracker"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {role?.isSystem ? 'Sistem rollerinin kodu değiştirilemez.' : 'Benzersiz tanımlayıcı (küçük harf ve alt çizgi)'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Rol Açıklaması
            </label>
            <textarea
              rows={2}
              placeholder="Bu role sahip kullanıcıların şirket içindeki yetki kapsamı..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Başlangıç Yetki Şablonu (Sadece yeni rol oluştururken) */}
          {!role && (
            <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1.5">
              <label className="block text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                Başlangıç Yetki Şablonu Kopyala
              </label>
              <select
                value={templateRoleCode}
                onChange={(e) => setTemplateRoleCode(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-200 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="blank">⚪ Boş Şablon (Tüm Yetkiler Kapalı)</option>
                <option value="full">🟢 Tam Yetkili Şablon (Tüm Yetkiler Açık)</option>
                <optgroup label="Mevcut Rollerin Yetkilerini Kopyala">
                  {existingRoles.map(r => (
                    <option key={r.code} value={r.code}>
                      📋 {r.name} rolünün yetkilerini kopyala
                    </option>
                  ))}
                </optgroup>
              </select>
              <span className="text-[10px] text-indigo-600/80 block">
                Rolü oluşturduktan sonra Yetki Matrisi sekmesinden detaylı olarak özelleştirebilirsiniz.
              </span>
            </div>
          )}

          {/* Renk Seçimi */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Rol Rozet Rengi
            </label>
            <div className="flex items-center gap-2">
              {ROLE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                    color === c 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                      : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Kaydediliyor...' : (role ? 'Güncelle' : 'Rolü Oluştur')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
