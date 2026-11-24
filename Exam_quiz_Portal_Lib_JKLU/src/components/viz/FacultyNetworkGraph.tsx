import React from 'react';
import { ResponsiveNetwork } from '@nivo/network';
import { useTheme } from '@/contexts/ThemeContext';
import { getNivoTheme, usePrefersReducedMotion } from './chartTokens';

export interface FacultyGraphNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: 'faculty' | 'course' | 'ta';
  searchQuery: string;
}

export interface FacultyGraphLink {
  source: string;
  target: string;
  relation?: string;
}

interface FacultyNetworkGraphProps {
  nodes: FacultyGraphNode[];
  links: FacultyGraphLink[];
  onSelectNode?: (node: FacultyGraphNode) => void;
}

const NODE_COLORS: Record<FacultyGraphNode['kind'], string> = {
  faculty: '#E04F33',
  course: '#896ABD',
  ta: '#10B981',
};

const NODE_RADIUS: Record<FacultyGraphNode['kind'], number> = {
  faculty: 15,
  course: 11,
  ta: 8,
};

const FacultyNetworkGraph: React.FC<FacultyNetworkGraphProps> = ({
  nodes,
  links,
  onSelectNode,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const reducedMotion = usePrefersReducedMotion();

  if (!nodes || nodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div
        className="w-full h-[380px] sm:h-[430px] rounded-xl border border-[#E5E2DC]/80 dark:border-white/10 bg-[#FAF9F6]/60 dark:bg-[#0A0A0C]/60 overflow-hidden"
        role="region"
        aria-label="Interactive faculty, course, and TA relationship graph"
      >
        <ResponsiveNetwork
          data={{ nodes, links }}
          margin={{ top: 18, right: 18, bottom: 18, left: 18 }}
          linkDistance={(link) => ((link as any).relation === 'ta' ? 56 : 74)}
          centeringStrength={0.35}
          repulsivity={12}
          iterations={reducedMotion ? 40 : 90}
          theme={getNivoTheme(isDark)}
          nodeSize={(node) => NODE_RADIUS[node.kind] || 10}
          activeNodeSize={(node) => (NODE_RADIUS[node.kind] || 10) + 5}
          inactiveNodeSize={(node) => Math.max(5, (NODE_RADIUS[node.kind] || 10) - 3)}
          nodeColor={(node) => NODE_COLORS[node.kind] || '#896ABD'}
          nodeBorderWidth={2}
          nodeBorderColor={isDark ? '#111117' : '#FFFFFF'}
          linkThickness={1.5}
          linkColor={isDark ? 'rgba(245,244,240,0.22)' : 'rgba(10,10,12,0.18)'}
          isInteractive
          onClick={(computedNode) => {
            if (onSelectNode && computedNode?.data) {
              onSelectNode(computedNode.data);
            }
          }}
          nodeTooltip={({ node }) => {
            const d = node.data;
            const kindLabel =
              d.kind === 'faculty' ? 'Faculty' : d.kind === 'course' ? 'Course' : 'Teaching Assistant';
            return (
              <div className="px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#14141B] text-[#0A0A0C] dark:text-[#F5F4F0] shadow-lg text-xs space-y-0.5 max-w-[240px]">
                <div className="flex items-center gap-1.5 font-mono-tabular text-[10px] uppercase tracking-wider">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: NODE_COLORS[d.kind] }}
                  />
                  <span>{kindLabel}</span>
                </div>
                <div className="font-semibold">{d.label}</div>
                {d.sublabel && (
                  <div className="text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">{d.sublabel}</div>
                )}
                {onSelectNode && (
                  <div className="text-[10px] font-mono-tabular text-[#E04F33] pt-0.5">
                    Click node to filter directory →
                  </div>
                )}
              </div>
            );
          }}
          ariaLabel="Faculty and Course Network"
        />
      </div>

      {/* Accessible Keyboard Node Shortcuts */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] mr-1">
          Quick focus:
        </span>
        {nodes.slice(0, 12).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelectNode?.(n)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-[#896ABD] font-mono-tabular transition-[border-color]"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: NODE_COLORS[n.kind] }}
            />
            <span className="truncate max-w-[160px]">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default FacultyNetworkGraph;
