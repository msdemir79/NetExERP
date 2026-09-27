import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../Modal';
import { settingsService } from '../../services/settingsService';

interface BarcodeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BarcodeSettingsState {
  barcodeType: 'EAN-13' | 'CODE-128' | 'CODE-39';
  barcodePrefix: string;
  nextBarcodeSequence: number;
}

export default function BarcodeSettingsModal({ isOpen, onClose }: BarcodeSettingsModalProps) {
  const [barcodeSettings, setBarcodeSettings] = useState<BarcodeSettingsState>({
    barcodeType: 'CODE-128',
    barcodePrefix: '869',
    nextBarcodeSequence: 1000000,
  });

  useEffect(() => {
    if (isOpen) {
      settingsService.getBarcodeSettings().then(s => {
        setBarcodeSettings({
          barcodeType: s.barcodeType || 'CODE-128',
          barcodePrefix: s.barcodePrefix || '869',
          nextBarcodeSequence: s.nextBarcodeSequence || 1000000,
        });
      });
    }
  }, [isOpen]);

  const handleSaveBarcodeSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await settingsService.updateBarcodeSettings(barcodeSettings);
      onClose();
      alert('Barkod ayarları başarıyla güncellendi.');
    } catch (err) {
      console.error('Barcode settings error:', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Barkod Formatı ve Sıra Numarası"
      className="max-w-md"
    >
      <form onSubmit={handleSaveBarcodeSettings} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barkod Standardı</label>
          <select
            value={barcodeSettings.barcodeType}
            onChange={e => setBarcodeSettings(prev => ({ ...prev, barcodeType: e.target.value as any }))}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
          >
            <option value="CODE-128">CODE-128 (Esnek Alfamerik & Kompakt)</option>
            <option value="EAN-13">EAN-13 (Uluslararası Perakende Standart)</option>
            <option value="CODE-39">CODE-39 (Endüstriyel)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barkod Ön Eki (Prefix)</label>
          <input
            type="text"
            value={barcodeSettings.barcodePrefix}
            onChange={e => setBarcodeSettings(prev => ({ ...prev, barcodePrefix: e.target.value }))}
            placeholder="Örn: 869"
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sıradaki Sayaç (Sequence)</label>
          <input
            type="number"
            value={barcodeSettings.nextBarcodeSequence}
            onChange={e => setBarcodeSettings(prev => ({ ...prev, nextBarcodeSequence: Number(e.target.value) }))}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md"
        >
          Ayarları Kaydet
        </button>
      </form>
    </Modal>
  );
}
