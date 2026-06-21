'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ExportButtonProps {
  endpoint: string;
  filename: string;
  params?: Record<string, string | undefined>;
  label?: string;
}

export function ExportButton({ endpoint, filename, params, label = 'Export CSV' }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const cleanParams = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v))
        : undefined;
      const res = await api.get(endpoint, { params: cleanParams, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {label}
    </button>
  );
}
