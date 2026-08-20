import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { READING_LEVELS, OUTPUT_TYPES, type OutputTypeId, type CustomAudience, type InfographicTemplateId } from './CustomizeStep';
import { checkJobStatus, refineOutput, saveEditedOutput, generateInfographic, polishInfographic, getInfographicContent, type CostEntry, type VerificationFailure, type SummaryCitation } from '../../services/api';

const INFOGRAPHIC_THEME_COLORS: Record<string, Record<string, string>> = {
  pitt:    { '#1D6F63': '#1E3A8A', '#F7F5F0': '#EEF2FF' },
  crimson: { '#1D6F63': '#991B1B', '#F7F5F0': '#FFF0F0' },
  slate:   { '#1D6F63': '#1E293B', '#F7F5F0': '#F1F5F9' },
  amber:   { '#1D6F63': '#D97706', '#F7F5F0': '#FFFBEB' },
};

function applyInfographicTheme(svg: string, themeId: string): string {
  const colors = INFOGRAPHIC_THEME_COLORS[themeId];
  if (!colors) return svg;
  let result = svg;
  for (const [from, to] of Object.entries(colors)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`((?:fill|stroke|stop-color|flood-color|lighting-color)=")${escaped}"`, 'g'),
      `$1${to}"`
    );
  }
  return result;
}
import { useTheme } from '../../hooks/useTheme';
import InfographicExamplesModal from '../InfographicExamplesModal';
import InfographicEditModal from '../InfographicEditModal';
import { SummarySection, InfographicSection, ResourcesHistoryCard, ReferencesSection } from '../Results';

interface Props {
  readingLevel: number;
  outputType: OutputTypeId;
  jobId: string | null;
  onError?: (error: string) => void;
  onComplete?: () => void;
  useCustomAudience?: boolean;
  customAudience?: CustomAudience;
  infographicTemplate?: InfographicTemplateId;
}

function safeCostEntries(raw: unknown): CostEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is CostEntry =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as CostEntry).cost === 'number' &&
      typeof (e as CostEntry).type === 'string',
  );
}

const LOADING_TIPS = [
  'This may take up to a minute or two',
  'Tip: You can refine the output after generation with custom instructions',
  'Remember: AI-generated content should be verified against the source',
  'Tip: Use the Edit button to make quick changes to the output',
  'Share directly to LinkedIn or X with one click',
  'Tip: Add an infographic to make your content more engaging',
  'The output is tailored to your selected audience level',
];

export default function ResultsStep({
  readingLevel,
  outputType,
  jobId,
  onError,
  useCustomAudience = false,
  customAudience: _customAudience = '',
  infographicTemplate,
}: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Summary state
  const [copied, setCopied] = useState(false);
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [content, setContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [refineMessage, setRefineMessage] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Cost state
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [totalCost, setTotalCost] = useState<number | null>(null);

  // Infographic state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(infographicTemplate ?? null);
  const [selectedInfographicTheme, setSelectedInfographicTheme] = useState('academic');
  const [generatedTemplate, setGeneratedTemplate] = useState<string | null>(null);
  const [infographicSvg, setInfographicSvg] = useState<string | null>(null);
  const [isGeneratingInfographic, setIsGeneratingInfographic] = useState(false);
  const [infographicError, setInfographicError] = useState<string | null>(null);
  const [notApplicableReason, setNotApplicableReason] = useState<string | null>(null);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [polishPrompt, setPolishPrompt] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // References state
  const [infographicContent, setInfographicContent] = useState<Record<string, unknown> | null>(null);
  const [verificationFailures, setVerificationFailures] = useState<VerificationFailure[]>([]);
  const [summaryCitations, setSummaryCitations] = useState<SummaryCitation[]>([]);

  // UI state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);

  const resultCardRef = useRef<HTMLDivElement>(null);

  const themedSvg = infographicSvg ? applyInfographicTheme(infographicSvg, selectedInfographicTheme) : null;

  // Build audience label
  const audienceLabel = useCustomAudience
    ? `Custom: ${_customAudience || 'Custom audience'}`
    : READING_LEVELS[readingLevel];

  const outputMeta = OUTPUT_TYPES.find((o) => o.id === outputType)!;

  // Cycle through loading tips
  useEffect(() => {
    if (status !== 'processing') return;
    const interval = setInterval(() => {
      setLoadingTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [status]);

  // Poll for summary status
  useEffect(() => {
    if (!jobId) {
      setStatus('failed');
      setErrorMessage('No job ID provided');
      return;
    }

    let pollInterval: number | undefined;
    let pollCount = 0;
    const MAX_POLLS = 150;

    async function pollJobStatus() {
      if (!jobId) return;
      try {
        const response = await checkJobStatus(jobId);

        if (response.job_status === 'completed') {
          setStatus('completed');
          setContent(response.current_output || response.summary || '');
          setCostEntries(safeCostEntries(response.cost_entries));
          if (typeof response.total_cost === 'number') setTotalCost(response.total_cost);
          if (response.summary_citations) setSummaryCitations(response.summary_citations);
          if (pollInterval) clearInterval(pollInterval);
          setShowWarningModal(true);
          setTimeout(() => {
            resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        } else if (response.job_status === 'failed') {
          setStatus('failed');
          setErrorMessage(response.job_error || 'Summarization failed');
          if (pollInterval) clearInterval(pollInterval);
          if (onError) onError(response.job_error || 'Summarization failed');
        } else {
          pollCount++;
          if (pollCount >= MAX_POLLS) {
            setStatus('failed');
            setErrorMessage('Request timed out. Please try again.');
            if (pollInterval) clearInterval(pollInterval);
            if (onError) onError('Request timed out');
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check job status';
        setStatus('failed');
        setErrorMessage(message);
        if (pollInterval) clearInterval(pollInterval);
        if (onError) onError(message);
      }
    }

    pollJobStatus();
    pollInterval = window.setInterval(pollJobStatus, 2000);
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [jobId, onError]);

  // Poll for infographic status (if template was selected)
  useEffect(() => {
    if (!jobId || !infographicTemplate) return;

    let pollInterval: number | undefined;
    let pollCount = 0;
    const MAX_POLLS = 150;

    setIsGeneratingInfographic(true);

    async function pollInfographicStatus() {
      if (!jobId || !infographicTemplate) return;
      try {
        const response = await checkJobStatus(jobId);
        const statusKey = `infographic_${infographicTemplate}_status` as const;
        const infographicStatusVal = response[statusKey];

        if (infographicStatusVal === 'completed') {
          const presignedUrl = response.infographic_urls?.[infographicTemplate];
          if (presignedUrl) {
            try {
              const svgResponse = await fetch(presignedUrl);
              if (svgResponse.ok) {
                const svgContent = await svgResponse.text();
                setInfographicSvg(svgContent);
                setGeneratedTemplate(infographicTemplate);
              } else {
                setInfographicError('Failed to fetch infographic');
              }
            } catch {
              setInfographicError('Failed to fetch infographic');
            }
          } else {
            setInfographicError('Infographic URL not available');
          }
          setIsGeneratingInfographic(false);
          setCostEntries(safeCostEntries(response.cost_entries));
          if (typeof response.total_cost === 'number') setTotalCost(response.total_cost);
          if (pollInterval) clearInterval(pollInterval);
        } else if (infographicStatusVal === 'failed') {
          setInfographicError('Infographic generation failed');
          setIsGeneratingInfographic(false);
          if (pollInterval) clearInterval(pollInterval);
        } else if (infographicStatusVal === 'not_applicable') {
          const reasonKey = `infographic_${infographicTemplate}_reason` as const;
          setNotApplicableReason((response[reasonKey] as string) || 'Template not applicable');
          setIsGeneratingInfographic(false);
          if (pollInterval) clearInterval(pollInterval);
        } else {
          pollCount++;
          if (pollCount >= MAX_POLLS) {
            setInfographicError('Infographic generation timed out');
            setIsGeneratingInfographic(false);
            if (pollInterval) clearInterval(pollInterval);
          }
        }
      } catch {
        pollCount++;
        if (pollCount >= MAX_POLLS) {
          setInfographicError('Infographic generation timed out');
          setIsGeneratingInfographic(false);
          if (pollInterval) clearInterval(pollInterval);
        }
      }
    }

    pollInfographicStatus();
    pollInterval = window.setInterval(pollInfographicStatus, 2000);
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [jobId, infographicTemplate]);

  // Fetch infographic content for references when infographic is generated
  useEffect(() => {
    if (!jobId || !generatedTemplate || !infographicSvg) return;

    async function fetchInfographicContent() {
      try {
        const response = await getInfographicContent(jobId!, generatedTemplate!);
        setInfographicContent(response.content);
        setVerificationFailures(response.verification_failures || []);
      } catch {
        // Non-fatal - references section just won't show
      }
    }

    fetchInfographicContent();
  }, [jobId, generatedTemplate, infographicSvg]);

  // Escape key handler for warning modal
  useEffect(() => {
    if (!showWarningModal) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowWarningModal(false);
        setWarningAcknowledged(true);
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showWarningModal]);

  // Sync editedContent when content changes
  useEffect(() => {
    if (content && !isEditMode) {
      setEditedContent(content);
    }
  }, [content, isEditMode]);

  // Handlers
  async function handleCopy() {
    try {
      const textToCopy = isEditMode ? editedContent : content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareLabel('Clipboard access denied — copy the text manually.');
      setTimeout(() => setShareLabel(null), 3000);
    }
  }

  function handleShareX() {
    const textToShare = isEditMode ? editedContent : content;
    const text = textToShare.length > 280 ? textToShare.slice(0, 277) + '...' : textToShare;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setShareLabel('Opening X...');
    setTimeout(() => setShareLabel(null), 2000);
  }

  async function handleShareLinkedIn() {
    const textToShare = isEditMode ? editedContent : content;
    try {
      await navigator.clipboard.writeText(textToShare);
      alert('Your post has been copied to the clipboard.\n\nClick OK to open LinkedIn — paste it into the post box that appears.');
    } catch {
      alert('Could not copy automatically.\n\nPlease copy the post text manually, then click OK to open LinkedIn.');
    }
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank', 'noopener,noreferrer');
  }

  async function handleRefine() {
    if (!jobId || !refineMessage.trim()) return;
    const prompt = refineMessage.trim();
    setIsRefining(true);
    try {
      const response = await refineOutput(jobId, prompt);
      setContent(response.current_output);
      setRefineMessage('');

      try {
        const updated = await checkJobStatus(jobId);
        setCostEntries(safeCostEntries(updated.cost_entries));
        if (typeof updated.total_cost === 'number') setTotalCost(updated.total_cost);
      } catch {
        // Non-fatal
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refine output';
      if (onError) onError(message);
    } finally {
      setIsRefining(false);
    }
  }

  function handleRefineKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRefine();
    }
  }

  async function handleSaveEdit() {
    if (!jobId || !editedContent.trim()) return;

    setIsSavingEdit(true);
    try {
      await saveEditedOutput(jobId, editedContent.trim());
      setContent(editedContent.trim());
      setIsEditMode(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save edit';
      if (onError) onError(message);
    } finally {
      setIsSavingEdit(false);
    }
  }

  function handleCancelEdit() {
    setEditedContent(content);
    setIsEditMode(false);
  }

  async function handleGenerateInfographic(templateId: string) {
    if (!jobId) return;

    setSelectedTemplate(templateId);
    setIsGeneratingInfographic(true);
    setInfographicError(null);
    setNotApplicableReason(null);
    setInfographicSvg(null);

    try {
      const response = await generateInfographic(jobId, templateId);
      if ('not_applicable' in response) {
        setNotApplicableReason(response.reason);
      } else {
        setInfographicSvg(response.svg_content);
        setGeneratedTemplate(templateId);

        try {
          const updated = await checkJobStatus(jobId);
          setCostEntries(safeCostEntries(updated.cost_entries));
          if (typeof updated.total_cost === 'number') setTotalCost(updated.total_cost);
        } catch {
          // Non-fatal
        }
      }
    } catch (err) {
      setInfographicError(err instanceof Error ? err.message : 'Failed to generate infographic');
    } finally {
      setIsGeneratingInfographic(false);
    }
  }

  async function handlePolishInfographic() {
    if (!jobId || !selectedTemplate || !polishPrompt.trim()) return;

    setIsPolishing(true);
    setPolishError(null);

    try {
      const response = await polishInfographic(jobId, selectedTemplate, polishPrompt.trim());
      setInfographicSvg(response.svg_content);
      setPolishPrompt('');

      try {
        const updated = await checkJobStatus(jobId);
        setCostEntries(safeCostEntries(updated.cost_entries));
        if (typeof updated.total_cost === 'number') setTotalCost(updated.total_cost);
      } catch {
        // Non-fatal
      }
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : 'Failed to polish infographic');
    } finally {
      setIsPolishing(false);
    }
  }

  function handlePolishKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePolishInfographic();
    }
  }

  function handleDownload() {
    if (!themedSvg) return;

    const filename = `infographic-${jobId}`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('Failed to create canvas context');
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([themedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const width = img.naturalWidth || img.width || 1080;
      const height = img.naturalHeight || img.height || 1080;

      if (width === 0 || height === 0) {
        URL.revokeObjectURL(url);
        alert('Failed to load infographic dimensions');
        return;
      }

      canvas.width = width * 2;
      canvas.height = height * 2;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) {
          alert('Failed to generate PNG');
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${filename}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Failed to load infographic for download');
    };

    img.src = url;
  }


  // Loading state
  if (status === 'processing') {
    return (
      <div className={`rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center py-16 space-y-4 border-2 ${isLight ? 'bg-zinc-100 border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
        <Loader2 size={40} className={`animate-spin ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
        <div className="text-center">
          <p className={`font-medium text-lg ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Generating your {outputMeta.label.toLowerCase()}...</p>
          <p className={`text-sm mt-1 min-h-[1.5rem] transition-opacity duration-300 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {LOADING_TIPS[loadingTipIndex]}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'failed') {
    return (
      <div className={`rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center py-16 space-y-4 border-2 ${isLight ? 'bg-zinc-100 border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
        <div className="p-4 bg-red-500/10 rounded-full">
          <AlertCircle size={40} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className={`font-medium text-lg ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>Something went wrong</p>
          <p className={`text-sm mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{errorMessage || 'Failed to generate summary'}</p>
        </div>
      </div>
    );
  }

  // Completed state
  return (
    <>
      <div className={`space-y-6 ${!warningAcknowledged ? 'blur-sm pointer-events-none select-none' : ''}`}>
        {/* Summary Section - Full width */}
        <SummarySection
          content={content}
          outputType={outputType}
          audienceLabel={audienceLabel}
          isEditMode={isEditMode}
          editedContent={editedContent}
          isRefining={isRefining}
          isSavingEdit={isSavingEdit}
          refineMessage={refineMessage}
          copied={copied}
          shareLabel={shareLabel}
          onCopy={handleCopy}
          onShareX={handleShareX}
          onShareLinkedIn={handleShareLinkedIn}
          onEditModeToggle={setIsEditMode}
          onEditedContentChange={setEditedContent}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onRefineMessageChange={setRefineMessage}
          onRefine={handleRefine}
          onRefineKeyDown={handleRefineKeyDown}
          resultCardRef={resultCardRef}
        />

        {/* Infographic Section - Full width */}
        <InfographicSection
          infographicSvg={themedSvg}
          selectedTemplate={selectedTemplate}
          generatedTemplate={generatedTemplate}
          isGenerating={isGeneratingInfographic}
          isPolishing={isPolishing}
          polishPrompt={polishPrompt}
          polishError={polishError}
          infographicError={infographicError}
          notApplicableReason={notApplicableReason}
          jobId={jobId}
          selectedTheme={selectedInfographicTheme}
          onTemplateSelect={setSelectedTemplate}
          onThemeSelect={setSelectedInfographicTheme}
          onGenerate={handleGenerateInfographic}
          onPolishPromptChange={setPolishPrompt}
          onPolish={handlePolishInfographic}
          onPolishKeyDown={handlePolishKeyDown}
          onDownload={handleDownload}
          onViewExamples={() => setShowExamplesModal(true)}
          onEdit={() => setShowEditModal(true)}
        />

        {/* References Section - Full width */}
        {(() => {
          const isReferencesLoading =
            summaryCitations.length === 0 &&
            !infographicContent &&
            isGeneratingInfographic;
          const hasReferences = summaryCitations.length > 0 || (!!infographicContent && !!generatedTemplate);
          return (isReferencesLoading || hasReferences) && (
            <ReferencesSection
              infographicContent={infographicContent as any}
              templateId={generatedTemplate}
              verificationFailures={verificationFailures}
              summaryCitations={summaryCitations}
              isLoading={isReferencesLoading}
            />
          );
        })()}

        <ResourcesHistoryCard
          totalCost={totalCost}
          costEntries={costEntries}
        />
      </div>

      {/* Infographic Examples Modal */}
      <InfographicExamplesModal isOpen={showExamplesModal} onClose={() => setShowExamplesModal(false)} />

      {/* Infographic Edit Modal */}
      {generatedTemplate && jobId && infographicSvg && (
        <InfographicEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          jobId={jobId}
          templateId={generatedTemplate}
          currentSvg={infographicSvg}
          onSave={(svgContent) => setInfographicSvg(svgContent)}
        />
      )}

      {/* AI Warning Modal */}
      {showWarningModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowWarningModal(false);
            setWarningAcknowledged(true);
          }}
        >
          <div
            className={`rounded-xl p-6 max-w-lg w-full border-2 ${isLight ? 'bg-white border-amber-500' : 'bg-zinc-900 border-amber-400'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
              <h2 className={`text-xl font-bold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                Important Notice
              </h2>
            </div>

            <p className={`text-base leading-relaxed mb-4 ${isLight ? 'text-zinc-700' : 'text-zinc-100'}`}>
              This is <strong>unverified AI-generated content</strong>. It may contain:
            </p>
            <ul className={`space-y-2 text-sm mb-6 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
              <li className="flex items-start gap-2">
                <span className={isLight ? 'text-amber-600' : 'text-amber-400'}>•</span>
                Factual errors or misinterpretations
              </li>
              <li className="flex items-start gap-2">
                <span className={isLight ? 'text-amber-600' : 'text-amber-400'}>•</span>
                Hallucinated statistics or citations
              </li>
              <li className="flex items-start gap-2">
                <span className={isLight ? 'text-amber-600' : 'text-amber-400'}>•</span>
                Oversimplifications of complex findings
              </li>
            </ul>

            <p className={`text-sm mb-6 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
              <strong>You must verify all facts against the original manuscript before publishing or sharing.</strong>
            </p>

            <button
              type="button"
              onClick={() => {
                setShowWarningModal(false);
                setWarningAcknowledged(true);
              }}
              className={`w-full py-3 rounded-lg font-bold text-base transition-colors cursor-pointer ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
            >
              I Understand — Show Results
            </button>
          </div>
        </div>
      )}
    </>
  );
}
