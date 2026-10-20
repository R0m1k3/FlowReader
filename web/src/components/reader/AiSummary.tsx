import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../../api/articles';
import { patchArticle } from '../../hooks/useArticleActions';
import { usePrefs } from '../../stores/prefsStore';
import { Icon } from '../Icon';
import { toPoints } from '../../lib/summary';

interface AiSummaryProps {
    articleId: string;
    summary?: string;
}

/** "Résumé IA" block at the top of the reader; offers to generate one when missing. */
export function AiSummary({ articleId, summary }: AiSummaryProps) {
    const qc = useQueryClient();
    const open = usePrefs((s) => s.summaryOpen);
    const setOpen = usePrefs((s) => s.setSummaryOpen);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    const summarize = async () => {
        setPending(true);
        setError('');
        try {
            const res = await articlesApi.summarize(articleId);
            patchArticle(qc, articleId, { ai_summary: res.summary });
            setOpen(true);
        } catch {
            setError('Le résumé n’a pas pu être généré. Réessayez plus tard.');
        } finally {
            setPending(false);
        }
    };

    if (!summary) {
        return (
            <div className="mt-6">
                <button
                    onClick={summarize}
                    disabled={pending}
                    className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-line bg-carbon-light text-nature text-sm font-semibold hover:bg-nature-soft transition-colors disabled:opacity-60"
                >
                    {pending ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    ) : (
                        <Icon name="sparkle" size={16} strokeWidth={2} />
                    )}
                    {pending ? 'Résumé en cours…' : 'Résumer cet article'}
                </button>
                {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            </div>
        );
    }

    const points = toPoints(summary);
    return (
        <section aria-labelledby={`summary-${articleId}`} className="mt-6 rounded-2xl bg-nature-soft pl-5 pr-2 pt-1.5 pb-1.5">
            <div className="flex items-center gap-2">
                <Icon name="sparkle" size={16} strokeWidth={2} className="text-nature shrink-0" />
                <h2 id={`summary-${articleId}`} className="flex-1 font-sans text-[13px] font-bold text-nature">Résumé IA</h2>
                <button
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    aria-controls={`summary-body-${articleId}`}
                    className="min-h-11 px-3 rounded-full text-[13px] font-semibold text-nature hover:bg-carbon-light/60 transition-colors"
                >
                    {open ? 'Masquer' : 'Afficher'}
                </button>
            </div>
            {open && (
                <div id={`summary-body-${articleId}`} className="pb-3.5 pr-3 font-reading text-[17px] leading-normal text-paper-white">
                    {points ? (
                        <ul className="list-disc pl-5 space-y-2 marker:text-nature">
                            {points.map((p, i) => (
                                <li key={i}>{p}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-pretty">{summary}</p>
                    )}
                </div>
            )}
        </section>
    );
}
