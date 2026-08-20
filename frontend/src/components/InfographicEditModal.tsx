import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Check, Eye, CheckCircle2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTheme } from '../hooks/useTheme';
import { getInfographicContent, saveInfographicContent, previewInfographicContent, type InfographicFieldSchema, type VerificationFailure } from '../services/api';

interface InfographicEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  templateId: string;
  currentSvg: string;
  onSave: (svgContent: string) => void;
}

const FRIENDLY_LABELS: Record<string, string> = {
  eyebrow: 'Topic Tag',
  footer: 'Citation',
  headline: 'Main Headline',
  deck: 'Summary Line',
  source_title: 'Paper Title',
  quote: 'Quote Text',
  speaker: 'Speaker Name',
  affiliation: 'Speaker Affiliation',
  context: 'Quote Context',
  left_label: 'Left Side Label',
  left_value: 'Left Side Value',
  left_caption: 'Left Side Caption',
  left_detail: 'Left Side Details',
  right_label: 'Right Side Label',
  right_value: 'Right Side Value',
  right_caption: 'Right Side Caption',
  right_detail: 'Right Side Details',
  delta_label: 'Change Label',
  delta_value: 'Change Value',
  delta_note: 'Change Note',
  value: 'Number',
  label: 'Label',
  detail: 'Description',
  title: 'Title',
  body: 'Description',
};

const FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  eyebrow: 'Short topic or category shown at the top',
  footer: 'Paper citation (author, journal, year)',
  headline: 'The main finding or message',
  deck: 'A brief summary sentence below the headline',
  source_title: 'Title of the research paper',
  quote: 'The exact quote from the paper',
  speaker: 'Who said the quote',
  affiliation: 'Their institution or role',
  context: 'Why this quote matters',
  value: 'The statistic or number',
  label: 'What this number represents',
  detail: 'Additional context or explanation',
  title: 'Main point or step name',
  body: 'Supporting details',
};

export default function InfographicEditModal({
  isOpen,
  onClose,
  jobId,
  templateId,
  currentSvg,
  onSave,
}: InfographicEditModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<Record<string, InfographicFieldSchema>>({});
  const [previewSvg, setPreviewSvg] = useState(currentSvg);
  const [verificationStatus, setVerificationStatus] = useState<'found' | 'not_found' | 'verified' | 'needs_review' | 'pending' | undefined>();
  const [verificationFailures, setVerificationFailures] = useState<VerificationFailure[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);
    setPreviewSvg(currentSvg);

    getInfographicContent(jobId, templateId)
      .then((response) => {
        setContent(response.content);
        setSchema(response.schema);
        setVerificationStatus(response.verification_status);
        setVerificationFailures(response.verification_failures || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, jobId, templateId, currentSvg]);

  const handleFieldChange = (field: string, value: unknown) => {
    setContent((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayItemChange = (field: string, index: number, key: string, value: string) => {
    setContent((prev) => {
      const arr = [...(prev[field] as unknown[])];
      arr[index] = { ...(arr[index] as Record<string, unknown>), [key]: value };
      return { ...prev, [field]: arr };
    });
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);

    try {
      const response = await previewInfographicContent(jobId, templateId, content);
      setPreviewSvg(response.svg_content);
      setShowMobilePreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await saveInfographicContent(jobId, templateId, content);
      setPreviewSvg(response.svg_content);
      onSave(response.svg_content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const getFriendlyLabel = (fieldName: string) => FRIENDLY_LABELS[fieldName] || fieldName.replace(/_/g, ' ');
  const getFriendlyDescription = (fieldName: string) => FRIENDLY_DESCRIPTIONS[fieldName] || '';


  const renderField = (fieldName: string, value: unknown, fieldSchema: InfographicFieldSchema) => {
    const maxLen = fieldSchema.max_length;
    const currentLen = typeof value === 'string' ? value.length : 0;
    const isOverLimit = maxLen && currentLen > maxLen;
    const isNearLimit = maxLen && currentLen >= maxLen * 0.8;

    return (
      <div key={fieldName} className="space-y-1">
        <label className={`block text-sm font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
          {getFriendlyLabel(fieldName)}
          {maxLen && isNearLimit && (
            <span className={`ml-2 text-xs ${isOverLimit ? 'text-red-500' : 'text-amber-500'}`}>
              {currentLen}/{maxLen} chars
            </span>
          )}
        </label>
        <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {getFriendlyDescription(fieldName)}
        </p>
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => handleFieldChange(fieldName, e.target.value)}
          rows={fieldName === 'quote' ? 5 : fieldName.includes('detail') || fieldName === 'deck' ? 4 : 2}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none resize-none overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-none ${
            isOverLimit
              ? 'border-red-500 focus:border-red-500'
              : (isLight ? 'bg-white border-zinc-300 focus:border-amber-500' : 'bg-zinc-800 border-zinc-600 focus:border-amber-400')
          } ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}
        />
      </div>
    );
  };

  const renderArrayField = (fieldName: string, items: unknown[], itemSchema: Record<string, InfographicFieldSchema>) => {
    const arrayLabel = fieldName === 'stats' ? 'Statistics' : fieldName === 'findings' ? 'Key Findings' : 'Steps';
    const itemLabel = fieldName === 'stats' ? 'Stat' : fieldName === 'findings' ? 'Finding' : 'Step';

    return (
      <div key={fieldName} className="space-y-4">
        <h4 className={`text-sm font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
          {arrayLabel}
        </h4>
        {items.map((item, index) => {
          const itemObj = item as Record<string, unknown>;

          return (
            <div key={index} className={`p-4 rounded-lg border space-y-3 ${isLight ? 'bg-zinc-50 border-zinc-300' : 'bg-zinc-800/50 border-zinc-700'}`}>
              <div className={`text-xs font-medium ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                {itemLabel} {index + 1}
              </div>
              {Object.keys(itemObj).filter(key => key !== 'citation').map((key) => {
                const itemValue = itemObj[key];
                const keySchema = itemSchema[key] || { description: '', max_length: null };
                const maxLen = keySchema.max_length;
                const currentLen = typeof itemValue === 'string' ? itemValue.length : 0;
                const isOverLimit = maxLen && currentLen > maxLen;
                const isNearLimit = maxLen && currentLen >= maxLen * 0.8;

                return (
                  <div key={key} className="space-y-1">
                    <label className={`block text-xs font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {getFriendlyLabel(key)}
                      {maxLen && isNearLimit && (
                        <span className={`ml-2 ${isOverLimit ? 'text-red-500' : 'text-amber-500'}`}>
                          {currentLen}/{maxLen}
                        </span>
                      )}
                    </label>
                    <p className={`text-xs ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {getFriendlyDescription(key)}
                    </p>
                    <textarea
                      value={typeof itemValue === 'string' ? itemValue : ''}
                      onChange={(e) => handleArrayItemChange(fieldName, index, key, e.target.value)}
                      rows={key === 'detail' || key === 'body' ? 3 : 1}
                      className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none resize-none overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-none ${
                        isOverLimit
                          ? 'border-red-500 focus:border-red-500'
                          : (isLight ? 'bg-white border-zinc-300 focus:border-amber-500' : 'bg-zinc-700 border-zinc-600 focus:border-amber-400')
                      } ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const simpleFields: string[] = [];
  const arrayFields: string[] = [];

  const VERIFICATION_ONLY_FIELDS = new Set(['quote_section', 'quote_verified']);

  Object.keys(content).forEach((key) => {
    if (VERIFICATION_ONLY_FIELDS.has(key)) {
      // verification metadata — no SVG slot, skip
    } else if (Array.isArray(content[key])) {
      arrayFields.push(key);
    } else if (typeof content[key] !== 'object' || content[key] === null) {
      simpleFields.push(key);
    }
    // skip SourceCitation objects (left_citation, right_citation, etc.) — verification-only, not SVG fields
  });

  // Remove footer from simpleFields - will render it last after array fields
  const footerIndex = simpleFields.indexOf('footer');
  if (footerIndex > -1) {
    simpleFields.splice(footerIndex, 1);
  }

  const getArrayItemSchema = (fieldName: string): Record<string, InfographicFieldSchema> => {
    if (fieldName === 'stats') {
      return {
        value: { description: '', max_length: 12 },
        label: { description: '', max_length: 35 },
        detail: { description: '', max_length: 150 },
      };
    }
    if (fieldName === 'findings') {
      return {
        title: { description: '', max_length: 70 },
        body: { description: '', max_length: 220 },
      };
    }
    if (fieldName === 'steps') {
      return {
        title: { description: '', max_length: 70 },
        body: { description: '', max_length: 220 },
      };
    }
    return {};
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`rounded-xl w-full max-w-lg lg:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border-2 ${isLight ? 'bg-white border-amber-500' : 'bg-zinc-900 border-amber-400'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? 'border-zinc-200' : 'border-zinc-700'}`}>
          <h2 className={`text-xl font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>
            Edit Infographic
          </h2>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-800'}`}
          >
            <X size={20} className={isLight ? 'text-zinc-500' : 'text-zinc-400'} />
          </button>
        </div>

        {/* Body - Side by side on large, toggle between preview/form on small */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* SVG Preview - full screen on mobile when active, side panel on large */}
          <div className={`${showMobilePreview ? 'flex' : 'hidden'} lg:flex flex-col flex-1 lg:flex-none lg:w-1/2 p-4 lg:border-r overflow-auto [&::-webkit-scrollbar]:hidden scrollbar-none ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-700 bg-zinc-800'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Preview
              </p>
              <button
                onClick={() => setShowMobilePreview(false)}
                className={`lg:hidden text-xs px-3 py-1.5 rounded-lg font-medium ${isLight ? 'bg-amber-500 text-black' : 'bg-amber-400 text-black'}`}
              >
                Back to Edit
              </button>
            </div>
            <div
              className="bg-white rounded-lg p-2 overflow-hidden flex items-start justify-center [&>svg]:max-w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewSvg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
            />
          </div>

          {/* Edit Form - hidden on mobile when preview is shown */}
          <div className={`${showMobilePreview ? 'hidden' : 'flex'} lg:flex flex-col flex-1 lg:w-1/2 overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-none px-4 lg:px-6 py-4 space-y-4`}>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={32} className={`animate-spin ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              </div>
            ) : error && Object.keys(content).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-2">
                <AlertCircle size={32} className="text-red-500" />
                <p className={`text-sm ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{error}</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500">
                    <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-red-500 text-sm">{error}</p>
                  </div>
                )}

                {/* Verification Status Banner */}
                {verificationStatus && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg ${
                    (verificationStatus === 'found' || verificationStatus === 'verified')
                      ? 'bg-green-500/10 border border-green-500'
                      : isLight ? 'bg-zinc-100 border border-zinc-300' : 'bg-zinc-800 border border-zinc-700'
                  }`}>
                    {(verificationStatus === 'found' || verificationStatus === 'verified') ? (
                      <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className={`shrink-0 mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${(verificationStatus === 'found' || verificationStatus === 'verified') ? 'text-green-600' : 'text-zinc-600'}`}>
                        {(verificationStatus === 'found' || verificationStatus === 'verified') ? 'All references found' : 'Some references not found'}
                      </p>
                      <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {(verificationStatus === 'found' || verificationStatus === 'verified')
                          ? 'All source quotes were found in the paper.'
                          : `${verificationFailures.length} quote(s) could not be found in the paper.`}
                      </p>
                    </div>
                  </div>
                )}

                {simpleFields.map((fieldName) =>
                  renderField(fieldName, content[fieldName], schema[fieldName] || { description: '', max_length: null })
                )}

                {arrayFields.map((fieldName) =>
                  renderArrayField(fieldName, content[fieldName] as unknown[], getArrayItemSchema(fieldName))
                )}

                {/* Citation always at the bottom */}
                {content.footer !== undefined &&
                  renderField('footer', content.footer, schema.footer || { description: '', max_length: null })
                }
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 lg:gap-3 px-4 lg:px-6 py-3 lg:py-4 border-t ${isLight ? 'border-zinc-200' : 'border-zinc-700'}`}>
          <button
            onClick={onClose}
            disabled={saving || previewing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isLight ? 'hover:bg-zinc-100 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'}`}
          >
            Cancel
          </button>
          <button
            onClick={handlePreview}
            disabled={saving || previewing || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border ${isLight ? 'border-zinc-300 hover:bg-zinc-100 text-zinc-700' : 'border-zinc-600 hover:bg-zinc-800 text-zinc-300'}`}
          >
            {previewing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Previewing...
              </>
            ) : (
              <>
                <Eye size={14} />
                Preview
              </>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || previewing || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check size={14} />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
