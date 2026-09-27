import { Lock } from 'lucide-react';
import Modal from '../Modal';

interface BlockedOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string | null;
}

export default function BlockedOrderModal({ isOpen, onClose, reason }: BlockedOrderModalProps) {
  return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="İşlem Yapılamaz"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-600 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 text-xs">
              <h4 className="font-black text-amber-900 text-sm">Sipariş Korumalı</h4>
              <p className="text-amber-800 font-semibold leading-relaxed">
                {reason}
              </p>
              <p className="text-amber-700 text-[11px]">
                Siparişi silmek veya düzenlemek için öncelikle ilgili fatura ve irsaliyeleri iptal etmeniz veya silmeniz gerekmektedir.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      </Modal>
  );
}
