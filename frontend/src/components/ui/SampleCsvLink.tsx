'use client';
import { FileDown } from 'lucide-react';

interface SampleCsvLinkProps {
  filename: string;
  headers: string[];
  rows: string[][];
}

/** Small "Sample CSV" link that downloads a client-generated example file
 *  so users know the exact format an import expects. */
export function SampleCsvLink({ filename, headers, rows }: SampleCsvLinkProps) {
  const download = () => {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
      title="Download an example CSV showing the expected columns"
    >
      <FileDown className="w-3 h-3" /> Sample CSV
    </button>
  );
}
