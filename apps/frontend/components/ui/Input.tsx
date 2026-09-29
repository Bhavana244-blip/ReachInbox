'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 text-sm bg-surface-input border rounded-lg
            placeholder:text-text-placeholder
            focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600
            disabled:bg-surface-toolbar disabled:cursor-not-allowed
            ${error ? 'border-error focus:ring-error' : 'border-border-default'}
            ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-error">{error}</p>}
        {helperText && !error && <p className="text-sm text-text-muted">{helperText}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
