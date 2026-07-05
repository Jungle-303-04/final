import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean; toggleSidebar: () => void;
  toasts: { id: number; tone: string; title: string }[];
  toast: (tone: string, title: string) => void; dismiss: (id: number) => void;
}
let seq = 0;
export const uiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  toasts: [],
  toast: (tone, title) => {
    const id = ++seq;
    set(s => ({ toasts: [...s.toasts, { id, tone, title }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
