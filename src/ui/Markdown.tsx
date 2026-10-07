import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/** \[…\] and \(…\) → $$…$$ and $…$ (models use both conventions). */
const normalizeMath = (s: string) =>
  s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`);

function MarkdownImpl({ text }: { text: string }) {
  return (
    <div className="md" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{ a: ({ node: _node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
