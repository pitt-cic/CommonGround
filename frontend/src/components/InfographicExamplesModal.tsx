import { X } from 'lucide-react';
import { INFOGRAPHIC_TEMPLATES } from './Steps/CustomizeStep';
import { useTheme } from '../hooks/useTheme';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfographicExamplesModal({ isOpen, onClose }: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className={`rounded-xl w-full max-w-4xl overflow-hidden border-2 ${isLight ? 'bg-white border-zinc-300' : 'bg-zinc-900 border-zinc-700'}`}>
        {/* Modal header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? 'border-zinc-200' : 'border-zinc-700'}`}>
          <h3 className={`text-xl font-semibold ${isLight ? 'text-amber-500' : 'text-amber-400'}`}>Infographic Templates</h3>
          <button
            onClick={onClose}
            className={`p-2 transition-colors cursor-pointer ${isLight ? 'text-zinc-500 hover:text-zinc-700' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <X size={20} />
          </button>
        </div>
        {/* Modal body */}
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            {INFOGRAPHIC_TEMPLATES.map((template) => (
              <div key={template.id} className="space-y-2">
                <p className={`text-sm font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-200'}`}>{template.name}</p>
                <div className="bg-white rounded-lg p-3">
                  <img
                    src={template.preview}
                    alt={`${template.name} preview`}
                    className="w-full h-auto"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
