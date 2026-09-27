import React, { useState } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { Trash2, Ruler, Barcode } from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';
import DataGrid, { GridColumn } from '../Common/DataGrid';
import { AssortmentTemplate } from '../../types';
import { BarcodeTemplatesManager } from './BarcodeTemplatesManager';
import { cn } from '../../lib/utils';

export default function Templates() {
  const [activeTab, setActiveTab] = useState<'barcode' | 'assortment'>('barcode');

  // Assortment State
  const assortmentTemplates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) || [];
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItem, setNewTemplateItem] = useState({ size: '', quantity: 1 });
  const [newTemplateItems, setNewTemplateItems] = useState<{size: string, quantity: number}[]>([]);
  const sizeInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddTemplateItem = () => {
    if (!newTemplateItem.size || newTemplateItem.quantity <= 0) return;
    if (newTemplateItems.find(i => i.size === newTemplateItem.size)) {
      alert('Bu beden zaten eklenmiş.');
      return;
    }
    setNewTemplateItems([...newTemplateItems, { ...newTemplateItem }]);
    setNewTemplateItem({ size: '', quantity: 1 });
    sizeInputRef.current?.focus();
  };

  const removeTemplateItem = (size: string) => {
    setNewTemplateItems(newTemplateItems.filter(i => i.size !== size));
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName || newTemplateItems.length === 0) return;
    await inventoryService.addAssortmentTemplate({
      name: newTemplateName,
      items: newTemplateItems
    });
    setNewTemplateName('');
    setNewTemplateItems([]);
    setNewTemplateItem({ size: '', quantity: 1 });
  };

  const deleteTemplate = async (id: number) => {
    if (confirm('Bu asorti şablonunu silmek istediğinize emin misiniz?')) {
      await api.assortmentTemplates.remove(id);
    }
  };

  const templateColumns = React.useMemo<GridColumn<AssortmentTemplate>[]>(() => [
    {
      key: 'name',
      title: 'Şablon Adı',
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
            <Ruler className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">{t.name}</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              TOPLAM: {t.items.reduce((acc, curr) => acc + curr.quantity, 0)} ÇİFT / KOLİ
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      title: 'Beden Dağılımı',
      filterable: false,
      render: (t) => (
        <div className="flex flex-wrap gap-2">
          {t.items.map((item, i) => (
            <div key={i} className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg flex flex-col items-center min-w-[50px]">
              <span className="text-[9px] font-bold text-slate-400 uppercase">NO</span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-200">{item.size}</span>
              <div className="w-full h-px bg-slate-200 dark:bg-slate-700 my-1" />
              <span className="text-[10px] font-bold text-indigo-600">{item.quantity}</span>
            </div>
          ))}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      {/* 1. SEKMELİ GEZİNME BAŞLIĞI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <span>Şablon Yönetimi</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold mt-0.5">
            100x150 mm koli, 60x40 mm kutu barkod tasarımları ve ayakkabı asorti dağılım standartları.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('barcode')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
              activeTab === 'barcode'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            <Barcode className="w-4 h-4" />
            <span>Barkod & Termal Etiketler (100x150, 60x40)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assortment')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
              activeTab === 'assortment'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            <Ruler className="w-4 h-4" />
            <span>Asorti & Beden Dağılımı ({assortmentTemplates.length})</span>
          </button>
        </div>
      </div>

      {/* 2. TAB 1: BARKOD & TERMAL ETİKET ŞABLONLARI */}
      {activeTab === 'barcode' && (
        <BarcodeTemplatesManager />
      )}

      {/* 3. TAB 2: ASORTİ ŞABLONLARI */}
      {activeTab === 'assortment' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Creation Form */}
          <div className="lg:col-span-1">
            <form onSubmit={handleCreateTemplate} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 sticky top-8">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-3">
                Yeni Asorti Şablonu Oluştur
              </h3>
              
              <div className="space-y-4">
                 <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Şablon İsmi</label>
                  <input 
                    required 
                    value={newTemplateName} 
                    onChange={e => setNewTemplateName(e.target.value)} 
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-800/50" 
                    placeholder="ÖRN: 12'Lİ ERKEK KLASİK"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-4 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Beden / Miktar Ekle</div>
                  <div className="flex gap-2">
                    <input 
                      ref={sizeInputRef}
                      type="text" 
                      placeholder="Beden" 
                      className="w-20 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-center outline-none focus:border-indigo-400 bg-white dark:bg-slate-900"
                      value={newTemplateItem.size}
                      onChange={e => setNewTemplateItem({ ...newTemplateItem, size: e.target.value })}
                    />
                    <input 
                      type="number" 
                      placeholder="Adet" 
                      className="w-24 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-center outline-none focus:border-indigo-400 bg-white dark:bg-slate-900"
                      value={newTemplateItem.quantity}
                      onChange={e => setNewTemplateItem({ ...newTemplateItem, quantity: Number(e.target.value) })}
                    />
                    <button 
                      type="button"
                      onClick={handleAddTemplateItem}
                      className="flex-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase px-3 hover:bg-indigo-600 transition-colors shadow-sm cursor-pointer"
                    >
                      EKLE
                    </button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {newTemplateItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">NO: {item.size}</span>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">x {item.quantity} Adet</span>
                        </div>
                        <button type="button" onClick={() => removeTemplateItem(item.size)} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={newTemplateItems.length === 0 || !newTemplateName}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
              >
                ŞABLONU KAYDET
              </button>
            </form>
          </div>

          {/* Existing Templates List */}
          <div className="lg:col-span-2">
            <DataGrid
              columns={templateColumns}
              data={assortmentTemplates}
              rowKey={(t) => t.id ?? t.name}
              emptyMessage="Henüz hiçbir asorti şablonu tanımlanmadı."
              rowActions={(t) => (
                <button
                  onClick={() => t.id && deleteTemplate(t.id)}
                  className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}

