import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

// Preprocessor to standardize LaTeX delimiters for Gemini 3.7 Flash & other LLMs
function preprocessMarkdownMath(text: string): string {
  if (!text) return '';
  // Fast path: if no LaTeX math delimiters are present, skip expensive regexes during rapid streaming
  if (!text.includes('$') && !text.includes('\\[') && !text.includes('\\(')) {
    return text;
  }

  let processed = text;

  // Convert LaTeX display math \[ ... \] to $$ ... $$
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_match, eq) => `\n$$\n${eq.trim()}\n$$\n`);

  // Convert LaTeX inline math \( ... \) to $ ... $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_match, eq) => `$${eq.trim()}$`);

  // Ensure $$ display math blocks that might be inline on a single line have proper surrounding newlines for remarkMath
  processed = processed.replace(/(^|[^\n])\$\$([\s\S]+?)\$\$([^\n]|$)/g, (match, prefix, mathContent, suffix) => {
    const cleanMath = mathContent.trim();
    return `${prefix}\n\n$$\n${cleanMath}\n$$\n\n${suffix}`;
  });

  return processed;
}

// Custom Code Block component with Copy button
const CodeBlock: React.FC<{ language?: string; children: React.ReactNode }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const textContent = String(children).replace(/\n$/, '');

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-stone-800 bg-stone-950 shadow-inner">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-stone-900/90 border-b border-stone-800 text-[11px] text-stone-400 font-mono">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-stone-800 text-stone-300 hover:text-amber-200 transition"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-stone-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-xs font-mono text-amber-200/90 leading-relaxed">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const processedContent = useMemo(() => preprocessMarkdownMath(content), [content]);

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#f87171', strict: false }]]}
        components={{
          // Code & pre blocks
          code(props) {
            const { className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && typeof children === 'string' && !children.includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-stone-800/80 text-amber-300 font-mono text-[0.88em] border border-stone-700/50"
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match ? match[1] : undefined}>
                {children}
              </CodeBlock>
            );
          },
          pre({ children }) {
            // Let the custom code component handle wrapping
            return <>{children}</>;
          },
          // Tables
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-stone-800 shadow-md">
                <table className="w-full text-left text-xs border-collapse divide-y divide-stone-800 bg-stone-900/60">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-stone-950 font-semibold text-amber-200 border-b border-stone-800">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-stone-800/70 text-stone-300">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-stone-800/40 transition-colors">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-3.5 py-2.5 font-medium tracking-wider text-[11px] uppercase text-amber-300/90">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3.5 py-2 text-stone-200 leading-normal">{children}</td>;
          },
          // Paragraphs
          p({ children }) {
            return <p dir="auto" className="mb-2.5 last:mb-0 leading-relaxed break-words">{children}</p>;
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote dir="auto" className="my-3 pl-3.5 py-1.5 border-l-3 border-amber-500/80 bg-amber-950/20 rounded-r-lg text-amber-100/90 italic text-xs leading-relaxed">
                {children}
              </blockquote>
            );
          },
          // Headings
          h1({ children }) {
            return <h1 dir="auto" className="text-base font-serif font-bold text-amber-100 mt-4 mb-2 pb-1 border-b border-stone-800">{children}</h1>;
          },
          h2({ children }) {
            return <h2 dir="auto" className="text-sm font-serif font-bold text-amber-200 mt-3 mb-1.5">{children}</h2>;
          },
          h3({ children }) {
            return <h3 dir="auto" className="text-xs font-serif font-semibold text-amber-300/90 mt-2 mb-1">{children}</h3>;
          },
          // Lists
          ul({ children }) {
            return <ul dir="auto" className="my-2 pl-5 space-y-1 list-disc text-xs text-stone-200">{children}</ul>;
          },
          ol({ children }) {
            return <ol dir="auto" className="my-2 pl-5 space-y-1 list-decimal text-xs text-stone-200">{children}</ol>;
          },
          li({ children }) {
            return <li dir="auto" className="leading-relaxed">{children}</li>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition font-medium"
              >
                {children}
              </a>
            );
          },
          // Strong / Bold
          strong({ children }) {
            return <strong className="font-semibold text-amber-100">{children}</strong>;
          },
          // Horizontal Rule
          hr() {
            return <hr className="my-4 border-stone-800" />;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
