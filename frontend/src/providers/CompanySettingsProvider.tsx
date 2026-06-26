'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCompanyStore } from '@/store/company.store';

// Convert a hex colour to the "H S% L%" string that CSS custom properties use
function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyColors(primary: string, secondary: string) {
  const root = document.documentElement;
  // Set raw hex vars for inline styles
  root.style.setProperty('--brand-primary', primary);
  root.style.setProperty('--brand-secondary', secondary);
  // Override the HSL vars used by Tailwind's ring/border utilities
  const hsl = hexToHsl(primary);
  if (hsl) {
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--ring', hsl);
  }
}

export function CompanySettingsProvider({ children }: { children: React.ReactNode }) {
  const setSettings = useCompanyStore((s) => s.setSettings);

  const { data } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => { const { data } = await api.get('/settings/company'); return data.data; },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    setSettings({
      currency:       data.currency       || 'USD',
      timezone:       data.timezone       || 'UTC',
      primaryColor:   data.primaryColor   || '#6366f1',
      secondaryColor: data.secondaryColor || '#8b5cf6',
      name:           data.name           || 'BusinessOS',
      logo:           data.logo,
    });
    applyColors(data.primaryColor || '#6366f1', data.secondaryColor || '#8b5cf6');
  }, [data, setSettings]);

  return <>{children}</>;
}
