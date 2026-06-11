import { useState, useEffect, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import type { Article } from '../../api/articles';
import { FocusCard } from './FocusCard';
import { ReaderView } from '../ReaderView';
import { MobileReaderView } from '../MobileReaderView';
import { useIsMobile } from '../../hooks/useIsMobile';

interface FocusCardStackProps {
    articles: Article[];
    onMarkRead: (id: string) => void;
    onKeep: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onEmpty: () => void;
}

interface SwipeableCardProps {
    article: Article;
    index: number;
    isTop: boolean;
    onAction: (action: 'read' | 'keep') => void;
    onOpen: () => void;
    hasDraggedRef: React.MutableRefObject<boolean>;
    isProcessing: boolean;
}

/** A single draggable card. Drag state is local so unmount never "rebounds" the stack. */
function SwipeableCard({ article, index, isTop, onAction, onOpen, hasDraggedRef, isProcessing }: SwipeableCardProps) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-10, 10]);
    const opacityRead = useTransform(x, [0, 150], [0, 1]);
    const opacityKeep = useTransform(x, [-150, 0], [1, 0]);

    const xSpring = useSpring(x, { stiffness: 1000, damping: 50 });
    const rotateSpring = useSpring(rotate, { stiffness: 1000, damping: 50 });

    const bind = useDrag(({ active, movement: [mx], velocity: [vx] }) => {
        if (!isTop || isProcessing) return;
        if (active && Math.abs(mx) > 5) hasDraggedRef.current = true;

        const trigger = Math.abs(mx) > 200 || (Math.abs(vx) > 0.5 && Math.abs(mx) > 50);
        if (!active && trigger) {
            onAction(mx > 0 ? 'read' : 'keep');
        } else if (!active) {
            x.set(0);
            setTimeout(() => { hasDraggedRef.current = false; }, 50);
        } else {
            x.set(mx);
        }
    });

    const scale = 1 - index * 0.05;
    const yOffset = index * 18;

    return (
        <motion.div
            className="absolute inset-0 rounded-3xl origin-bottom"
            style={{
                x: isTop ? xSpring : 0,
                rotate: isTop ? rotateSpring : 0,
                zIndex: 100 - index,
                cursor: isTop ? 'grab' : 'default',
                boxShadow: 'var(--shadow-float)',
            }}
            {...(isTop ? (bind() as Record<string, unknown>) : {})}
            onDoubleClick={() => { if (isTop && !hasDraggedRef.current) onOpen(); }}
            initial={{ scale, y: yOffset, x: 0 }}
            animate={{ scale, y: yOffset, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
        >
            {/* Tinder-style stamps */}
            <motion.div style={{ opacity: opacityRead }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-nature/15">
                <div className="border-4 border-nature text-nature font-black text-3xl uppercase tracking-widest px-4 py-2 rounded-lg -rotate-12 bg-carbon-light/40 backdrop-blur-sm">
                    J'ai lu
                </div>
            </motion.div>
            <motion.div style={{ opacity: opacityKeep }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-earth/15">
                <div className="border-4 border-earth text-earth font-black text-3xl uppercase tracking-widest px-4 py-2 rounded-lg rotate-12 bg-carbon-light/40 backdrop-blur-sm">
                    Garder
                </div>
            </motion.div>

            <FocusCard article={article} isTop={isTop} />
        </motion.div>
    );
}

export function FocusCardStack({ articles, onMarkRead, onKeep, onToggleFavorite, onEmpty }: FocusCardStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [readingArticle, setReadingArticle] = useState<Article | null>(null);
    const isMobile = useIsMobile();
    const [isProcessing, setIsProcessing] = useState(false);
    const hasDraggedRef = useRef(false);

    const visibleArticles = articles.slice(currentIndex, currentIndex + 3);
    const topArticle = visibleArticles[0];

    const handleAction = (action: 'read' | 'keep' | 'undo') => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (action === 'undo') {
            setCurrentIndex((prev) => Math.max(0, prev - 1));
        } else if (action === 'read') {
            if (topArticle) onMarkRead(topArticle.id);
            setCurrentIndex((prev) => prev + 1);
        } else {
            if (topArticle) onKeep(topArticle.id);
            setCurrentIndex((prev) => prev + 1);
        }
        setTimeout(() => setIsProcessing(false), 450);
    };

    useEffect(() => {
        if (currentIndex >= articles.length && articles.length > 0) onEmpty();
    }, [currentIndex, articles.length, onEmpty]);

    if (!topArticle) return null;

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <AnimatePresence>
                {readingArticle && (
                    isMobile ? (
                        <MobileReaderView
                            article={readingArticle}
                            onClose={() => setReadingArticle(null)}
                            onToggleFavorite={onToggleFavorite}
                            onNext={() => { handleAction('read'); setReadingArticle(null); }}
                            onPrev={() => { handleAction('keep'); setReadingArticle(null); }}
                        />
                    ) : (
                        <ReaderView article={readingArticle} onClose={() => setReadingArticle(null)} onToggleFavorite={onToggleFavorite} />
                    )
                )}
            </AnimatePresence>

            {/* Stack */}
            <div className="relative w-full max-w-lg aspect-[3/4] sm:aspect-[4/5] md:h-[600px] z-10">
                <AnimatePresence mode="popLayout">
                    {visibleArticles.map((article, i) => (
                        <SwipeableCard
                            key={article.id}
                            article={article}
                            index={i}
                            isTop={i === 0}
                            onAction={handleAction}
                            onOpen={() => setReadingArticle(article)}
                            hasDraggedRef={hasDraggedRef}
                            isProcessing={isProcessing}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-4 sm:gap-8 px-4 z-20">
                <button
                    onClick={() => handleAction('keep')}
                    disabled={isProcessing}
                    className="p-4 rounded-full bg-carbon-light border border-earth/20 text-earth shadow-lg hover:bg-earth hover:text-white hover:scale-110 transition-all disabled:opacity-50 disabled:scale-100"
                    title="Garder (gauche)" aria-label="Garder"
                >
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>

                <button
                    onClick={() => handleAction('undo')}
                    disabled={currentIndex === 0 || isProcessing}
                    className={`p-3 rounded-full border shadow-lg transition-all ${
                        currentIndex > 0
                            ? 'bg-carbon-light border-nature/15 text-nature hover:bg-nature hover:text-white hover:scale-105 opacity-100'
                            : 'opacity-0 pointer-events-none scale-90'
                    }`}
                    title="Annuler" aria-label="Annuler"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                </button>

                <button
                    onClick={() => handleAction('read')}
                    disabled={isProcessing}
                    className="p-4 rounded-full bg-nature text-white border border-nature shadow-lg shadow-nature/20 hover:bg-nature-light hover:scale-110 transition-all disabled:opacity-50 disabled:scale-100"
                    title="J'ai lu (droite)" aria-label="J'ai lu"
                >
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </div>

            {/* Counter */}
            <div className="absolute top-10 left-0 right-0 text-center z-20 pointer-events-none">
                <span className="inline-block bg-nature-dark/70 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] uppercase font-bold tracking-widest">
                    {articles.length - currentIndex} restants
                </span>
            </div>
        </div>
    );
}
