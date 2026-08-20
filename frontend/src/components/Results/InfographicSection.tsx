import { Loader2, AlertCircle, LayoutGrid, Download, Send, Edit3 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTheme } from '../../hooks/useTheme';
import { INFOGRAPHIC_TEMPLATES } from '../Steps/CustomizeStep';

export const INFOGRAPHIC_THEMES = [
  { id: 'academic', name: 'Academic', color: '#1D6F63' },
  { id: 'pitt',     name: 'Pitt',     color: '#1E3A8A' },
  { id: 'crimson',  name: 'Crimson',  color: '#991B1B' },
  { id: 'slate',    name: 'Slate',    color: '#1E293B' },
  { id: 'amber',    name: 'Amber',    color: '#D97706' },
];

interface InfographicSectionProps {
  infographicSvg: string | null;
  selectedTemplate: string | null;
  generatedTemplate: string | null;
  isGenerating: boolean;
  isPolishing: boolean;
  polishPrompt: string;
  polishError: string | null;
  infographicError: string | null;
  notApplicableReason: string | null;
  jobId: string | null;
  selectedTheme: string;
  onTemplateSelect: (templateId: string) => void;
  onThemeSelect: (themeId: string) => void;
  onGenerate: (templateId: string) => void;
  onPolishPromptChange: (prompt: string) => void;
  onPolish: () => void;
  onPolishKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onDownload: () => void;
  onViewExamples: () => void;
  onEdit: () => void;
}

export default function InfographicSection({
  infographicSvg,
  selectedTemplate,
  generatedTemplate,
  isGenerating,
  isPolishing,
  polishPrompt,
  polishError,
  infographicError,
  notApplicableReason,
  selectedTheme,
  onTemplateSelect,
  onThemeSelect,
  onGenerate,
  onPolishPromptChange,
  onPolish,
  onPolishKeyDown,
  onDownload,
  onViewExamples,
  onEdit,
}: InfographicSectionProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Show side-by-side layout when infographic exists or is generating
  const showSideBySide = infographicSvg || isGenerating;

  return (
    <div className={`rounded-xl p-6 sm:p-8 border-2 ${isLight ? 'bg-zinc-100 border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <LayoutGrid size={20} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
          <h3 className={`text-xl font-semibold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>Infographic</h3>
          {generatedTemplate && (
            <span className={`text-sm ${isLight ? 'text-black/60' : 'text-zinc-400'}`}>
              ({INFOGRAPHIC_TEMPLATES.find(t => t.id === generatedTemplate)?.name})
            </span>
          )}
        </div>
        {infographicSvg && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
            >
              <Edit3 size={12} />
              Edit
            </button>
            <button
              onClick={onDownload}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
            >
              <Download size={12} />
              Download
            </button>
          </div>
        )}
      </div>

      <div className={`border-t mb-6 ${isLight ? 'border-zinc-400' : 'border-zinc-700'}`} />

      {showSideBySide ? (
        /* Side-by-side layout when infographic exists */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_500px] gap-6 items-stretch">
          {/* Left: Infographic display */}
          <div>
            {isGenerating ? (
              <div className={`flex flex-col items-center justify-center h-full min-h-64 rounded-xl border ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
                <Loader2 size={32} className={`animate-spin mb-3 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                <p className={`text-sm ${isLight ? 'text-black' : 'text-zinc-300'}`}>Generating infographic...</p>
              </div>
            ) : (
              <div className="relative">
                <div
                  className={`bg-white rounded-xl p-4 overflow-hidden flex items-center justify-center [&>svg]:max-h-148 [&>svg]:w-auto transition-opacity duration-200 ${isPolishing ? 'opacity-40' : ''}`}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(infographicSvg ?? '', { USE_PROFILES: { svg: true, svgFilters: true } }) }}
                />
                {isPolishing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                    <Loader2 size={32} className={`animate-spin ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Controls */}
          <div className="space-y-4">
            {/* Polish section - only show when infographic exists */}
            {infographicSvg && (
              <div className={`rounded-xl px-4 py-4 space-y-3 border ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
                <p className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-zinc-100'}`}>Polish infographic</p>
                <textarea
                  value={polishPrompt}
                  onChange={(e) => onPolishPromptChange(e.target.value)}
                  onKeyDown={onPolishKeyDown}
                  placeholder="e.g., make it more statistic heavy"
                  disabled={isPolishing}
                  rows={2}
                  className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none ${isLight ? 'bg-zinc-50 border-zinc-400 text-zinc-800 focus:border-amber-500' : 'bg-zinc-700 border-zinc-600 text-zinc-100 focus:border-amber-400'}`}
                />
                {polishError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500 rounded-lg p-2">
                    <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-red-500 text-xs">{polishError}</p>
                  </div>
                )}
                <button
                  onClick={onPolish}
                  disabled={!polishPrompt.trim() || isPolishing}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm rounded-lg transition-colors cursor-pointer ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
                >
                  {isPolishing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Polishing...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Polish
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Template selector */}
            <div className={`rounded-xl px-4 py-4 space-y-3 border ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-zinc-100'}`}>
                  {infographicSvg ? 'Try different template' : 'Select template'}
                </p>
                <button
                  onClick={onViewExamples}
                  className={`text-xs underline transition-colors cursor-pointer ${isLight ? 'text-amber-600 hover:text-amber-700' : 'text-amber-400 hover:text-amber-300'}`}
                >
                  View examples
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {INFOGRAPHIC_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => onTemplateSelect(template.id)}
                    disabled={isGenerating}
                    className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer disabled:opacity-50 ${
                      selectedTemplate === template.id
                        ? (isLight ? 'bg-zinc-100 border-2 border-amber-500 text-zinc-700' : 'bg-zinc-700 border-2 border-amber-400 text-zinc-200')
                        : (isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600')
                    }`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => selectedTemplate && onGenerate(selectedTemplate)}
                disabled={!selectedTemplate || isGenerating || selectedTemplate === generatedTemplate}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm rounded-lg transition-all cursor-pointer border-2 ${isLight ? 'border-amber-500 bg-amber-500 hover:bg-amber-400 hover:border-amber-400 text-black shadow-md shadow-amber-500/20' : 'border-amber-400 bg-amber-400 hover:bg-amber-300 hover:border-amber-300 text-black shadow-md shadow-amber-400/20'}`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <LayoutGrid size={16} />
                    Generate
                  </>
                )}
              </button>
            </div>

            {/* Color theme picker */}
            <div className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <p className={`text-sm font-semibold whitespace-nowrap ${isLight ? 'text-black' : 'text-zinc-100'}`}>Color theme:</p>
              <div className="flex flex-1 justify-evenly">
                {INFOGRAPHIC_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onThemeSelect(t.id)}
                    title={t.name}
                    className="cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 transition-all ${selectedTheme === t.id ? 'border-amber-500 scale-110' : 'border-transparent hover:border-zinc-400'}`}
                      style={{ backgroundColor: t.color }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Side-by-side layout when no infographic yet */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_500px] gap-6">
          {/* Left: Placeholder or error states */}
          {notApplicableReason ? (
            <div className={`flex flex-col items-center justify-center py-24 rounded-xl border ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <AlertCircle size={32} className={`mb-3 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <p className={`text-sm text-center max-w-sm ${isLight ? 'text-black' : 'text-zinc-300'}`}>
                This template doesn't fit this paper: {notApplicableReason}
              </p>
              <p className={`text-xs mt-2 ${isLight ? 'text-black/60' : 'text-zinc-500'}`}>Try a different template</p>
            </div>
          ) : infographicError ? (
            <div className={`flex flex-col items-center justify-center py-24 rounded-xl border ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <AlertCircle size={32} className="text-red-500 mb-3" />
              <p className={`text-sm text-center max-w-sm ${isLight ? 'text-black' : 'text-zinc-300'}`}>{infographicError}</p>
            </div>
          ) : (
            <div className={`flex flex-col items-center justify-center py-24 rounded-xl border ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <LayoutGrid size={48} className={`mb-4 ${isLight ? 'text-black/50' : 'text-zinc-600'}`} />
              <p className={`text-sm ${isLight ? 'text-black' : 'text-zinc-400'}`}>Select a template and generate</p>
            </div>
          )}

          {/* Right: Template selector + theme picker */}
          <div className="space-y-4">
            <div className={`rounded-xl px-4 py-4 space-y-3 border ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-zinc-100'}`}>Select template</p>
                <button
                  onClick={onViewExamples}
                  className={`text-xs underline transition-colors cursor-pointer ${isLight ? 'text-amber-600 hover:text-amber-700' : 'text-amber-400 hover:text-amber-300'}`}
                >
                  View examples
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {INFOGRAPHIC_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => onTemplateSelect(template.id)}
                    disabled={isGenerating}
                    className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer disabled:opacity-50 ${
                      selectedTemplate === template.id
                        ? (isLight ? 'bg-zinc-100 border-2 border-amber-500 text-zinc-700' : 'bg-zinc-700 border-2 border-amber-400 text-zinc-200')
                        : (isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600')
                    }`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => selectedTemplate && onGenerate(selectedTemplate)}
                disabled={!selectedTemplate || isGenerating}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm rounded-lg transition-all cursor-pointer border-2 ${isLight ? 'border-amber-500 bg-amber-500 hover:bg-amber-400 hover:border-amber-400 text-black shadow-md shadow-amber-500/20' : 'border-amber-400 bg-amber-400 hover:bg-amber-300 hover:border-amber-300 text-black shadow-md shadow-amber-400/20'}`}
              >
                <LayoutGrid size={16} />
                Generate
              </button>
            </div>

            {/* Color theme picker */}
            <div className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${isLight ? 'bg-white border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
              <p className={`text-sm font-semibold whitespace-nowrap ${isLight ? 'text-black' : 'text-zinc-100'}`}>Color theme:</p>
              <div className="flex flex-1 justify-evenly">
                {INFOGRAPHIC_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onThemeSelect(t.id)}
                    title={t.name}
                    className="cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 transition-all ${selectedTheme === t.id ? 'border-amber-500 scale-110' : 'border-transparent hover:border-zinc-400'}`}
                      style={{ backgroundColor: t.color }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
