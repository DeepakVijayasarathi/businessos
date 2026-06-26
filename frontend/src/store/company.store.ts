import { create } from 'zustand';

interface CompanySettings {
  currency: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  name: string;
  logo?: string;
}

interface CompanyStore {
  settings: CompanySettings;
  setSettings: (s: Partial<CompanySettings>) => void;
}

export const useCompanyStore = create<CompanyStore>((set) => ({
  settings: {
    currency: 'USD',
    timezone: 'UTC',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    name: 'BusinessOS',
    logo: undefined,
  },
  setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
}));
