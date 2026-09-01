import React from 'react';
import { parseParagraph, isRTLText, FormattedRun, splitTextIntoParagraphs } from '../utils/textUtils';

interface FormattedTextPreviewProps {
  content: string;
  language?: string;
  isDark?: boolean;
  className?: string;
}

export const FormattedTextPreview: React.FC<FormattedTextPreviewProps> = ({
  content,
  language,
  isDark = true,
  className = '',
}) => {
  if (!content) return null;

  // Split into paragraphs (or take the first few paragraphs for preview)
  const rawParas = splitTextIntoParagraphs(content);
  const isRtl = isRTLText(content, language);

  const redColor = isDark ? '#f87171' : '#dc2626';
  const blueColor = isDark ? '#60a5fa' : '#2563eb';

  const renderRuns = (runs: FormattedRun[], keyPrefix: string) => {
    return runs.map((run, rIdx) => {
      const colorStyle = run.color === 'red' ? redColor : run.color === 'blue' ? blueColor : undefined;

      if (run.hang && run.hang > 0) {
        const hangRows = run.hang;
        // In preview excerpt, drop cap scales gracefully for the 2-3 line card excerpt
        const fontSizeEm = Math.max(1.8, hangRows * 0.95).toFixed(2);

        return (
          <span
            key={`${keyPrefix}-run-${rIdx}`}
            className="drop-cap-initial select-text"
            style={{
              float: isRtl ? 'right' : 'left',
              fontSize: `${fontSizeEm}em`,
              lineHeight: 0.82,
              marginRight: isRtl ? '0' : '0.14em',
              marginLeft: isRtl ? '0.14em' : '0',
              marginTop: '0.04em',
              marginBottom: '0',
              padding: '0 0.04em',
              fontWeight: 700,
              fontFamily: 'serif',
              display: 'block',
              color: colorStyle,
              unicodeBidi: 'isolate',
              initialLetter: `${hangRows}`,
              WebkitInitialLetter: `${hangRows}`,
            } as React.CSSProperties}
          >
            {run.text}
          </span>
        );
      }

      if (colorStyle) {
        return (
          <span
            key={`${keyPrefix}-run-${rIdx}`}
            style={{ color: colorStyle }}
            className="font-medium"
          >
            {run.text}
          </span>
        );
      }

      return <React.Fragment key={`${keyPrefix}-run-${rIdx}`}>{run.text}</React.Fragment>;
    });
  };

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={className}>
      {rawParas.slice(0, 2).map((para, pIdx) => {
        const parsed = parseParagraph(para, pIdx);
        return (
          <p key={`preview-para-${pIdx}`} className={pIdx > 0 ? 'mt-2' : ''}>
            {parsed.tokens.map((token, tIdx) => {
              if (token.type === 'whitespace') {
                return <span key={`preview-p${pIdx}-ws-${tIdx}`}>{token.text}</span>;
              }
              return (
                <span key={`preview-p${pIdx}-w-${tIdx}`} className="inline">
                  {renderRuns(token.runs, `preview-p${pIdx}-w-${tIdx}`)}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
};
