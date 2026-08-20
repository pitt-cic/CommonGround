import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface User {
  name: string;
  email: string;
  initials: string;
}

interface NavbarProps {
  user?: User;
  onLogin?: () => void;
  onLogout?: () => void;
}

export default function Navbar({ user, onLogin, onLogout }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <header className={`w-full border-b-2 fixed top-0 left-0 right-0 z-40 ${isLight ? 'border-zinc-300 bg-white' : 'border-zinc-600 bg-black'}`}>
      <div className="w-full mx-auto px-4 sm:px-12 py-4 flex items-center justify-between">
        {/* Title */}
        <span className={`font-bold text-xl tracking-tight ${isLight ? 'text-amber-500' : 'text-amber-400'}`}>CommonGround</span>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${isLight ? 'border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
            title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {isLight ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {user ? (
            <div className="relative" ref={dropdownRef} >
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={`flex items-center gap-2 transition-colors cursor-pointer ${isLight ? 'text-zinc-700 hover:text-zinc-900' : 'text-zinc-300 hover:text-zinc-100'}`}
              >
                <span className="text-[15px] leading-none mr-1">{user.name}</span>
                <span className={`h-10 w-10 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 ${isLight ? 'bg-amber-500 text-black' : 'bg-amber-400 text-black'}`}>
                  {user.initials}
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-150 ${isLight ? 'text-amber-600' : 'text-amber-400'} ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {dropdownOpen && (
                <div className={`absolute right-0 top-full mt-2 w-48 rounded-lg border shadow-xl overflow-hidden z-50 ${isLight ? 'bg-white border-zinc-300' : 'bg-zinc-900 border-zinc-700'}`}>
                  <div className={`px-4 py-2.5 border-b ${isLight ? 'border-zinc-200' : 'border-zinc-600'}`}>
                    <p className={`text-[12px] truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{user.email}</p>
                  </div>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-sm text-red-500 transition-colors ${isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-800'}`}
                    onClick={() => {
                      setDropdownOpen(false);
                      onLogout?.();
                    }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-colors cursor-pointer ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
            >
              Log in
            </button>
          )}
        </div>
      </div>

    </header>
  );
}
