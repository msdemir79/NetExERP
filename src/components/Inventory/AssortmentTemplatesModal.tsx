import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';
import type { AssortmentTemplate } from '../../types';

interface AssortmentTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: AssortmentTemplate[] | undefined;
}

const DEFAULT_ITEMS: { size: string; quantity: number }[] = [
  { size: '40', quantity: 1 },
  { size: '41', quantity: 2 },
  { size: '42', quantity: 3 },
  { size: '43', quantity: 3 },
  { size: '44', quantity: 2 },
  { size: '45', quantity: 1 },
];

export default function AssortmentTemplatesModal({ isOpen, onClose, templates }: AssortmentTemplatesModalProps) {
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItems] = useState<{ size: string; quantity: number }[]>(DEFAULT_ITEMS);

  const handleSaveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    try {
      await api.assortmentTemplates.create({
        name: newTemplateName.trim(),
        items: newTemplateItems,
      });
      setNewTemplateName('');
      alert('Asorti şablonu başarıyla eklendi.');
    } catch (err) {
      console.error('Template save error:', err);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (confirm('Bu asorti şablonunu silmek istediğinize emin misiniz?')) {
      await api.assortmentTemplates.remove(id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Asorti & Numara Şablonları"
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Create new template */}
        <form onSubmit={handleSaveTemplate} className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Yeni Şablon Ekle</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Şablon Adı</label>
              <input
                type="text"
                required
                placeholder="Örn: Erkek 40-45 (12'li), Taban 36-45..."
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-xs"
              >
                Şablonu Kaydet
              </button>
            </div>
          </div>
        </form>

        {/* Existing Templates list */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Mevcut Şablonlar</h4>
          <div className="space-y-2">
            {templates?.map(t => (
              <div key={t.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">{t.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {t.items.map((it, idx) => (
                      <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600">
                        {it.size} ({it.quantity})
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTemplate(t.id!)}
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
