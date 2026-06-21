'use client';
import { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';

// Static class lookup — Tailwind's JIT compiler can't detect dynamically
// interpolated class names (e.g. `bg-${color}-50`), so every supported
// color needs its full class strings written out literally here.
const ICON_COLORS: Record<string, { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-600 dark:text-green-400' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400' },
  red: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-600 dark:text-yellow-400' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-950/30', text: 'text-pink-600 dark:text-pink-400' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-600 dark:text-teal-400' },
};

const MAX_WIDTHS: Record<string, string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl',
};

interface ModalProps {
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: keyof typeof ICON_COLORS;
  size?: keyof typeof MAX_WIDTHS;
  children: ReactNode;
}

/**
 * Shared shell for every data-entry modal: handles Escape-to-close,
 * focus management, backdrop, entrance animation, and a consistent
 * header. Body content (form fields) goes in children; pair with
 * <ModalFooter> for the action row.
 */
export function Modal({ onClose, title, subtitle, icon: Icon, iconColor = 'indigo', size = 'lg', children }: ModalProps) {
  const modalRef = useModalA11y(onClose);
  const colors = ICON_COLORS[iconColor] || ICON_COLORS.indigo;

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 outline-none animate-in fade-in duration-200"
    >
      <div className={`glass-card rounded-2xl w-full ${MAX_WIDTHS[size]} shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col`}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {Icon && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 flex-shrink-0 rounded-b-2xl">
      {children}
    </div>
  );
}
