import { useState } from 'react';
import { Link2, AlignLeft, Newspaper, Share2, FileText, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import InfographicExamplesModal from '../InfographicExamplesModal';
import { useTheme } from '../../hooks/useTheme';

export const READING_LEVELS = ['General public', 'Clinicians', 'Academic health researchers'] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

export const OUTPUT_TYPES = [
  { id: 'summary', label: 'Summary', icon: AlignLeft },
  { id: 'press_release', label: 'Press release', icon: FileText },
  { id: 'linkedin', label: 'LinkedIn post', icon: Link2 },
  { id: 'blog', label: 'Blog post', icon: Newspaper },
  { id: 'x', label: 'X / Twitter post', icon: Share2 },
] as const;
export type OutputTypeId = (typeof OUTPUT_TYPES)[number]['id'];

export const MODEL = { id: 'sonnet', label: 'Sonnet', apiId: 'sonnet-4-6' } as const;
export type ModelId = 'sonnet';

export type CustomAudience = string;

export const INFOGRAPHIC_TEMPLATES = [
  { id: 'stat_grid', name: 'Stat Grid', preview: '/templates/stat_grid.svg' },
  { id: 'method_steps', name: 'Method Steps', preview: '/templates/method_steps.svg' },
  { id: 'key_findings', name: 'Key Findings', preview: '/templates/key_findings.svg' },
  { id: 'pull_quote', name: 'Pull Quote', preview: '/templates/pull_quote.svg' },
  { id: 'comparison', name: 'Comparison', preview: '/templates/comparison.svg' },
] as const;
export type InfographicTemplateId = (typeof INFOGRAPHIC_TEMPLATES)[number]['id'] | null;

interface Props {
  readingLevel: number;
  outputType: OutputTypeId | null;
  onReadingLevelChange: (level: number) => void;
  onOutputTypeChange: (type: OutputTypeId) => void;
  file: File | null;
  s3Key: string | null;
  useCustomAudience?: boolean;
  customAudience?: CustomAudience;
  onUseCustomAudienceChange?: (useCustom: boolean) => void;
  onCustomAudienceChange?: (audience: CustomAudience) => void;
  filePageCount?: number | null;
  fileSize?: number | null;
  infographicTemplate?: InfographicTemplateId;
  onInfographicTemplateChange?: (template: InfographicTemplateId) => void;
}

export default function CustomizeStep({
  readingLevel,
  outputType,
  onReadingLevelChange,
  onOutputTypeChange,
  file,
  s3Key,
  useCustomAudience = false,
  customAudience = '',
  onUseCustomAudienceChange = () => {},
  onCustomAudienceChange = () => {},
  filePageCount,
  fileSize,
  infographicTemplate = null,
  onInfographicTemplateChange = () => {},
}: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [showInfographicExamples, setShowInfographicExamples] = useState(false);
  const trackPercent = (readingLevel / (READING_LEVELS.length - 1)) * 100;

  const handleViewExamples = () => {
    // Pass current state to examples page
    navigate('/examples', {
      state: {
        fileName: file?.name,
        s3Key,
        readingLevel,
        outputType,
        filePageCount,
        fileSize,
        useCustomAudience,
        customAudience,
        infographicTemplate,
      },
    });
  };

  const handleViewInfographicExamples = () => {
    setShowInfographicExamples(true);
  };

  return (
    <div className="space-y-8">
      {/* Audience section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <label className={`block font-medium ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Audience</label>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => onUseCustomAudienceChange(false)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                !useCustomAudience
                  ? (isLight ? 'bg-amber-500 text-black font-medium' : 'bg-amber-400 text-black font-medium')
                  : (isLight ? 'bg-zinc-200 text-zinc-600 hover:text-zinc-800' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')
              }`}
            >
              Reading level
            </button>
            <button
              type="button"
              onClick={() => onUseCustomAudienceChange(true)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                useCustomAudience
                  ? (isLight ? 'bg-amber-500 text-black font-medium' : 'bg-amber-400 text-black font-medium')
                  : (isLight ? 'bg-zinc-200 text-zinc-600 hover:text-zinc-800' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')
              }`}
            >
              Custom audience
            </button>
          </div>
        </div>

        {!useCustomAudience ? (
          <div className="px-1">
            <div className="relative">
              <div
                className={`absolute top-1/2 left-0 h-1 rounded-full pointer-events-none ${isLight ? 'bg-amber-500' : 'bg-amber-400'}`}
                style={{ width: `${trackPercent}%`, transform: 'translateY(-50%)' }}
              />
              <input
                type="range"
                min={0}
                max={READING_LEVELS.length - 1}
                step={1}
                value={readingLevel}
                onChange={(e) => onReadingLevelChange(Number(e.target.value))}
                className="w-full relative z-10"
              />
            </div>
            <div className="flex justify-between mt-2">
              {READING_LEVELS.map((label, i) => (
                <span
                  key={i}
                  className={`text-xs ${i === readingLevel ? (isLight ? 'text-amber-600 font-medium' : 'text-amber-400 font-medium') : (isLight ? 'text-zinc-500' : 'text-zinc-400')}`}
                  style={{ width: '15%', textAlign: i === 0 ? 'left' : i === READING_LEVELS.length - 1 ? 'right' : 'center' }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className={`p-5 rounded-xl border ${isLight ? 'bg-white border-zinc-300' : 'bg-zinc-900 border-zinc-800'}`}>
            <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              Describe the audience to tailor the content
            </label>
            <textarea
              placeholder="e.g., Middle-aged truck driver, or young professional interested in fitness and wellness"
              value={customAudience}
              onChange={(e) => onCustomAudienceChange(e.target.value)}
              rows={4}
              className={`w-full px-4 py-3 border rounded-lg placeholder-zinc-500 focus:outline-none transition-colors resize-none ${isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
            />
            <p className={`text-xs mt-2 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
              Include details like age, gender, interests, occupation, hobbies, communication style, or anything else that helps tailor the vocabulary, metaphors, and tone
            </p>
          </div>
        )}
      </div>

      {/* Output type */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className={`block font-medium ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Output type</label>
          <button
            type="button"
            onClick={handleViewExamples}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${isLight ? 'border-zinc-300 text-zinc-500 hover:border-amber-500 hover:text-amber-600' : 'border-zinc-700 text-zinc-400 hover:border-amber-400 hover:text-amber-400'}`}
          >
            View examples
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OUTPUT_TYPES.map(({ id, label, icon: Icon }) => {
            const selected = outputType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onOutputTypeChange(id)}
                className={`
                  flex items-center gap-3 p-4 rounded-xl border-3 text-left transition-all duration-150
                  ${selected
                    ? (isLight ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-amber-400 bg-amber-400/10 text-amber-400')
                    : (isLight ? 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-800' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100')
                  }
                `}
              >
                <Icon size={18} className={selected ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-zinc-500' : 'text-zinc-400')} />
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Infographic template (optional) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <LayoutGrid size={18} className={isLight ? 'text-zinc-500' : 'text-zinc-400'} />
            <label className={`block font-medium ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Infographic</label>
            <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>(optional)</span>
          </div>
          <button
            type="button"
            onClick={handleViewInfographicExamples}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${isLight ? 'border-zinc-300 text-zinc-500 hover:border-amber-500 hover:text-amber-600' : 'border-zinc-700 text-zinc-400 hover:border-amber-400 hover:text-amber-400'}`}
          >
            View examples
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onInfographicTemplateChange(null)}
            className={`
              flex items-center justify-center p-3 rounded-xl border-2 text-center transition-all duration-150
              ${infographicTemplate === null
                ? (isLight ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-amber-400 bg-amber-400/10 text-amber-400')
                : (isLight ? 'border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300')
              }
            `}
          >
            <span className="text-sm font-medium">None</span>
          </button>
          {INFOGRAPHIC_TEMPLATES.map(({ id, name }) => {
            const selected = infographicTemplate === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onInfographicTemplateChange(id)}
                className={`
                  flex items-center justify-center p-3 rounded-xl border-2 text-center transition-all duration-150
                  ${selected
                    ? (isLight ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-amber-400 bg-amber-400/10 text-amber-400')
                    : (isLight ? 'border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300')
                  }
                `}
              >
                <span className="text-sm font-medium">{name}</span>
              </button>
            );
          })}
        </div>
        <p className={`text-xs mt-2 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
          Select an infographic template to generate alongside your summary
        </p>
      </div>

      {/* Infographic Examples Modal */}
      <InfographicExamplesModal isOpen={showInfographicExamples} onClose={() => setShowInfographicExamples(false)} />
    </div>
  );
}
