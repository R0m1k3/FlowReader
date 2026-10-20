import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { Article } from '../../api/articles';
import { useArticleActions } from '../../hooks/useArticleActions';
import { FocusCard } from './FocusCard';
import { Reader } from '../reader/Reader';
import { Icon } from '../Icon';

interface FocusCardStackProps {
    articles: Article[];
    onEmpty: () => void;
    onExit?: () => void;
}

type Action = 'read' | 'keep';

interface SwipeableCardProps {
    article: Article;
    index: number;
    isTop: boolean;
    onAction: (action: Action) => void;
}

/** A single draggable card (framer-motion drag; no extra gesture library). */
function SwipeableCard({ article, index, isTop, onAction }: SwipeableCardProps) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-220, 220], [-9, 9]);
    const opacityRead = useTransform(x, [20, 140], [0, 1]);
    const opacityKeep = useTransform(x, [-140, -20], [1, 0]);

    const onDragEnd = (_: unknown, info: PanInfo) => {
        const { offset, velocity } = info;
        if (Math.abs(offset.x) > 160 || (Math.abs(velocity.x) > 600 && Math.abs(offset.x) > 40)) {
            onAction(offset.x > 0 ? 'read' : 'keep');
        }
    };

    const scale = 1 - index * 0.05;
    const y = index * 16;

    return (
        <motion.div
            className={`absolute inset-0 rounded-3xl origin-bottom ${isTop ? 'cursor-grab active:cursor-grabbing touch-pan-y' : ''}`}
            style={{ x, rotate, zIndex: 100 - index, boxShadow: 'var(--shadow-float)' }}
            drag={isTop ? 'x' : false}
            dragSnapToOrigin
            dragElastic={0.9}
            onDragEnd={onDragEnd}
            initial={{ scale, y }}
            animate={{ scale, y }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            aria-hidden={!isTop}
        >
            {isTop && (
                <>
                    <motion.div style={{ opacity: opacityRead }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-nature/15">
                        <div className="border-4 border-nature text-nature font-black text-3xl uppercase tracking-widest px-4 py-2 rounded-lg -rotate-12 bg-carbon-light/80">
                            Lu
                        </div>
                    </motion.div>
                    <motion.div style={{ opacity: opacityKeep }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-earth/15">
                        <div className="border-4 border-earth text-earth font-black text-3xl uppercase tracking-widest px-4 py-2 rounded-lg rotate-12 bg-carbon-light/80">
                            Plus tard
                        </div>
                    </motion.div>
                </>
            )}
            <FocusCard article={article} isTop={isTop} />
        </motion.div>
    );
}

export function FocusCardStack({ articles, onEmpty, onExit }: FocusCardStackProps) {
    const { setRead } = useArticleActions();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reading, setReading] = useState(false);
    // History of actions so "undo" also restores the unread state on the server.
    const history = useRef<Action[]>([]);
    const [announce, setAnnounce] = useState('');

    const top = articles[currentIndex];
    const visible = articles.slice(currentIndex, currentIndex + 3);

    const act = useCallback(
        (action: Action) => {
            const a = articles[currentIndex];
            if (!a) return;
            if (action === 'read') setRead(a, true);
            history.current.push(action);
            setAnnounce(action === 'read' ? `« ${a.title} » marqué comme lu` : `« ${a.title} » gardé pour plus tard`);
            setCurrentIndex((i) => i + 1);
        },
        [articles, currentIndex, setRead],
    );

    const undo = useCallback(() => {
        if (currentIndex === 0) return;
        const last = history.current.pop();
        const prev = articles[currentIndex - 1];
        if (last === 'read' && prev) setRead(prev, false);
        setAnnounce('Action annulée');
        setCurrentIndex((i) => Math.max(0, i - 1));
    }, [articles, currentIndex, setRead]);

    useEffect(() => {
        if (currentIndex >= articles.length && articles.length > 0) onEmpty();
    }, [currentIndex, articles.length, onEmpty]);

    // Keyboard: ← keep, → read, Entrée/o read it, u/Backspace undo, Échap quit.
    useEffect(() => {
        if (reading) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            switch (e.key) {
                case 'ArrowRight':
                    act('read');
                    break;
                case 'ArrowLeft':
                    act('keep');
                    break;
                case 'Enter':
                case 'o':
                    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
                    setReading(true);
                    break;
                case 'u':
                case 'Backspace':
                    undo();
                    break;
                case 'Escape':
                    onExit?.();
                    break;
                default:
                    return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [reading, act, undo, onExit]);

    if (!top) return null;

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center gap-5">
            <p className="sr-only" aria-live="polite">{announce}</p>

            {/* Progress through the deck */}
            <div className="w-full max-w-md flex flex-col items-center gap-2">
                <p className="text-xs text-paper-muted tabular-nums">
                    {currentIndex + 1} sur {articles.length}
                </p>
                <div className="w-full h-1 rounded-full bg-line overflow-hidden" aria-hidden="true">
                    <div
                        className="h-full rounded-full bg-nature transition-[width] duration-300"
                        style={{ width: `${Math.round((currentIndex / articles.length) * 100)}%` }}
                    />
                </div>
            </div>

            {/* Stack */}
            <div className="relative w-full max-w-md flex-1 max-h-[580px] min-h-[340px] mb-9">
                <AnimatePresence mode="popLayout" initial={false}>
                    {visible.map((article, i) => (
                        <SwipeableCard key={article.id} article={article} index={i} isTop={i === 0} onAction={act} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Controls (every gesture has a labelled button equivalent) */}
            <div className="flex justify-center items-start gap-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                    onClick={() => act('keep')}
                    className="flex flex-col items-center gap-1.5 text-xs font-semibold text-earth"
                    title="Garder pour plus tard (←)"
                >
                    <span className="w-[60px] h-[60px] rounded-full border-2 border-earth flex items-center justify-center hover:bg-earth hover:text-on-earth transition-colors">
                        <Icon name="clock" size={26} strokeWidth={2} />
                    </span>
                    Plus tard
                </button>
                <button
                    onClick={undo}
                    disabled={currentIndex === 0}
                    className="pt-1.5 flex flex-col items-center gap-1.5 text-xs font-semibold text-paper-muted disabled:opacity-40"
                    title="Annuler (u)"
                >
                    <span className="w-12 h-12 rounded-full border border-line bg-carbon-light text-paper-white flex items-center justify-center">
                        <Icon name="undo" size={20} strokeWidth={2} />
                    </span>
                    Annuler
                </button>
                <button
                    onClick={() => setReading(true)}
                    className="pt-1.5 flex flex-col items-center gap-1.5 text-xs font-semibold text-paper-muted"
                    title="Lire l’article (Entrée)"
                >
                    <span className="w-12 h-12 rounded-full border border-line bg-carbon-light text-paper-white flex items-center justify-center">
                        <Icon name="book" size={20} strokeWidth={1.9} />
                    </span>
                    Lire
                </button>
                <button
                    onClick={() => act('read')}
                    className="flex flex-col items-center gap-1.5 text-xs font-semibold text-nature"
                    title="Marquer comme lu (→)"
                >
                    <span className="w-[60px] h-[60px] rounded-full bg-nature text-on-nature flex items-center justify-center hover:bg-nature-light transition-colors">
                        <Icon name="check" size={28} strokeWidth={2.4} />
                    </span>
                    Lu
                </button>
            </div>

            {reading && (
                <Reader
                    key={top.id}
                    article={top}
                    next={articles[currentIndex + 1]}
                    hasPrev={false}
                    backLabel="Mode Focus"
                    onClose={() => setReading(false)}
                    onNext={() => {
                        act('read');
                        if (!articles[currentIndex + 1]) setReading(false);
                    }}
                />
            )}
        </div>
    );
}
