import React, { useLayoutEffect, useState, useRef, useEffect } from 'react';

export interface PassageBoxInfo {
  key: string;
  target: string;
  isNested: boolean;
  isSelected: boolean;
  isHovered: boolean;
}

interface PassageHighlightOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  passages: PassageBoxInfo[];
  isDarkTheme: boolean;
  themeAccent?: 'amber' | 'purple';
  dependencies?: any[];
  onPassageHover?: (key: string | null) => void;
  onPassageClick?: (target: string, key: string) => void;
}

interface ComputedPassagePath {
  key: string;
  target: string;
  d: string;
  fill: string;
  stroke: string;
  isNested: boolean;
  isSelected: boolean;
  isHovered: boolean;
}

export const PassageHighlightOverlay: React.FC<PassageHighlightOverlayProps> = ({
  containerRef,
  passages,
  isDarkTheme,
  themeAccent = 'amber',
  dependencies = [],
  onPassageHover,
  onPassageClick,
}) => {
  const [paths, setPaths] = useState<ComputedPassagePath[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const computePaths = () => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return;

    setContainerSize({ width: containerRect.width, height: containerRect.height });

    const newPaths: ComputedPassagePath[] = [];

    passages.forEach((p) => {
      // Find the DOM span representing this passage
      const el = container.querySelector(`[data-passage-key="${p.key}"]`) as HTMLElement | null;
      if (!el) return;

      const rawRects = Array.from(el.getClientRects());
      if (rawRects.length === 0) return;

      // Map rects relative to container
      const mapped = rawRects
        .map((r) => ({
          left: r.left - containerRect.left,
          right: r.right - containerRect.left,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
          width: r.width,
          height: r.height,
        }))
        .filter((r) => r.width > 0.5 && r.height > 0.5);

      if (mapped.length === 0) return;

      // Group and merge rects on the same horizontal line
      const lineMap: Array<{ left: number; right: number; top: number; bottom: number }> = [];

      mapped.forEach((r) => {
        const matchingLine = lineMap.find(
          (line) => Math.abs(line.top - r.top) < 6 || (r.top < line.bottom - 4 && r.bottom > line.top + 4)
        );

        if (matchingLine) {
          matchingLine.left = Math.min(matchingLine.left, r.left);
          matchingLine.right = Math.max(matchingLine.right, r.right);
          matchingLine.top = Math.min(matchingLine.top, r.top);
          matchingLine.bottom = Math.max(matchingLine.bottom, r.bottom);
        } else {
          lineMap.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        }
      });

      // Sort lines top to bottom
      lineMap.sort((a, b) => a.top - b.top);

      // Group lines into clusters of horizontally overlapping consecutive lines.
      // If two consecutive lines have no horizontal overlap (e.g. line ends on right, next line starts on left),
      // they belong to separate clusters and are rendered as two disjoint boxes with no linking lines.
      const clusters: Array<Array<{ left: number; right: number; top: number; bottom: number }>> = [];
      let currentCluster: Array<{ left: number; right: number; top: number; bottom: number }> = [];

      for (let i = 0; i < lineMap.length; i++) {
        const line = lineMap[i];
        if (currentCluster.length === 0) {
          currentCluster.push({ ...line });
        } else {
          const prevLine = currentCluster[currentCluster.length - 1];
          // Check horizontal overlap between previous line and current line
          const overlap = Math.min(prevLine.right, line.right) - Math.max(prevLine.left, line.left);
          // If lines overlap horizontally by at least 2px, group them into the same polygon
          if (overlap >= 2) {
            currentCluster.push({ ...line });
          } else {
            clusters.push(currentCluster);
            currentCluster = [{ ...line }];
          }
        }
      }
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      if (clusters.length === 0) return;

      const padX = 3;
      const padY = 2;
      const subPaths: string[] = [];

      clusters.forEach((cluster) => {
        const M = cluster.length;
        if (M === 0) return;

        // Eliminate vertical line-height gaps between consecutive lines within the same cluster
        for (let i = 0; i < M - 1; i++) {
          const yMid = (cluster[i].bottom + cluster[i + 1].top) / 2;
          cluster[i].bottom = yMid;
          cluster[i + 1].top = yMid;
        }

        // Apply padding
        const paddedLines = cluster.map((l, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === M - 1;
          return {
            left: Math.max(0, l.left - padX),
            right: Math.min(containerRect.width, l.right + padX),
            top: isFirst ? l.top - padY : l.top,
            bottom: isLast ? l.bottom + padY : l.bottom,
          };
        });

        if (M === 1) {
          const r0 = paddedLines[0];
          subPaths.push(
            `M ${r0.left.toFixed(1)} ${r0.top.toFixed(1)} L ${r0.right.toFixed(1)} ${r0.top.toFixed(1)} L ${r0.right.toFixed(1)} ${r0.bottom.toFixed(1)} L ${r0.left.toFixed(1)} ${r0.bottom.toFixed(1)} Z`
          );
        } else {
          const points: Array<[number, number]> = [];

          // 1. First line top edge (left to right)
          points.push([paddedLines[0].left, paddedLines[0].top]);
          points.push([paddedLines[0].right, paddedLines[0].top]);

          // 2. Right edge stepping downwards
          for (let i = 0; i < M - 1; i++) {
            points.push([paddedLines[i].right, paddedLines[i].bottom]);
            points.push([paddedLines[i + 1].right, paddedLines[i + 1].top]);
          }
          points.push([paddedLines[M - 1].right, paddedLines[M - 1].bottom]);

          // 3. Bottom edge of last line
          points.push([paddedLines[M - 1].left, paddedLines[M - 1].bottom]);

          // 4. Left edge stepping upwards
          for (let i = M - 1; i > 0; i--) {
            points.push([paddedLines[i].left, paddedLines[i].top]);
            points.push([paddedLines[i - 1].left, paddedLines[i - 1].bottom]);
          }

          subPaths.push(
            points.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z'
          );
        }
      });

      const d = subPaths.join(' ');
      if (!d) return;

      // Theme-specific colors
      let fill = '';
      let stroke = '';

      if (p.isSelected) {
        if (themeAccent === 'purple') {
          fill = isDarkTheme ? 'rgba(168, 85, 247, 0.22)' : 'rgba(243, 232, 255, 0.85)';
          stroke = isDarkTheme ? 'rgba(192, 132, 252, 0.85)' : 'rgba(147, 51, 234, 0.85)';
        } else {
          // Warm subtle amber
          fill = isDarkTheme ? 'rgba(217, 119, 6, 0.20)' : 'rgba(254, 243, 199, 0.85)';
          stroke = isDarkTheme ? 'rgba(245, 158, 11, 0.8)' : 'rgba(217, 119, 6, 0.8)';
        }
      } else if (p.isHovered) {
        if (themeAccent === 'purple') {
          fill = isDarkTheme ? 'rgba(168, 85, 247, 0.14)' : 'rgba(243, 232, 255, 0.55)';
          stroke = isDarkTheme ? 'rgba(192, 132, 252, 0.65)' : 'rgba(168, 85, 247, 0.7)';
        } else {
          fill = isDarkTheme ? 'rgba(217, 119, 6, 0.12)' : 'rgba(254, 243, 199, 0.55)';
          stroke = isDarkTheme ? 'rgba(245, 158, 11, 0.6)' : 'rgba(217, 119, 6, 0.6)';
        }
      } else if (p.isNested) {
        // Nested passage: slightly more visible outline, very subtle fill
        fill = isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        stroke = isDarkTheme ? 'rgba(168, 162, 158, 0.55)' : 'rgba(107, 114, 128, 0.65)';
      } else {
        // Idle regular passage - subtle background fill with perimeter outline
        fill = isDarkTheme ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)';
        stroke = isDarkTheme ? 'rgba(140, 133, 125, 0.5)' : 'rgba(156, 163, 175, 0.65)';
      }

      newPaths.push({
        key: p.key,
        target: p.target,
        d,
        fill,
        stroke,
        isNested: p.isNested,
        isSelected: p.isSelected,
        isHovered: p.isHovered,
      });
    });

    setPaths(newPaths);
  };

  useLayoutEffect(() => {
    computePaths();
  }, [passages, isDarkTheme, themeAccent, ...dependencies]);

  useEffect(() => {
    const handleResize = () => {
      computePaths();
    };

    window.addEventListener('resize', handleResize);

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        computePaths();
      });
      observer.observe(container);
    }

    // Small timeout to catch post-render layout shifts
    const timer = setTimeout(computePaths, 60);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
      clearTimeout(timer);
    };
  }, [passages, isDarkTheme, themeAccent, ...dependencies]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-0"
      aria-hidden="false"
      style={{ width: containerSize.width || '100%', height: containerSize.height || '100%' }}
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={p.isSelected ? 1.5 : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="transition-colors duration-150 pointer-events-auto cursor-pointer"
          onMouseEnter={() => {
            onPassageHover?.(p.key);
          }}
          onMouseMove={() => {
            onPassageHover?.(p.key);
          }}
          onMouseLeave={() => {
            onPassageHover?.(null);
          }}
          onClick={(e) => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
              return;
            }
            e.stopPropagation();
            onPassageClick?.(p.target, p.key);
          }}
        />
      ))}
    </svg>
  );
};
