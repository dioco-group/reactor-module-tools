export type RawBlock = {
    startLine: number; // 1-based
    endLine: number; // 1-based, inclusive
    text: string;
};

function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateActivityId(type: string, title: string): string {
    const s = slug(title || 'untitled');
    return `${type}-${s}`;
}

/**
 * Best-effort: split the raw module file into activity blocks.
 * A block starts at `$DIALOGUE/$GRAMMAR/$EXERCISE/$CHAT` and ends right before the next `$...` marker.
 *
 * Keys are activity ids matching `lc_parser.ts`'s `generateActivityId(type, title)`.
 */
export function buildActivityRawIndex(text: string): Record<string, RawBlock> {
    const lines = String(text ?? '').split('\n');
    const map: Record<string, RawBlock> = {};

    let current: { id: string; startIdx: number } | null = null;

    function close(endIdxInclusive: number) {
        if (!current) return;
        const startLine = current.startIdx + 1;
        const endLine = endIdxInclusive + 1;
        map[current.id] = {
            startLine,
            endLine,
            text: lines.slice(current.startIdx, endIdxInclusive + 1).join('\n'),
        };
        current = null;
    }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmedEnd = raw.trimEnd();

        // Only markers at column 0
        if (!trimmedEnd.startsWith('$')) continue;

        // Starting a new marker closes any currently open activity.
        if (current) close(i - 1);

        const m = trimmedEnd.match(/^\$(\w+)(?:\s+(.*))?$/);
        if (!m) continue;
        const marker = m[1];
        const title = (m[2] ?? '').trim();

        if (marker === 'DIALOGUE' || marker === 'GRAMMAR' || marker === 'EXERCISE' || marker === 'CHAT') {
            current = { id: generateActivityId(marker, title || marker), startIdx: i };
        } else {
            // $MODULE / $LESSON / unknown marker: not an activity block start.
        }
    }

    // Close trailing activity block
    if (current) close(lines.length - 1);

    return map;
}


