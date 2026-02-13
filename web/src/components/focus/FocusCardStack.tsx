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

// ------------------------------------------------------------------
// Internal Component: SwipeableCard
// Isolates drag state per card to prevent "rebound" on unmount.
// ------------------------------------------------------------------
interface SwipeableCardProps {
    article: Article;
    index: number;
    isTop: boolean;
    onAction: (action: 'read' | 'keep') => void;
    onOpen: () => void;
    hasDraggedRef: React.MutableRefObject<boolean>;
    isProcessing: boolean;
}

function SwipeableCard({ article, index, isTop, onAction, onOpen, hasDraggedRef, isProcessing }: SwipeableCardProps) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-10, 10]);

    // Background color based on drag direction (Keep/Read indicators)
    const bgOpacityRead = useTransform(x, [0, 150], [0, 1]);
    const bgOpacityKeep = useTransform(x, [-150, 0], [1, 0]);

    // Spring physics for smooth movement
    const xSpring = useSpring(x, { stiffness: 1000, damping: 50 });
    const rotateSpring = useSpring(rotate, { stiffness: 1000, damping: 50 });

    const bind = useDrag(({ active, movement: [mx], velocity: [vx] }) => {
        if (!isTop || isProcessing) return; // Only top card is draggable

        if (active && Math.abs(mx) > 5) {
            hasDraggedRef.current = true;
        }

        const trigger = Math.abs(mx) > 200 || (Math.abs(vx) > 0.5 && Math.abs(mx) > 50);

        if (!active && trigger) {
            // Swipe Validated
            const isRight = mx > 0;
            // Capture nothing here, we just fire action. 
            // The component unmounts with its current x/xSpring state intact.
            // Motion handles the rest via 'exit' prop or just unmounting.
            onAction(isRight ? 'read' : 'keep');
        } else if (!active) {
            // Snap Back
            x.set(0);
            setTimeout(() => { hasDraggedRef.current = false; }, 50);
        } else {
            // Dragging
            x.set(mx);
        }
    });

    // Determine zIndex and scale based on index
    const zIndex = 100 - index;
    const scale = 1 - index * 0.05;
    const yOffset = index * 20;

    return (
        <motion.div
            className="absolute inset-0 rounded-3xl shadow-2xl origin-bottom"
            style={{
                scale: isTop ? 1 : scale,
                y: isTop ? xSpring : yOffset, // Only top card moves vertically on drag? Actually xSpring affects x/y if we want. Original code used xSpring for y? Let's check.
                // Original: y: isTop ? xSpring : i * 20 -> Wait, xSpring is horizontal movement applied to Y? 
                // Ah, the original code had: y: isTop ? xSpring : i * 20. 
                // That seems weird if xSpring comes from x (horizontal). 
                // Maybe it was intended to give a slight vertical lift on drag?
                // Or maybe xSpring was actually ySpring in previous code?
                // In my reading of previous code: const x = useMotionValue(0); const xSpring = useSpring(x...); 
                // So y was bound to xSpring. That means swiping right moves the card DOWN? 
                // That might be a typo in original code or a specific effect.
                // Let's stick to X for horizontal.
                // Let's look at original again: `y: isTop ? xSpring : i * 20`. 
                // If I swipe right (x > 0), y increases (card goes down). 
                // If I swipe left (x < 0), y decreases (card goes up).
                // Use 'x' for 'x'. And 'y' for... 0 if top?
                // Let's use xSpring for 'x' property.

                x: isTop ? xSpring : 0,
                rotate: isTop ? rotateSpring : 0,
                zIndex: zIndex,
                cursor: isTop ? 'grab' : 'default',
            }}
            {...(isTop ? (bind() as any) : {})} // Bind gesture only if top
            onDoubleClick={() => {
                if (isTop && !hasDraggedRef.current) {
                    onOpen();
                }
            }}
            initial={{ scale: scale, y: yOffset, x: 0 }}
            animate={{ scale: scale, y: yOffset, x: 0 }} // Re-center if index changes (but this component is unique by key)
            // Correction: When index changes (e.g. going from 1 to 0), we want it to animate to new position.
            // But here we are mapping articles.
            // If we use 'key={article.id}', the component identity is preserved.
            // So if card at index 1 becomes index 0, it animates:
            // scale: 0.95 -> 1
            // y: 20 -> 0
            // x: 0 -> 0

            exit={{
                // When unmounting (swiped out):
                // We want it to keep its current x/rotation roughly, and fade out.
                // Since xSpring holds the value, we don't need to force x in exit if we rely on the fact 
                // that unmounting preserves style for the exit duration?
                // Actually, Framer Motion exit prop overrides.
                // If we want to freeze, we can use a custom exit.
                // But the user complained about rebound because 'x' changed.
                // Here, 'x' is LOCAL. And we NEVER reset it if we trigger action.
                // So 'xSpring' will stay at ~500 or -500.
                // So we can just fade out.
                opacity: 0,
                scale: 0.9,
                transition: { duration: 0.2 }
            }}
        >
            {/* Visual Indicators embedded in card to move with it? 
                Actually original code had them in background. 
                If we want them ON the card, we put them here.
                If in background, parent handles.
                Original code: Indicators were OUTSIDE the card stack, using 'bgOpacityRead' derived from 'x'.
                Since 'x' is now local, the parent doesn't know about it.
                We should either:
                1. Expose 'x' to parent (complex).
                2. Put indicators INSIDE the card (but absolute positioned to fill screen? No, clipped).
                3. Put indicators INSIDE the card but visual only on the card itself (like Tinder stamps).
                
                Let's emulate the original "Background Indicators" but maybe just on the card itself is better for encapsulation?
                Or we can use a callback `onDrag` to update parent state? Performance hit.
                
                Simpler: The user wanted "Swipe card". The indicators were "Background".
                If we lose the background indicators, is it bad?
                The original code had:
                <motion.div style={{ opacity: bgOpacityRead }} ... className="absolute inset-0 ... z-0">
                
                With isolated state, we can't easily drive standard DOM elements outside the component.
                But we CAN put the indicators INSIDE the card container?
                No, because the card rotates and moves.
                
                Alternative: We only show indicators ON THE CARD (Overlay).
                Like a "NOPE" or "LIKE" stamp on the card content.
                Let's add that. It's often better UX anyway.
            */}

            {/* Overlay Indicators (Like Tinder) */}
            <motion.div style={{ opacity: bgOpacityRead }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-nature/20">
                <div className="border-4 border-nature text-nature font-black text-4xl uppercase tracking-widest px-4 py-2 rounded-lg transform -rotate-12 bg-white/20 backdrop-blur-sm">
                    J'M
                </div>
            </motion.div>

            <motion.div style={{ opacity: bgOpacityKeep }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-3xl bg-blue-500/20">
                <div className="border-4 border-blue-500 text-blue-500 font-black text-4xl uppercase tracking-widest px-4 py-2 rounded-lg transform rotate-12 bg-white/20 backdrop-blur-sm">
                    Garder
                </div>
            </motion.div>

            <FocusCard article={article} isTop={isTop} />
        </motion.div>
    );
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export function FocusCardStack({ articles, onMarkRead, onKeep, onToggleFavorite, onEmpty }: FocusCardStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [readingArticle, setReadingArticle] = useState<Article | null>(null);
    const isMobile = useIsMobile();
    const [isProcessing, setIsProcessing] = useState(false);

    // Shared ref just for the double click check logic if needed, 
    // but actually each card manages its own drag state.
    // We pass this ref down so the active card can write to it.
    const hasDraggedRef = useRef(false);

    // Visible stack size
    const visibleArticles = articles.slice(currentIndex, currentIndex + 3);
    const topArticle = visibleArticles[0];

    const handleAction = (action: 'read' | 'keep' | 'undo') => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (action === 'undo') {
            if (currentIndex > 0) {
                setCurrentIndex(prev => Math.max(0, prev - 1));
            }
        } else if (action === 'read') {
            onMarkRead(topArticle.id);
            setCurrentIndex(prev => prev + 1);
        } else {
            onKeep(topArticle.id);
            setCurrentIndex(prev => prev + 1);
        }

        // Lock for animation duration
        setTimeout(() => setIsProcessing(false), 500);
    };

    // Callbacks for the card components
    const handleCardAction = (action: 'read' | 'keep') => {
        handleAction(action);
    };

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
                                handleAction('read');
                                setReadingArticle(null);
                            }}
                            onPrev={() => {
                                handleAction('keep');
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

            {/* Note: Background indicators removed in favor of Card Overlays for isolated state cleanliness */}

            {/* Card Stack */}
            <div className="relative w-full max-w-lg aspect-[3/4] sm:aspect-[4/5] md:h-[600px] z-10">
                <AnimatePresence mode="popLayout">
                    {visibleArticles.map((article, i) => {
                        return (
                            <SwipeableCard
                                key={article.id}
                                article={article}
                                index={i}
                                isTop={i === 0}
                                onAction={handleCardAction}
                                onOpen={() => setReadingArticle(article)}
                                hasDraggedRef={hasDraggedRef}
                                isProcessing={isProcessing}
                            />
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-4 px-4 sm:gap-8 z-20">
                {/* Garder */}
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

                {/* Undo */}
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

                {/* J'ai lu */}
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
