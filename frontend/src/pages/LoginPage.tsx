import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    setValidationError(null);
    try {
      const result = await login(email, password);
      if (result.status === 'newPasswordRequired') {
        navigate('/force-change-password');
      }
    } catch {
      /* surfaced via context */
    }
  }

  const displayError = validationError ?? error;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 ${isLight ? 'bg-white' : 'bg-black'}`}>
      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className={`fixed top-4 right-4 p-2 rounded-lg border transition-colors cursor-pointer ${isLight ? 'border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
        title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {isLight ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="w-full max-w-2xl">
        <div className={`rounded-xl overflow-hidden border-3 ${isLight ? 'bg-zinc-100 border-zinc-400' : 'bg-zinc-900 border-zinc-600'}`}>

          {/* Header */}
          <div className={`px-8 pt-8 pb-6 border-b-2 text-center ${isLight ? 'border-zinc-300' : 'border-zinc-600'}`}>
            <h1 className={`text-3xl font-bold tracking-tight ${isLight ? 'text-amber-500' : 'text-amber-400'}`}>CommonGround</h1>
            <p className={`text-sm mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Turn research papers into plain-language summaries</p>
          </div>

          <div className="px-8 py-6">
            <h2 className={`text-[25px] font-semibold mb-6 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Sign in</h2>

            {/* Error */}
            {displayError && (
              <div className={`mb-4 px-3 py-2.5 rounded-lg border ${isLight ? 'bg-red-100 border-red-300' : 'bg-red-950 border-red-800'}`}>
                <p className="text-sm text-red-500">{displayError}</p>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="example@gmail.com"
                  required
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                />
              </div>

              <div>
                <label htmlFor="password" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-semibold text-sm transition-colors flex items-center justify-center gap-2 mt-8 ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </>
                ) : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
