import { type FormEvent, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';

export default function ForceChangePasswordPage() {
  const { completeNewPasswordChallenge, isLoading, error, clearError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const passwordRequirements = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
    { label: 'One number', test: (p: string) => /\d/.test(p) },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setValidationError('First name and last name are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    const allRequirementsMet = passwordRequirements.every((req) => req.test(newPassword));
    if (!allRequirementsMet) {
      setValidationError('Password does not meet all requirements');
      return;
    }

    try {
      await completeNewPasswordChallenge(newPassword, {
        givenName: firstName.trim(),
        familyName: lastName.trim(),
      });
      window.location.href = '/';
    } catch {
      // Error is handled by the auth context
    }
  };

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
            <h2 className={`text-[25px] font-semibold mb-2 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Complete your profile</h2>
            <p className={`text-sm mb-6 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Please provide your details and create a new password
            </p>

            {/* Error */}
            {displayError && (
              <div className={`mb-4 px-3 py-2.5 rounded-lg border ${isLight ? 'bg-red-100 border-red-300' : 'bg-red-950 border-red-800'}`}>
                <p className="text-sm text-red-500">{displayError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    autoComplete="given-name"
                    required
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    autoComplete="family-name"
                    required
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="newPassword" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  required
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className={`block text-xs mb-1.5 font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${isLight ? 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                />
              </div>

              <div className={`rounded-lg p-4 border ${isLight ? 'bg-zinc-200 border-zinc-300' : 'bg-zinc-800 border-zinc-700'}`}>
                <p className={`text-sm font-medium mb-2 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>Password requirements:</p>
                <ul className="space-y-1">
                  {passwordRequirements.map((req) => {
                    const met = req.test(newPassword);
                    return (
                      <li
                        key={req.label}
                        className={`text-sm flex items-center ${
                          met ? 'text-green-500' : (isLight ? 'text-zinc-500' : 'text-zinc-500')
                        }`}
                      >
                        {met ? (
                          <svg
                            className="w-4 h-4 mr-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4 mr-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                          >
                            <circle cx="10" cy="10" r="3" />
                          </svg>
                        )}
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-semibold text-sm transition-colors flex items-center justify-center gap-2 mt-4 ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Setting up...
                  </>
                ) : 'Complete setup'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
