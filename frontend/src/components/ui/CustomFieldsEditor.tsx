'use client';
import { Plus, Trash2 } from 'lucide-react';

interface CustomFieldsEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

/**
 * Generic key/value editor for a record's `customFields` JSON column —
 * the backend models (Lead, Contact, Deal, CrmCompany) already store this,
 * there was just no UI to manage it.
 */
export function CustomFieldsEditor({ value, onChange }: CustomFieldsEditorProps) {
  const entries = Object.entries(value || {});

  const updateEntry = (index: number, key: string, val: string) => {
    const next = [...entries];
    next[index] = [key, val];
    onChange(Object.fromEntries(next));
  };

  const removeEntry = (index: number) => {
    onChange(Object.fromEntries(entries.filter((_, i) => i !== index)));
  };

  const addEntry = () => {
    onChange({ ...value, '': '' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Custom Fields</label>
        <button type="button" onClick={addEntry} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add field
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">No custom fields yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, val], i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label="Custom field name"
                value={key}
                onChange={e => updateEntry(i, e.target.value, val)}
                placeholder="Field name"
                className="w-1/3 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none"
              />
              <input
                aria-label="Custom field value"
                value={val}
                onChange={e => updateEntry(i, key, e.target.value)}
                placeholder="Value"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none"
              />
              <button type="button" onClick={() => removeEntry(i)} aria-label="Remove custom field" className="p-2 text-gray-300 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
