import { useRef } from 'react';
import { CheckCircle2, Copy, Check, Loader2, Share2, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../../hooks/useTheme';
import type { OutputTypeId } from '../Steps/CustomizeStep';
import { OUTPUT_TYPES } from '../Steps/CustomizeStep';

interface SummarySectionProps {
  content: string;
  outputType: OutputTypeId;
  audienceLabel: string;
  isEditMode: boolean;
  editedContent: string;
  isRefining: boolean;
  isSavingEdit: boolean;
  refineMessage: string;
  copied: boolean;
  shareLabel: string | null;
  onCopy: () => void;
  onShareX: () => void;
  onShareLinkedIn: () => void;
  onEditModeToggle: (enabled: boolean) => void;
  onEditedContentChange: (content: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRefineMessageChange: (message: string) => void;
  onRefine: () => void;
  onRefineKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  resultCardRef: React.RefObject<HTMLDivElement | null>;
}

export default function SummarySection({
  content,
  outputType,
  audienceLabel,
  isEditMode,
  editedContent,
  isRefining,
  isSavingEdit,
  refineMessage,
  copied,
  shareLabel,
  onCopy,
  onShareX,
  onShareLinkedIn,
  onEditModeToggle,
  onEditedContentChange,
  onSaveEdit,
  onCancelEdit,
  onRefineMessageChange,
  onRefine,
  onRefineKeyDown,
  resultCardRef,
}: SummarySectionProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const outputMeta = OUTPUT_TYPES.find((o) => o.id === outputType)!;

  return (
    <div ref={resultCardRef} className={`rounded-xl p-6 sm:p-8 border-2 ${isLight ? 'bg-zinc-100 border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
      <h2 className={`text-2xl font-semibold mb-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>Your result</h2>
      <p className={`text-sm mb-5 ${isLight ? 'text-black' : 'text-zinc-300'}`}>Copy and share your generated content.</p>

      {/* Status bar */}
      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 mb-4 border ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-700'}`}>
        <CheckCircle2 size={16} className={`shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
        <span className={`text-sm ${isLight ? 'text-black' : 'text-zinc-300'}`}>
          Generated <span className={isLight ? 'text-black' : 'text-zinc-100'}>{outputMeta.label}</span>
          <span className={isLight ? 'text-black/60' : 'text-zinc-400'}> · </span>
          <span className={isLight ? 'text-black' : 'text-zinc-100'}>{audienceLabel}</span>
        </span>
      </div>

      {/* Content header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <outputMeta.icon size={15} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
          <span className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-zinc-100'}`}>{outputMeta.label}</span>
          {isEditMode && (
            <span className={`text-xs px-2 py-0.5 rounded border ${isLight ? 'bg-amber-500/20 border-amber-500 text-amber-600' : 'bg-amber-400/20 border-amber-400 text-amber-400'}`}>
              Editing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {shareLabel && (
            <span className={`text-xs max-w-40 text-right leading-tight ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{shareLabel}</span>
          )}

          {!isEditMode ? (
            <>
              {outputType === 'linkedin' && (
                <button
                  type="button"
                  onClick={onShareLinkedIn}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
                >
                  <Share2 size={12} />
                  Share to LinkedIn
                </button>
              )}
              {outputType === 'x' && (
                <button
                  type="button"
                  onClick={onShareX}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
                >
                  <Share2 size={12} />
                  Share to X
                </button>
              )}
              <button
                type="button"
                onClick={onCopy}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                  copied
                    ? (isLight ? 'border-amber-500 text-amber-600 bg-amber-500/10' : 'border-amber-400 text-amber-400 bg-amber-400/10')
                    : (isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200')
                }`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => onEditModeToggle(true)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
              >
                <Edit3 size={12} />
                Edit
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={isSavingEdit}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${isLight ? 'border-black text-black hover:border-zinc-400 hover:text-zinc-700' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={isSavingEdit || !editedContent.trim()}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${isLight ? 'border-amber-500 bg-amber-500 text-black hover:bg-amber-400' : 'border-amber-400 bg-amber-400 text-black hover:bg-amber-300'}`}
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    Save
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content body */}
      <div
        ref={contentScrollRef}
        className={`max-h-125 overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-none border rounded-xl p-4 relative transition-opacity duration-200 ${isRefining ? 'opacity-30' : 'opacity-100'} ${isLight ? 'border-zinc-400 bg-white' : 'border-zinc-700 bg-zinc-800'}`}
      >
        {isRefining && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 shadow-lg ${isLight ? 'bg-white border-amber-500 shadow-amber-500/10' : 'bg-zinc-900 border-amber-400 shadow-amber-400/10'}`}>
              <Loader2 size={18} className={`animate-spin shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <span className={`text-base font-semibold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>Refining...</span>
            </div>
          </div>
        )}

        {isEditMode ? (
          <textarea
            value={editedContent}
            onChange={(e) => onEditedContentChange(e.target.value)}
            disabled={isSavingEdit}
            className={`w-full min-h-96 bg-transparent border-none text-sm leading-relaxed focus:outline-none resize-none ${isLight ? 'text-zinc-800 placeholder-zinc-400' : 'text-white placeholder-zinc-500'}`}
            placeholder="Edit your content here..."
          />
        ) : (
          <div className={`markdown-content text-sm leading-relaxed ${isLight ? 'text-black' : 'text-white'}`}>
            <ReactMarkdown>{content.replace(/^•\s*\n+(\S)/gm, '- $1')}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Hint for press release */}
      {outputType === 'press_release' && (
        <p className={`text-sm mt-4 italic ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
          Remember to fill in your media contact information before distributing.
        </p>
      )}

      {/* Refine section */}
      <div className={`mt-6 pt-6 border-t ${isLight ? 'border-zinc-400' : 'border-zinc-700'}`}>
        <p className={`text-sm font-semibold mb-3 ${isLight ? 'text-black' : 'text-zinc-100'}`}>Refine this output</p>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={refineMessage}
            onChange={(e) => onRefineMessageChange(e.target.value)}
            onKeyDown={onRefineKeyDown}
            placeholder="e.g., make it shorter, add a statistic..."
            disabled={isRefining}
            className={`flex-1 px-3 py-2.5 border rounded-lg text-sm placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${isLight ? 'bg-white border-zinc-400 text-zinc-800 focus:border-amber-500' : 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-amber-400'}`}
          />
          <button
            type="button"
            onClick={onRefine}
            disabled={!refineMessage.trim() || isRefining}
            className={`px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
          >
            {isRefining ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Refining...
              </>
            ) : (
              'Refine'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
