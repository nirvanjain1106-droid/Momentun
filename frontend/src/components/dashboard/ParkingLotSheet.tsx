import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { ParkingLotPanel } from './ParkingLotPanel';

export const ParkingLotSheet: React.FC = () => {
  const { activeModal, closeModal } = useUIStore();
  const isOpen = activeModal?.name === 'parking-lot';
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        closeModal();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeModal, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      id="parking-sheet"
      onClick={(event) => {
        if (event.target === overlayRef.current) closeModal();
      }}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-md sm:items-center"
    >
      <div className="flex h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[32px] border border-white/50 bg-[rgba(255,255,255,0.88)] shadow-[0_30px_80px_rgba(15,23,42,0.26)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Parking lot</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Later queue</h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            aria-label="Close Later tasks"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ParkingLotPanel />
        </div>
      </div>
    </div>
  );
};
