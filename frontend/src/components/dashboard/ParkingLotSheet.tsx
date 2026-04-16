import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { ParkingLotPanel } from './ParkingLotPanel';
import { X } from 'lucide-react';

export const ParkingLotSheet: React.FC = () => {
  const { activeModal, closeModal } = useUIStore();
  const isOpen = activeModal?.name === 'parking-lot';
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeModal]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      closeModal();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={overlayRef}
      role="dialog" 
      aria-modal="true" 
      id="parking-sheet"
      onClick={handleBackdropClick}
      className="fixed inset-0 flex items-end sm:items-center justify-center animate-in fade-in duration-200"
      style={{ 
        zIndex: 'var(--z-modal-backdrop)', 
        backgroundColor: 'rgba(0,0,0,0.6)' 
      }}
    >
      <div 
        className="w-full h-[85vh] sm:h-[80vh] sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-xl shadow-xl flex flex-col animate-in slide-in-from-bottom-full duration-300"
        style={{ zIndex: 'var(--z-modal)' }}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Parking Lot</h2>
          <button 
            type="button" 
            onClick={closeModal} 
            className="p-2 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full p-4">
          <ParkingLotPanel />
        </div>
      </div>
    </div>
  );
};
