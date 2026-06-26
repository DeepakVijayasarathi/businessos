import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useCompanyStore } from '@/store/company.store';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Read company settings from Zustand outside React (works in non-hook contexts)
function getSettings() {
  return useCompanyStore.getState().settings;
}

export function formatCurrency(amount: number, currencyOverride?: string): string {
  const currency = currencyOverride || getSettings().currency || 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const { timezone } = getSettings();
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(timezone && timezone !== 'UTC' ? { timeZone: timezone } : {}),
    ...options,
  });
}

export function formatDateTime(date: string | Date): string {
  const { timezone } = getSettings();
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...(timezone && timezone !== 'UTC' ? { timeZone: timezone } : {}),
  });
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function truncate(str: string, length = 50): string {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-active', new: 'badge-new', open: 'badge-new',
    pending: 'badge-pending', scheduled: 'badge-pending', in_progress: 'badge-pending',
    closed: 'badge-closed', resolved: 'badge-closed', done: 'badge-active',
    failed: 'badge-error', cancelled: 'badge-error', lost: 'badge-error',
    won: 'badge-active', paid: 'badge-active', draft: 'badge-closed',
    qualified: 'badge-active', contacted: 'badge-pending',
  };
  return map[status?.toLowerCase()] || 'badge-closed';
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    urgent: 'text-red-600 bg-red-50 dark:bg-red-950/30',
    high: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30',
    medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30',
    low: 'text-green-600 bg-green-50 dark:bg-green-950/30',
  };
  return map[priority?.toLowerCase()] || '';
}
