import { forwardRef, useEffect, useState } from 'react';

interface SearchBoxProps {
    onSearch: (query: string) => void;
}

/**
 * Owns the raw input value so typing only re-renders this box; the list
 * receives the debounced query.
 */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox({ onSearch }, ref) {
    const [value, setValue] = useState('');

    useEffect(() => {
        const t = window.setTimeout(() => onSearch(value.trim()), 350);
        return () => window.clearTimeout(t);
    }, [value, onSearch]);

    return (
        <div className="relative group">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-paper-muted group-focus-within:text-nature transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </span>
            <input
                ref={ref}
                type="search"
                aria-label="Rechercher dans vos articles"
                placeholder="Rechercher…  /"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        setValue('');
                        e.currentTarget.blur();
                    }
                }}
                className="input-field !py-2.5 pl-10 pr-4 !rounded-full w-full sm:w-56 sm:focus:w-72 transition-[width] text-sm"
            />
        </div>
    );
});
