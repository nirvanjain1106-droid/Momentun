import { create } from 'zustand';

export type ModalPayload =
  | { name: 'quick-add'; data: null }
  | { name: 'new-goal'; data: null }
  | { name: 'edit-goal'; data: any } // We'll type this later as GoalDetailResponse
  | { name: 'confirm-delete'; data: { title: string; onConfirm: () => void } }
  | { name: 'parking-lot'; data: null };

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface UIState {
  sidebarOpen: boolean;
  activeModal: ModalPayload | null;
  toasts: Toast[];
  isOffline: boolean;

  toggleSidebar: () => void;
  openModal: (payload: ModalPayload) => void;
  closeModal: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setOffline: (offline: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false, // Default closed on mobile, open on desktop (managed by CSS or app check later)
  activeModal: null,
  toasts: [],
  isOffline: !navigator.onLine, // Initial offline check

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  openModal: (payload) => set({ activeModal: payload }),
  closeModal: () => set({ activeModal: null }),
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    
    // Auto-dismiss
    const duration = toast.duration || 3000;
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setOffline: (offline) => set({ isOffline: offline }),
}));
