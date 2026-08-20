import { useState } from 'react';
import { ChevronDown, ChevronUp, Quote, CheckCircle2, BookOpen, Loader2 } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import type { SourceCitation, VerificationFailure, SummaryCitation } from '../../services/api';

interface StatWithCitation {
  value: string;
  label: string;
  detail: string;
  citation?: SourceCitation;
}

interface FindingWithCitation {
  title: string;
  body: string;
  citation?: SourceCitation;
}

interface StepWithCitation {
  title: string;
  body: string;
  citation?: SourceCitation;
}

interface InfographicContent {
  stats?: StatWithCitation[];
  findings?: FindingWithCitation[];
  steps?: StepWithCitation[];
  left_citation?: SourceCitation;
  right_citation?: SourceCitation;
  delta_citation?: SourceCitation;
  left_value?: string;
  right_value?: string;
  delta_value?: string;
  quote?: string;
  quote_section?: string;
  [key: string]: unknown;
}

interface ReferencesSectionProps {
  infographicContent?: InfographicContent | null;
  templateId?: string | null;
  verificationFailures?: VerificationFailure[];
  summaryCitations?: SummaryCitation[];
  isLoading?: boolean;
}

interface ReferenceItem {
  statLabel: string;
  statValue: string;
  citation: SourceCitation;
  index: number;
}

export default function ReferencesSection({
  infographicContent,
  templateId,
  verificationFailures = [],
  summaryCitations = [],
  isLoading = false,
}: ReferencesSectionProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className={`rounded-xl border-2 ${isLight ? 'bg-white border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
        <div className="w-full flex items-center gap-3 p-4">
          <BookOpen size={20} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
          <div>
            <h3 className={`font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>
              Source References
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Loader2 size={12} className={`animate-spin ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`} />
              <p className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Loading citations...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const references: ReferenceItem[] = [];
  const hasSummaryCitations = summaryCitations.length > 0;
  const hasInfographicContent = infographicContent && templateId;

  if (hasInfographicContent && templateId === 'stat_grid' && infographicContent.stats) {
    infographicContent.stats.forEach((stat, index) => {
      if (stat.citation) {
        references.push({
          statLabel: stat.label,
          statValue: stat.value,
          citation: stat.citation,
          index,
        });
      }
    });
  } else if (hasInfographicContent && templateId === 'key_findings' && infographicContent.findings) {
    infographicContent.findings.forEach((finding, index) => {
      if (finding.citation) {
        references.push({
          statLabel: finding.title,
          statValue: '',
          citation: finding.citation,
          index,
        });
      }
    });
  } else if (hasInfographicContent && templateId === 'method_steps' && infographicContent.steps) {
    infographicContent.steps.forEach((step, index) => {
      if (step.citation) {
        references.push({
          statLabel: step.title,
          statValue: '',
          citation: step.citation,
          index,
        });
      }
    });
  } else if (hasInfographicContent && templateId === 'comparison') {
    if (infographicContent.left_citation) {
      references.push({
        statLabel: 'Left Value',
        statValue: infographicContent.left_value || '',
        citation: infographicContent.left_citation,
        index: 0,
      });
    }
    if (infographicContent.right_citation) {
      references.push({
        statLabel: 'Right Value',
        statValue: infographicContent.right_value || '',
        citation: infographicContent.right_citation,
        index: 1,
      });
    }
    if (infographicContent.delta_citation) {
      references.push({
        statLabel: 'Change',
        statValue: infographicContent.delta_value || '',
        citation: infographicContent.delta_citation,
        index: 2,
      });
    }
  } else if (hasInfographicContent && templateId === 'pull_quote' && infographicContent.quote) {
    references.push({
      statLabel: 'Quote',
      statValue: '',
      citation: {
        verbatim_quote: infographicContent.quote,
        section: infographicContent.quote_section || 'Unknown',
        verified: true,
      },
      index: 0,
    });
  }

  if (references.length === 0 && !hasSummaryCitations) {
    return null;
  }

  const totalReferences = references.length + summaryCitations.length;

  const getFailureForIndex = (index: number): VerificationFailure | undefined => {
    return verificationFailures.find((f) => f.index === index);
  };

  // Count found/not found across both summary and infographic citations
  const summaryFoundCount = summaryCitations.filter(c => c.verified === true).length;
  const summaryNotFoundCount = summaryCitations.filter(c => c.verified === false).length;
  const infographicFoundCount = references.filter(ref => ref.citation.verified !== false && !getFailureForIndex(ref.index)).length;
  const infographicNotFoundCount = references.filter(ref => ref.citation.verified === false || getFailureForIndex(ref.index)).length;

  const totalFound = summaryFoundCount + infographicFoundCount;
  const totalNotFound = summaryNotFoundCount + infographicNotFoundCount;

  return (
    <div className={`rounded-xl border-2 ${isLight ? 'bg-white border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-4 text-left cursor-pointer ${isLight ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800/50'} rounded-xl transition-colors`}
      >
        <div className="flex items-center gap-3">
          <BookOpen size={20} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
          <div>
            <h3 className={`font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>
              Source References
            </h3>
            <p className={`text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {totalReferences} citation{totalReferences !== 1 ? 's' : ''} from the research paper
              {(totalFound > 0 || totalNotFound > 0) && (
                <span className="ml-2">
                  {totalFound > 0 && (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 size={12} />
                      {totalFound} found
                    </span>
                  )}
                  {totalFound > 0 && totalNotFound > 0 && <span className="mx-1">·</span>}
                  {totalNotFound > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-500">
                      {totalNotFound} not found
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp size={20} className={isLight ? 'text-zinc-400' : 'text-zinc-500'} />
        ) : (
          <ChevronDown size={20} className={isLight ? 'text-zinc-400' : 'text-zinc-500'} />
        )}
      </button>

      {isExpanded && (
        <div className={`px-4 pb-4 space-y-3 border-t ${isLight ? 'border-zinc-100' : 'border-zinc-800'}`}>
          <div className="pt-3 space-y-3">
            {/* Summary Citations */}
            {hasSummaryCitations && (
              <>
                {(hasSummaryCitations && references.length > 0) && (
                  <p className={`text-xs font-medium uppercase tracking-wide ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Summary References
                  </p>
                )}
                {summaryCitations.map((citation, idx) => (
                  <div
                    key={`summary-${idx}`}
                    className={`p-3 rounded-lg border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-800/50 border-zinc-700'}`}
                  >
                    <div className="flex items-start gap-3">
                      <Quote size={16} className={`shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-sm font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                            <span className={`font-bold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                              {citation.statistic}
                            </span>
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isLight ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-700 text-zinc-400'}`}>
                            {citation.section}
                          </span>
                          {citation.verified !== undefined && (
                            citation.verified ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 size={12} />
                                Found
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                Not found
                              </span>
                            )
                          )}
                        </div>
                        <blockquote className={`text-sm italic ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          "{citation.verbatim_quote}"
                        </blockquote>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Infographic Citations */}
            {references.length > 0 && (
              <>
                {hasSummaryCitations && (
                  <p className={`text-xs font-medium uppercase tracking-wide pt-2 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Infographic References
                  </p>
                )}
                {references.map((ref, idx) => {
                  const failure = getFailureForIndex(ref.index);
                  const isVerified = ref.citation.verified !== false && !failure;

                  return (
                    <div
                      key={`infographic-${idx}`}
                      className={`p-3 rounded-lg border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-800/50 border-zinc-700'}`}
                    >
                      <div className="flex items-start gap-3">
                        <Quote size={16} className={`shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-sm font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                              {ref.statLabel}
                              {ref.statValue && (
                                <span className={`ml-1 font-bold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                  {ref.statValue}
                                </span>
                              )}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isLight ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-700 text-zinc-400'}`}>
                              {ref.citation.section}
                            </span>
                            {isVerified ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 size={12} />
                                Found
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                Not found
                              </span>
                            )}
                          </div>
                          <blockquote className={`text-sm italic ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                            "{ref.citation.verbatim_quote}"
                          </blockquote>
                          {failure && (
                            <p className="text-xs mt-2 text-red-500">
                              {failure.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
