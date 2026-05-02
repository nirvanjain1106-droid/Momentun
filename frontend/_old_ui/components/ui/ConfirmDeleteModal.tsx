import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface ConfirmDeleteModalProps {
  title: string;
  onConfirm: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ title, onConfirm }) => {
  const { closeModal } = useUIStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      closeModal();
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ zIndex: 'var(--z-modal-backdrop)', backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={closeModal}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 animate-in slide-in-from-bottom-4 duration-300"
        style={{
          zIndex: 'var(--z-modal)',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
            >
              <AlertTriangle size={20} style={{ color: 'var(--error-red, #ef4444)' }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Confirm Delete
            </h2>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-full transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>? This action cannot be undone.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={closeModal}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60"
            style={{ backgroundColor: 'var(--error-red, #ef4444)' }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};
