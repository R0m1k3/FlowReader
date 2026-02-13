import { useState, useEffect, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import type { Article } from '../../api/articles';
import { FocusCard } from './FocusCard';
import { ReaderView } from '../ReaderView';
import { MobileReaderView } from '../MobileReaderView';
import { useIsMobile } from '../../hooks/useIsMobile';
// The CardStack props don't have onToggleFavorite. We might need to add it or Mock it.
// ReaderView requires onToggleFavorite.
// Let's check FocusCardStackProps. It does NOT have it.
// We should add it to props or just use a dummy one for now if not strictly required by user?
// User said "meme system". Dashboard passes `toggleFavoriteMutation.mutate`.
// FocusPage handles mutations. We should pass `onToggleFavorite` to FocusCardStack.

interface FocusCardStackProps {
    articles: Article[];
    onMarkRead: (id: string) => void;
    onKeep: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onEmpty: () => void;
}

export function FocusCardStack({ articles, onMarkRead, onKeep, onToggleFavorite, onEmpty }: FocusCardStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [readingArticle, setReadingArticle] = useState<Article | null>(null);
    // const [exitX, setExitX] = useState(0); // Removed per simplification
    const isMobile = useIsMobile();

    const [isProcessing, setIsProcessing] = useState(false);
    // Track whether a drag gesture occurred to prevent double-click from firing after swipe
    const hasDraggedRef = useRef(false);

    // Visible stack size
    const visibleArticles = articles.slice(currentIndex, currentIndex + 3);
    const topArticle = visibleArticles[0];

    // Motion values for drag
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-10, 10]);
    // Opacity not used for card itself in this design, removed to fix lint

    // Background color based on drag direction
    const bgOpacityRead = useTransform(x, [0, 150], [0, 1]);
    const bgOpacityKeep = useTransform(x, [-150, 0], [1, 0]);

    // Spring physics for smooth return
    const xSpring = useSpring(x, { stiffness: 1000, damping: 50 });
    const rotateSpring = useSpring(rotate, { stiffness: 1000, damping: 50 });

    const handleAction = (action: 'read' | 'keep' | 'undo') => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (action === 'undo') {
            if (currentIndex > 0) {
                setCurrentIndex(prev => Math.max(0, prev - 1));
                x.set(0);
            }
        } else if (action === 'read') {
            onMarkRead(topArticle.id);
            setCurrentIndex(prev => prev + 1);
            x.set(0);
        } else {
            onKeep(topArticle.id);
            setCurrentIndex(prev => prev + 1);
            x.set(0);
        }

        // Lock for animation duration
        setTimeout(() => setIsProcessing(false), 500);
    };

    const bind = useDrag(({ active, movement: [mx], velocity: [vx] }) => {
        if (readingArticle || isProcessing) return; // Disable drag when reading or processing

        // Mark as dragged if the user moved more than a few pixels
        if (active && Math.abs(mx) > 5) {
            hasDraggedRef.current = true;
        }

        const trigger = Math.abs(mx) > 200 || (Math.abs(vx) > 0.5 && Math.abs(mx) > 50);

        if (!active && trigger) {
            // Swipe Validé
            const isRight = mx > 0;
            // setExitX(isRight ? 500 : -500); // Trigger exit animation - Removed lateral movement per user request

            // Trigger action via handler
            handleAction(isRight ? 'read' : 'keep');
        } else if (!active) {
            // Snap Back — reset drag flag after a short delay so double-click can distinguish
            x.set(0);
            setTimeout(() => { hasDraggedRef.current = false; }, 50);
        } else {
            // Actively dragging
            x.set(mx);
        }
    });

    // Check for empty stack
    useEffect(() => {
        if (currentIndex >= articles.length && articles.length > 0) {
            onEmpty();
        }
    }, [currentIndex, articles.length, onEmpty]);

    if (!topArticle) return null;

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {/* Reading View Modal */}
            <AnimatePresence>
                {readingArticle && (
                    isMobile ? (
                        <MobileReaderView
                            article={readingArticle}
                            onClose={() => setReadingArticle(null)}
                            onToggleFavorite={onToggleFavorite}
                            onNext={() => {
                                onMarkRead(readingArticle.id);
                                setCurrentIndex(prev => prev + 1);
                                setReadingArticle(null);
                            }}
                            onPrev={() => {
                                onKeep(readingArticle.id);
                                // MobileReaderView 'Next' usually goes forward. 'Prev' goes back? 
                                // Actually in MobileReaderView context, swipe left = Next, swipe Right = Prev.
                                // Here 'Prev' in the context of Focus Stack might mean 'Keep' or 'Undo'?
                                // The user's request is "validation" (swipe right? no left usually implies next)
                                // Let's map Next -> MarkRead (Next card), Prev -> Keep (Skip/Next card but keep).
                                // Wait, usually swipe left = next item.
                                // In Tinter: Left = Dislike (skip), Right = Like (Keep/Read).
                                // In Focus: Right = Validé (Read), Left = Keep (Skip).
                                // So 'Next' (Swipe Left) should map to 'Keep'?
                                // Let's check MobileReaderView implementation.
                                // onSwipedLeft: () => onNext()
                                // onSwipedRight: () => onPrev()
                                // If we want to consistency with FocusCardStack:
                                // Stack: Swipe Right (>0) = Mark Read. Swipe Left (<0) = Keep.
                                // MobileReaderView: Swipe Left (Next). Swipe Right (Prev).
                                // So MobileReaderView 'Next' (Left) should be 'Keep'.
                                // MobileReaderView 'Prev' (Right) should be 'Mark Read'.
                                // But 'Prev' name is confusing.
                                // Let's stick to: 
                                // Next -> onKeep (Skip)
                                // Prev -> onMarkRead (Read)

                                // Actually, let's just close and advance index, logic is handled by what we call.
                                // If 'Next' means 'I'm done, show next', it's 'Mark Read'.
                                // Let's map:
                                // onNext (Left Swipe) -> Keep (Skip to next)
                                // onPrev (Right Swipe) -> Mark Read (Done, to next)
                                // This matches the card stack directions:
                                // Card Stack: Left Swipe (mx < 0) -> Keep. 
                                // MobileReaderView: Left Swipe -> onNext.
                                // So onNext === Keep.

                                // Card Stack: Right Swipe (mx > 0) -> Mark Read.
                                // MobileReaderView: Right Swipe -> onPrev.
                                // So onPrev === Mark Read.

                                onKeep(readingArticle.id);
                                setCurrentIndex(prev => prev + 1);
                                setReadingArticle(null);
                            }}
                        />
                    ) : (
                        <ReaderView
                            article={readingArticle}
                            onClose={() => setReadingArticle(null)}
                            onToggleFavorite={onToggleFavorite}
                        />
                    )
                )}
            </AnimatePresence>

            {/* Background Indicators */}
            <motion.div style={{ opacity: bgOpacityRead }} className="absolute inset-0 bg-nature/10 flex items-center justify-end px-20 pointer-events-none z-0">
                <span className="text-nature font-black text-9xl transform rotate-12 opacity-40">✓</span>
            </motion.div>
            <motion.div style={{ opacity: bgOpacityKeep }} className="absolute inset-0 bg-blue-500/10 flex items-center justify-start px-20 pointer-events-none z-0">
                <span className="text-blue-500 font-black text-9xl transform -rotate-12 opacity-40">⭐</span>
            </motion.div>

            {/* Card Stack */}
            <div className="relative w-full max-w-lg aspect-[3/4] sm:aspect-[4/5] md:h-[600px] z-10">
                <AnimatePresence mode="popLayout">
                    {visibleArticles.map((article, i) => {
                        const isTop = i === 0;
                        return (
                            <motion.div
                                key={article.id}
                                className="absolute inset-0 rounded-3xl shadow-2xl origin-bottom"
                                style={{
                                    scale: isTop ? 1 : 1 - i * 0.05,
                                    y: isTop ? xSpring : i * 20, // Only top card moves with drag
                                    rotate: isTop ? rotateSpring : 0,
                                    zIndex: 100 - i,
                                    x: isTop ? xSpring : 0, // Should use the spring value!
                                    cursor: isTop ? 'grab' : 'default',
                                }}
                                {...(isTop ? (bind() as any) : {})}
                                onDoubleClick={() => {
                                    // Only open on genuine double-click, not after a drag gesture
                                    if (isTop && !hasDraggedRef.current) {
                                        setReadingArticle(article);
                                    }
                                }}
                                animate={{ scale: 1 - i * 0.05, y: i * 20 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            >
                                <FocusCard article={article} isTop={isTop} />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-4 px-4 sm:gap-8 z-20">
                {/* Garder — Outlined style matching Dashboard "Actualiser" button */}
                <button
                    onClick={() => handleAction('keep')}
                    disabled={isProcessing}
                    className="p-4 rounded-full bg-white border border-nature/10 text-nature shadow-lg hover:bg-nature hover:text-white hover:border-nature hover:scale-110 transition-all duration-300 disabled:opacity-50 disabled:scale-100"
                    title="Garder (Gauche)"
                >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" transform="rotate(-90 12 12)" />
                    </svg>
                </button>

                {/* Undo — Subtle outlined, invisible when unavailable */}
                <button
                    onClick={() => handleAction('undo')}
                    disabled={currentIndex === 0 || isProcessing}
                    className={`p-3 rounded-full border shadow-lg transition-all duration-300 ${currentIndex > 0
                        ? 'bg-white border-nature/10 text-nature hover:bg-nature hover:text-white hover:border-nature hover:scale-105 opacity-100 cursor-pointer'
                        : 'bg-white/5 border-transparent text-transparent opacity-0 pointer-events-none scale-90'
                        }`}
                    title="Revenir en arrière"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                </button>

                {/* J'ai lu — Primary filled, matching "Lancer le Mode Focus" CTA */}
                <button
                    onClick={() => handleAction('read')}
                    disabled={isProcessing}
                    className="p-4 rounded-full bg-nature text-white border border-nature shadow-lg shadow-nature/20 hover:bg-nature-light hover:scale-110 hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:scale-100"
                    title="J'ai lu (Droite)"
                >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </div>

            {/* Progress Counter */}
            <div className="absolute top-10 left-0 right-0 text-center z-20 pointer-events-none">
                <div className="inline-block bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] uppercase font-bold tracking-widest">
                    {articles.length - currentIndex} Restants
                </div>
            </div>
        </div>
    );
}
