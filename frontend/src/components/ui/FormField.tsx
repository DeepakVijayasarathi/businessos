'use client';
import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const baseFieldCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-colors focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function Wrapper({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
}

export function TextField({ id, label, hint, className = '', ...props }: TextFieldProps) {
  return (
    <Wrapper id={id} label={label} required={props.required} hint={hint}>
      <input id={id} className={`${baseFieldCls} ${className}`} {...props} />
    </Wrapper>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  hint?: string;
}

export function SelectField({ id, label, hint, className = '', children, ...props }: SelectFieldProps) {
  return (
    <Wrapper id={id} label={label} required={props.required} hint={hint}>
      <select id={id} className={`${baseFieldCls} ${className}`} {...props}>
        {children}
      </select>
    </Wrapper>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: string;
  hint?: string;
}

export function TextAreaField({ id, label, hint, className = '', ...props }: TextAreaFieldProps) {
  return (
    <Wrapper id={id} label={label} required={props.required} hint={hint}>
      <textarea id={id} className={`${baseFieldCls} resize-none ${className}`} {...props} />
    </Wrapper>
  );
}

export const fieldCls = baseFieldCls;
