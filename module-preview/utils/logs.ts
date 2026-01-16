type Logger = {
    crit: (...args: any[]) => void;
    e: (...args: any[]) => void;
    w: (...args: any[]) => void;
    i: (...args: any[]) => void;
    d: (...args: any[]) => void;
    v: (...args: any[]) => void;
    time: <T>(label: string, fn: () => T) => T;
    timeAsync: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
};

/**
 * Browser-safe logger with the same surface area as dioco-base's `diocoLogger`.
 * Keeps `lc_parser.ts` unchanged apart from import rewiring.
 */
export function diocoLogger(section: string): Logger {
    const prefix = `[DIOCO_${section}]`;

    const log = (...args: any[]) => console.log(prefix, ...args);
    const warn = (...args: any[]) => console.warn(prefix, ...args);
    const err = (...args: any[]) => console.error(prefix, ...args);

    function time<T>(label: string, fn: () => T): T {
        const start = performance.now();
        try {
            return fn();
        } finally {
            const duration = performance.now() - start;
            log(`${label} took ${duration.toFixed(2)}ms`);
        }
    }

    async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            log(`${label} took ${duration.toFixed(2)}ms`);
        }
    }

    return {
        crit: err,
        e: err,
        w: warn,
        i: log,
        d: log,
        v: log,
        time,
        timeAsync,
    };
}


