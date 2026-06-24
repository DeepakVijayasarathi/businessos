'use client';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SmartFillProps {
  type: 'lead' | 'contact' | 'deal' | 'ticket' | 'invoice' | 'employee' | 'task' | 'contract' | 'purchase_order';
  onFill: (data: Record<string, any>) => void;
  label?: string;
}

export function SmartFill({ type, onFill, label = 'Smart Fill' }: SmartFillProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  const handleFill = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/ai/extract', { text: text.trim(), type });
      onFill(data.data);
      toast.success('Fields filled from AI');
      setText('');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'AI could not extract data — try pasting more detail');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-medium hover:from-violet-600 hover:to-indigo-600 transition-all shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {label}
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Paste any text — AI fills the form
            </span>
            <button type="button" onClick={() => { setOpen(false); setText(''); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={PLACEHOLDERS[type]}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 resize-none outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <button
            type="button"
            disabled={!text.trim() || loading}
            onClick={handleFill}
            className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</> : <><Sparkles className="w-3.5 h-3.5" /> Fill Fields</>}
          </button>
        </div>
      )}
    </div>
  );
}

const PLACEHOLDERS: Record<string, string> = {
  lead: 'Paste an email, business card, LinkedIn bio, or any text with contact details...',
  contact: 'Paste a name, email, phone number, job title, or any contact info...',
  deal: 'Paste a proposal summary, email thread, or deal description...',
  ticket: 'Paste the customer complaint, email, or issue description...',
  invoice: 'Paste a list of services rendered, work done, or items to bill...',
  employee: 'Paste the offer letter, resume summary, or job details...',
  task: 'Describe the task in plain English...',
  contract: 'Paste the contract summary, party name, or deal terms...',
  purchase_order: 'Paste the vendor quote, items needed, or purchase description...',
};
