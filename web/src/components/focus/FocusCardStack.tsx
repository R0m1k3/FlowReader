import { useState, useEffect } from 'react';
import { useDrag } from '@use-gesture/react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import type { Article } from '../../api/articles';
import { FocusCard } from './FocusCard';
import { FocusArticleView } from './FocusArticleView';

interface FocusCardStackProps {
    articles: Article[];
    onMarkRead: (id: string) => void;
    onKeep: (id: string) => void;
    onEmpty: () => void;
}

export function FocusCardStack({ articles, onMarkRead, onKeep, onEmpty }: FocusCardStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [readingArticle, setReadingArticle] = useState<Article | null>(null);
    const [exitX, setExitX] = useState(0);

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

    const bind = useDrag(({ active, movement: [mx], velocity: [vx] }) => {
        if (readingArticle) return; // Disable drag when reading

        const trigger = Math.abs(mx) > 200 || (Math.abs(vx) > 0.5 && Math.abs(mx) > 50);

        if (!active && trigger) {
            // Swipe Validé
            const isRight = mx > 0;
            setExitX(isRight ? 500 : -500); // Trigger exit animation

            // Logic handled after animation completes via AnimatePresence onExitComplete
            // But here we need to trigger state change. 
            // Better approach: State change triggers exit animation naturally?
            // No, libraries like Framer Motion handle exit animations when components are removed from DOM.
            // So we just need to advance index.

            if (isRight) {
                onMarkRead(topArticle.id);
            } else {
                onKeep(topArticle.id);
            }

            setCurrentIndex(prev => prev + 1);
            x.set(0); // Reset for next card
        } else {
            // Dragging or Snap Back
            x.set(active ? mx : 0);
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
                    <FocusArticleView
                        article={readingArticle}
                        onClose={() => setReadingArticle(null)}
                        onNext={(action) => {
                            setReadingArticle(null);
                            if (action === 'read') onMarkRead(readingArticle.id);
                            else onKeep(readingArticle.id);
                            setCurrentIndex(prev => prev + 1);
                        }}
                    />
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
                                onClick={() => isTop && setReadingArticle(article)}
                                animate={{ scale: 1 - i * 0.05, y: i * 20 }}
                                exit={{ x: exitX, opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            >
                                <FocusCard article={article} isTop={isTop} />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Static Action Buttons (for mouse users who prefer clicking) */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-8 z-20">
                <button
                    onClick={() => {
                        onKeep(topArticle.id);
                        setCurrentIndex(prev => prev + 1);
                    }}
                    className="p-4 rounded-full bg-white shadow-lg text-blue-500 hover:bg-blue-50 hover:scale-110 transition-all"
                    title="Garder (Gauche)"
                >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" transform="rotate(-90 12 12)" />
                    </svg>
                </button>
                <button
                    onClick={() => {
                        onMarkRead(topArticle.id);
                        setCurrentIndex(prev => prev + 1);
                    }}
                    className="p-4 rounded-full bg-nature shadow-lg text-white hover:bg-nature-light hover:scale-110 transition-all"
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
