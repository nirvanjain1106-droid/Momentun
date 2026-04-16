import { useUIStore } from '../../stores/uiStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export function ToastContainer() {
  const toasts = useUIStore(state => state.toasts);
  const removeToast = useUIStore(state => state.removeToast);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none pb-4">
      {toasts.map(toast => {
        let Icon = Info;
        let borderClass = 'border-info';
        
        switch (toast.type) {
          case 'success':
            Icon = CheckCircle;
            borderClass = 'border-success';
            break;
          case 'error':
            Icon = AlertCircle;
            borderClass = 'border-danger';
            break;
          case 'warning':
            Icon = AlertTriangle;
            borderClass = 'border-warning';
            break;
        }

        return (
          <div 
            key={toast.id}
            className={`surface-card flex items-start gap-3 p-4 shadow-lg border-l-4 ${borderClass} animate-in slide-in-from-top-4 duration-300 pointer-events-auto`}
          >
            <Icon className={`flex-shrink-0 mt-0.5`} style={{ color: `var(--status-${toast.type})` }} size={18} />
            <div className="flex-1 text-sm font-medium text-text-primary">
              {toast.message}
            </div>
            <button 
              onClick={() => removeToast(toast.id)}
              className="text-text-tertiary hover:text-text-primary p-1 -m-1"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
