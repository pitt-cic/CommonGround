import { Check } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const STEPS = ['Upload', 'Customize', 'Generate', 'Results'];

interface Props {
  currentStep: number;
}

export default function StepIndicator({ currentStep }: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="flex items-center justify-center w-full mb-8">
      {STEPS.map((label, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300
                  ${isCompleted ? (isLight ? 'bg-amber-500 text-black' : 'bg-amber-400 text-black') : ''}
                  ${isActive ? (isLight ? 'bg-amber-500 text-black ring-4 ring-amber-500/20' : 'bg-amber-400 text-black ring-4 ring-amber-400/20') : ''}
                  ${!isCompleted && !isActive ? (isLight ? 'bg-zinc-200 text-zinc-500 border border-zinc-300' : 'bg-zinc-800 text-white border border-white') : ''}
                `}
              >
                {isCompleted ? <Check size={14} strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className={`text-xs ${
                  isActive ? (isLight ? 'text-amber-600 font-medium' : 'text-amber-400 font-medium') : isCompleted ? (isLight ? 'text-zinc-600' : 'text-zinc-400') : (isLight ? 'text-zinc-400' : 'text-zinc-600')
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 w-20 md:w-40 lg:w-60 mx-2 mb-5 transition-all duration-300 ${
                  i < currentStep ? (isLight ? 'bg-amber-500' : 'bg-amber-400') : (isLight ? 'bg-zinc-300' : 'bg-zinc-600')
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
