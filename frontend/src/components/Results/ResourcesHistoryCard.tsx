import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { OUTPUT_TYPES } from '../Steps/CustomizeStep';
import type { CostEntry } from '../../services/api';

interface ResourcesHistoryCardProps {
  totalCost: number | null;
  costEntries: CostEntry[];
}

function formatCost(n: number): string {
  if (n < 0.01) return '$0.01';
  return `$${n.toFixed(2)}`;
}

export default function ResourcesHistoryCard({ totalCost, costEntries }: ResourcesHistoryCardProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [expanded, setExpanded] = useState(false);

  const generateEntry = costEntries.find((e) => e.type === 'generate');
  const refineEntries = costEntries.filter((e) => e.type === 'refine');
  const infographicEntries = costEntries.filter((e) => e.type === 'infographic_generation' || e.type === 'infographic_polish');

  const refineCount = refineEntries.length;
  const infographicCount = infographicEntries.length;
  const totalEntries = (generateEntry ? 1 : 0) + refineCount + infographicCount;
  const defaultVisible = 3;
  const showExpandButton = totalEntries > defaultVisible;
  const visibleEntries = expanded ? totalEntries : defaultVisible;

  // Build ordered list of all entries
  const allEntries: { key: string; label: string; cost: number }[] = [];
  if (generateEntry) {
    allEntries.push({
      key: 'generate',
      label: generateEntry.output_format
        ? OUTPUT_TYPES.find(o => o.id === generateEntry.output_format)?.label || generateEntry.output_format
        : 'Generation',
      cost: generateEntry.cost,
    });
  }
  refineEntries.forEach((entry, i) => {
    allEntries.push({
      key: `refine-${i}`,
      label: `"${entry.prompt && entry.prompt.length > 40 ? entry.prompt.slice(0, 40) + '...' : (entry.prompt || `Refine ${i + 1}`)}"`,
      cost: entry.cost,
    });
  });
  infographicEntries.forEach((entry, i) => {
    allEntries.push({
      key: `infographic-${i}`,
      label: entry.type === 'infographic_polish'
        ? `Polish: "${entry.prompt && entry.prompt.length > 30 ? entry.prompt.slice(0, 30) + '...' : entry.prompt}"`
        : `Infographic (${(entry.template_id || 'unknown').replace(/_/g, ' ')})`,
      cost: entry.cost,
    });
  });

  const displayedEntries = allEntries.slice(0, visibleEntries);
  const hiddenCount = allEntries.length - visibleEntries;

  return (
    <div className={`rounded-xl px-5 py-4 border-2 ${isLight ? 'bg-white border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
      {/* Resources summary */}
      <div className="mb-4">
        <p className={`text-xs uppercase tracking-wider font-medium mb-1 ${isLight ? 'text-black/60' : 'text-zinc-400'}`}>Resources used</p>
        {totalCost !== null ? (
          <>
            <p className={`text-2xl font-bold tabular-nums ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{formatCost(totalCost)}</p>
            <p className={`text-xs mt-1 ${isLight ? 'text-black/60' : 'text-zinc-400'}`}>
              {generateEntry ? '1 generation' : ''}
              {refineCount > 0 ? `${generateEntry ? ' + ' : ''}${refineCount} refine${refineCount > 1 ? 's' : ''}` : ''}
              {infographicCount > 0 ? `${generateEntry || refineCount > 0 ? ' + ' : ''}${infographicCount} infographic${infographicCount > 1 ? 's' : ''}` : ''}
            </p>
          </>
        ) : (
          <p className={`text-sm ${isLight ? 'text-black/50' : 'text-zinc-500'}`}>Calculating...</p>
        )}
      </div>

      {/* Divider */}
      <div className={`border-t mb-3 ${isLight ? 'border-zinc-300' : 'border-zinc-700'}`} />

      {/* History */}
      <p className={`text-xs uppercase tracking-wider font-medium mb-2 ${isLight ? 'text-black/60' : 'text-zinc-400'}`}>History</p>

      {allEntries.length === 0 ? (
        <p className={`text-sm ${isLight ? 'text-black/50' : 'text-zinc-500'}`}>No activity yet.</p>
      ) : (
        <>
          <div className="space-y-0">
            {displayedEntries.map((entry, i) => (
              <div key={entry.key}>
                {i > 0 && <div className={`border-t ${isLight ? 'border-zinc-100' : 'border-zinc-800'}`} />}
                <div className="flex items-center justify-between py-1.5 gap-3">
                  <span className={`text-sm truncate min-w-0 ${isLight ? 'text-black' : 'text-zinc-300'}`}>
                    {entry.label}
                  </span>
                  <span className={`text-sm font-medium tabular-nums shrink-0 ${isLight ? 'text-black' : 'text-zinc-100'}`}>
                    {formatCost(entry.cost)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {showExpandButton && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`mt-2 flex items-center gap-1 text-xs cursor-pointer transition-colors ${isLight ? 'text-amber-600 hover:text-amber-700' : 'text-amber-400 hover:text-amber-300'}`}
            >
              {expanded ? (
                <>
                  <ChevronUp size={14} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  Show {hiddenCount} more
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
