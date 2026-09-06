import { useEffect, useState } from 'react';
import { getArticle, type Article } from '../lib/api';
import { useDismissOnBack } from '../lib/useDismissOnBack';

export function ArticleReader({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  useDismissOnBack(onClose);

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getArticle(articleId)
      .then(setArticle)
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [articleId]);

  return (
    <div className="bg-cream-50 fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <span className="text-ink-400 text-sm font-semibold">Article</span>
        <button onClick={onClose} className="text-ink-400 text-2xl leading-none">
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-10">
        {loading ? (
          <div className="text-ink-400 py-12 text-center text-sm">Loading…</div>
        ) : !article ? (
          <div className="text-ink-400 py-12 text-center text-sm">Couldn't load this article — try again.</div>
        ) : (
          <>
            <div className="mb-3 text-5xl">{article.emoji}</div>
            <h1 className="text-ink-900 mb-4 text-xl font-extrabold leading-snug">{article.title}</h1>
            <div className="flex flex-col gap-4">
              {article.body.split('\n\n').map((paragraph, i) => (
                <p key={i} className="text-ink-600 text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
