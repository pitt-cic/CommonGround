import { FileText, Sparkles, Loader2, LayoutGrid } from 'lucide-react';
import { READING_LEVELS, OUTPUT_TYPES, INFOGRAPHIC_TEMPLATES, type OutputTypeId, type CustomAudience, type InfographicTemplateId } from './CustomizeStep';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  file: File;
  readingLevel: number;
  outputType: OutputTypeId;
  isGenerating: boolean;
  onGenerate: () => void;
  useCustomAudience?: boolean;
  customAudience?: CustomAudience;
  infographicTemplate?: InfographicTemplateId;
}

export default function GenerateStep({
  file,
  readingLevel,
  outputType,
  isGenerating,
  onGenerate,
  useCustomAudience = false,
  customAudience = '',
  infographicTemplate = null,
}: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const levelLabel = READING_LEVELS[readingLevel];
  const outputLabel = OUTPUT_TYPES.find((o) => o.id === outputType)?.label ?? outputType;
  const infographicLabel = infographicTemplate
    ? INFOGRAPHIC_TEMPLATES.find((t) => t.id === infographicTemplate)?.name
    : 'None';

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className={`rounded-xl p-5 space-y-3 border-3 ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-900 border-zinc-700'}`}>
        <h3 className={`text-xs uppercase tracking-wider font-medium ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Your settings</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-6">
            <span className={`text-sm w-28 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>File</span>
            <div className="flex items-center gap-2">
              <FileText size={14} className={`shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <span className={`text-sm truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{file.name}</span>
            </div>
          </div>
          {!useCustomAudience ? (
            <div className="flex items-center gap-6">
              <span className={`text-sm w-28 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Reading level</span>
              <span className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{levelLabel}</span>
            </div>
          ) : (
            <div className="flex items-start gap-6">
              <span className={`text-sm w-28 shrink-0 pt-0.5 whitespace-nowrap ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Custom audience</span>
              <span className={`text-sm flex-1 leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {customAudience || 'Not specified'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-6">
            <span className={`text-sm w-28 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Output type</span>
            <span className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{outputLabel}</span>
          </div>
          <div className="flex items-center gap-6">
            <span className={`text-sm w-28 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Infographic</span>
            <div className="flex items-center gap-2">
              {infographicTemplate && <LayoutGrid size={14} className={`shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />}
              <span className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{infographicLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed font-semibold text-base transition-colors duration-150 ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
      >
        {isGenerating ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Generate {outputLabel}
          </>
        )}
      </button>
    </div>
  );
}
