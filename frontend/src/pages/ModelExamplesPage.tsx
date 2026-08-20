import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { READING_LEVELS, OUTPUT_TYPES } from '../components/Steps/CustomizeStep';
import type { OutputTypeId } from '../components/Steps/CustomizeStep';
import EXAMPLES_DATA from '../data/examples.json';
import { useTheme } from '../hooks/useTheme';

const EXAMPLE_PAPER = {
  title: 'Cardiovascular post-acute sequelae of SARS- CoV-2 in children and adolescents: cohort study using electronic health records',
  abstract: 'Study examining higher risk of numerous cardiovascular problems in children after COVID-19 infection.',
};

interface ExampleData {
  text: string;
  input_tokens?: number;
  output_tokens?: number;
  cost: number;
}

type ReadingLevelKey = 'general_public' | 'clinicians' | 'academic_health_researchers';
type OutputTypeKey = 'summary' | 'press_release' | 'linkedin_post' | 'blog_post' | 'x_post';

const BASE_MODEL = 'sonnet';

export default function ModelExamplesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const stateFromLocation = (location.state as any) || {};

  // Initialize from location state or defaults
  const [readingLevelIndex, setReadingLevelIndex] = useState<number>(
    stateFromLocation.readingLevel ?? 0
  );
  const [outputType, setOutputType] = useState<OutputTypeId>(
    stateFromLocation.outputType ?? 'summary'
  );

  const readingLevel = READING_LEVELS[readingLevelIndex];
  const trackPercent = (readingLevelIndex / (READING_LEVELS.length - 1)) * 100;

  const handleBack = () => {
    navigate('/', { state: { ...stateFromLocation, returnFromExamples: true } });
  };

  const getExampleData = (): ExampleData => {
    // Map frontend names to backend keys
    const levelKey = readingLevel.toLowerCase().replace(/ /g, '_') as ReadingLevelKey;

    // Map frontend output type IDs to JSON keys
    const outputTypeMap: Record<OutputTypeId, OutputTypeKey> = {
      'summary': 'summary',
      'press_release': 'press_release',
      'linkedin': 'linkedin_post',
      'blog': 'blog_post',
      'x': 'x_post'
    };
    const typeKey = outputTypeMap[outputType];

    try {
      const data = (EXAMPLES_DATA as any)[levelKey]?.[typeKey]?.[BASE_MODEL];

      if (data && typeof data === 'object') {
        return {
          text: data.text || 'Example not yet generated',
          input_tokens: data.input_tokens,
          output_tokens: data.output_tokens,
          cost: data.cost || 0
        };
      }
    } catch (e) {
      console.error('Error loading example:', e);
    }

    return {
      text: 'Example not yet generated',
      cost: 0
    };
  };

  return (
    <div className={`min-h-screen ${isLight ? 'bg-white' : 'bg-black'}`}>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className={`flex items-center gap-2 transition-colors mb-4 ${isLight ? 'text-zinc-500 hover:text-amber-600' : 'text-zinc-400 hover:text-amber-400'}`}
          >
            <ChevronLeft size={18} />
            <span className="text-sm font-medium">Back to customize</span>
          </button>

          <h1 className={`text-3xl font-bold mb-2 ${isLight ? 'text-amber-500' : 'text-amber-400'}`}>Output Comparison</h1>
          <p className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Compare output examples across our different formats using an example research paper
          </p>
        </div>

        {/* Example paper info */}
        <div className={`rounded-lg p-4 mb-6 border-2 ${isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-700'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className={`font-semibold text-sm mb-1 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Example Paper</h3>
              <p className={`text-sm mb-1 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{EXAMPLE_PAPER.title}</p>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>{EXAMPLE_PAPER.abstract}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className={`rounded-lg p-6 mb-6 space-y-6 border-2 ${isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-700'}`}>
          {/* Reading level slider */}
          <div>
            <label className={`block font-medium mb-4 text-sm ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Reading level</label>
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
                  value={readingLevelIndex}
                  onChange={(e) => setReadingLevelIndex(Number(e.target.value))}
                  className="w-full relative z-10"
                />
              </div>
              <div className="flex justify-between mt-2">
                {READING_LEVELS.map((label, i) => (
                  <span
                    key={i}
                    className={`text-xs ${i === readingLevelIndex ? (isLight ? 'text-amber-600 font-medium' : 'text-amber-400 font-medium') : (isLight ? 'text-zinc-500' : 'text-zinc-400')}`}
                    style={{ width: '15%', textAlign: i === 0 ? 'left' : i === READING_LEVELS.length - 1 ? 'right' : 'center' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Output type buttons */}
          <div>
            <label className={`block font-medium mb-4 text-sm ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Output type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {OUTPUT_TYPES.map(({ id, label, icon: Icon }) => {
                const selected = outputType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOutputType(id)}
                    className={`
                      flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all duration-150
                      ${selected
                        ? (isLight ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-amber-400 bg-amber-400/10 text-amber-400')
                        : (isLight ? 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-800' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100')
                      }
                    `}
                  >
                    <Icon size={16} className={selected ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-zinc-500' : 'text-zinc-400')} />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Example output */}
        {(() => {
          const exampleData = getExampleData();
          return (
            <div className={`rounded-xl p-6 border-2 ${isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-700'}`}>
              <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isLight ? 'prose-zinc' : 'prose-invert'}`}>
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className={`text-xl font-bold mb-3 mt-4 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{children}</h1>,
                    h2: ({ children }) => <h2 className={`text-lg font-semibold mb-2 mt-3 ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{children}</h2>,
                    h3: ({ children }) => <h3 className={`text-base font-semibold mb-2 mt-2 ${isLight ? 'text-zinc-700' : 'text-zinc-200'}`}>{children}</h3>,
                    p: ({ children }) => <p className={`mb-3 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{children}</p>,
                    strong: ({ children }) => <strong className={`font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{children}</strong>,
                    em: ({ children }) => <em className={`italic ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{children}</em>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className={isLight ? 'text-zinc-600' : 'text-zinc-300'}>{children}</li>,
                  }}
                >
                  {exampleData.text}
                </ReactMarkdown>
              </div>
            </div>
          );
        })()}

        {/* Footer note */}
        <div className="mt-8 text-center">
          <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Note: These are example outputs. Actual results will vary based on your uploaded paper and settings.
          </p>
        </div>
      </div>
    </div>
  );
}