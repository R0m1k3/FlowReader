/**
 * Prepares sanitized article HTML for display: lazy-loads images, drops the
 * first image when it duplicates the hero, and strips tracking pixels.
 * The HTML is already sanitized server-side; DOMParser never runs scripts.
 */
export function prepareArticleHtml(html: string, heroUrl?: string): string {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const imgs = Array.from(doc.body.querySelectorAll('img'));
    const heroKey = heroUrl ? stripQuery(heroUrl) : '';

    imgs.forEach((img, i) => {
        const src = img.getAttribute('src') ?? '';
        if (!src || img.getAttribute('width') === '1' || img.getAttribute('height') === '1') {
            img.remove();
            return;
        }
        if (i === 0 && heroKey && stripQuery(src) === heroKey) {
            (img.closest('figure') ?? img).remove();
            return;
        }
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('referrerpolicy', 'no-referrer');
    });

    // Empty paragraphs left behind by removed images / feed markup.
    doc.body.querySelectorAll('p').forEach((p) => {
        if (!p.textContent?.trim() && !p.querySelector('img,video,iframe')) p.remove();
    });

    return doc.body.innerHTML;
}

function stripQuery(u: string) {
    const i = u.search(/[?#]/);
    return i === -1 ? u : u.slice(0, i);
}
