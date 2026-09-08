'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/theme-context';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showLabel = false,
}) => {
  const { actualTheme, toggleTheme } = useTheme();
  const isDark = actualTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center gap-1.5 min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl transition-all duration-200 border cursor-pointer ${
        isDark
          ? 'bg-[#181f2c] border-[#293549] text-amber-400 hover:bg-[#20293a] hover:border-amber-500/40'
          : 'bg-white border-slate-200 text-amber-500 hover:bg-slate-50 hover:border-amber-500/50 shadow-xs'
      } ${className}`}
      title={isDark ? 'تغییر به تم روشن (حالت روز)' : 'تغییر به تم تاریک (حالت شب)'}
      aria-label="تغییر تم برنامه"
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        {isDark ? (
          <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-300 hover:-rotate-12" />
        )}
      </div>

      {showLabel && (
        <span className="text-xs font-medium font-sans">
          {isDark ? 'حالت روز' : 'حالت شب'}
        </span>
      )}
    </button>
  );
};
