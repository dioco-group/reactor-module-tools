import { parseModuleFile } from './lc_parser';
import type { Module, Activity, DialogueActivity, ExerciseActivity, GrammarActivity, ChatActivity, VoiceSpec } from './lc_types';
import { marked } from 'marked';
import { lintModuleText, type Diagnostic } from './diagnostics';
import { buildActivityRawIndex, type RawBlock } from './source_index';

type ElChild = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, any> = {},
    children: ElChild[] = []
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = String(v);
        else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
        } else if (k.startsWith('on') && typeof v === 'function') {
            (node as any)[k] = v;
        } else {
            node.setAttribute(k, String(v));
        }
    }
    for (const c of children) {
        if (!c) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
}

function clear(node: HTMLElement) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function activityCardCount(a: Activity): number | null {
    switch (a.type) {
        case 'DIALOGUE':
            return (a as DialogueActivity).lines.length;
        case 'EXERCISE':
            return (a as ExerciseActivity).items.length;
        case 'GRAMMAR':
        case 'CHAT':
            return null;
    }
}

function renderMarkdown(md: string): HTMLElement {
    // Highlight {curly bracket} phrases used for audio buttons in the app.
    // This is best-effort for preview; it may also highlight braces in code blocks.
    const withPhraseSpans = md.replace(/\{([^}\n]+)\}/g, (_m, inner) => {
        const safeInner = String(inner).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<span class="phrase">{${safeInner}}</span>`;
    });

    const html = marked.parse(withPhraseSpans, {
        gfm: true,
        breaks: false,
    }) as string;

    const node = el('div', { class: 'md' });
    node.innerHTML = html;
    return node;
}

function renderDiagnostics(diags: Diagnostic[], sourceLines: string[]): HTMLElement {
    const errCount = diags.filter((d) => d.severity === 'error').length;
    const warnCount = diags.filter((d) => d.severity === 'warning').length;

    const header = el('div', { class: 'diagHeader' }, [
        el('div', { class: 'diagTitle' }, ['Diagnostics']),
        el('div', { class: 'diagMeta mono' }, [`${errCount} errors • ${warnCount} warnings`]),
    ]);

    const list =
        diags.length === 0
            ? el('div', { class: 'muted' }, ['No issues detected by linter.'])
            : el(
                  'div',
                  { class: 'diagList' },
                  diags.map((d) =>
                      el(
                          'button',
                          {
                              class: `diagItem ${d.severity}`,
                              type: 'button',
                              onclick: () => {
                                  const elLine = document.getElementById(`src-L${d.line}`);
                                  elLine?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  elLine?.classList.add('hl');
                                  window.setTimeout(() => elLine?.classList.remove('hl'), 1200);
                              },
                          },
                          [
                              el('div', { class: 'diagRow' }, [
                                  el('span', { class: 'diagBadge mono' }, [d.severity.toUpperCase()]),
                                  el('span', { class: 'diagLine mono' }, [`L${d.line}`]),
                                  el('span', { class: 'diagMsg' }, [d.message]),
                              ]),
                              (() => {
                                  const raw = sourceLines[d.line - 1] ?? '';
                                  const trimmed = raw.replace(/\t/g, '    ');
                                  const snippet = trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
                                  return el('div', { class: 'diagSnippet mono' }, [snippet]);
                              })(),
                          ]
                      )
                  )
              );

    // Always open when there are any diagnostics (errors OR warnings).
    return el('details', { class: 'details', open: diags.length > 0 }, [
        el('summary', { class: 'summary' }, ['Diagnostics (click to toggle)']),
        el('div', { class: 'card innerCard' }, [header, list]),
    ]);
}

function renderSource(text: string): HTMLElement {
    const lines = String(text ?? '').split('\n');
    const container = el('details', { class: 'details' }, [
        el('summary', { class: 'summary' }, ['Raw input (click to toggle)']),
    ]);
    const body = el('div', { class: 'source card innerCard' });
    for (let i = 0; i < lines.length; i++) {
        const n = i + 1;
        body.appendChild(
            el('div', { class: 'srcLine', id: `src-L${n}` }, [
                el('span', { class: 'srcNo mono' }, [String(n)]),
                el('span', { class: 'srcText mono' }, [lines[i]]),
            ])
        );
    }
    container.appendChild(body);
    return container;
}

function formatVoiceValue(value: string | VoiceSpec | null | undefined): HTMLElement {
    if (value === null || value === undefined) return el('span', { class: 'muted' }, ['—']);
    if (typeof value === 'string') return el('span', { class: 'mono' }, [value]);
    return el('span', {}, [
        el('span', { class: 'mono' }, [value.voice]),
        value.prompt ? el('span', { class: 'muted' }, [`  |  ${value.prompt}`]) : null,
    ]);
}

function formatVoiceLine(label: string, value: string | VoiceSpec | null | undefined): HTMLElement {
    return el('div', { class: 'kv' }, [
        el('div', { class: 'k' }, [label]),
        el('div', { class: 'v' }, [formatVoiceValue(value)]),
    ]);
}

function renderPreviewPage(params: {
    module: Module | null;
    rawIndex: Record<string, RawBlock>;
    diagnostics: Diagnostic[];
    sourceText: string;
    parseError: unknown | null;
}): HTMLElement {
    const { module: mod, rawIndex, diagnostics, sourceText, parseError } = params;
    const container = el('div', { class: 'layout' });
    const sidebar = el('aside', { class: 'sidebar' });
    const main = el('main', { class: 'main' });

    // Sidebar nav
    sidebar.appendChild(
        el('div', { class: 'sidebarHeader' }, [
            el('div', { class: 'sidebarTitle' }, ['Preview']),
            el('div', { class: 'sidebarHint' }, ['Jump to debug + lessons / activities']),
        ])
    );

    const nav = el('nav', { class: 'nav' });
    sidebar.appendChild(nav);

    // Virtual "lesson": Diagnostics
    nav.appendChild(
        el('a', { class: 'navLesson navVirtual', href: '#diagnostics' }, [
            el('span', { class: 'navLessonNum mono' }, ['DBG']),
            el('span', { class: 'navLessonTitle' }, ['Diagnostics']),
        ])
    );
    nav.appendChild(
        el('a', { class: 'navLesson navVirtual', href: '#raw-input' }, [
            el('span', { class: 'navLessonNum mono' }, ['SRC']),
            el('span', { class: 'navLessonTitle' }, ['Raw input']),
        ])
    );

    // Main: virtual lessons
    main.appendChild(
        el('section', { class: 'lesson card lessonVirtual', id: 'diagnostics' }, [
            el('div', { class: 'lessonBanner' }, [
                el('span', { class: 'lessonPill mono' }, ['DEBUG']),
                el('div', { class: 'lessonTitle' }, ['Diagnostics']),
                el('div', { class: 'lessonMeta mono' }, ['Lint results from the formal EBNF-driven rules']),
            ]),
            renderDiagnostics(diagnostics, sourceText.split('\n')),
        ])
    );
    main.appendChild(
        el('section', { class: 'lesson card lessonVirtual', id: 'raw-input' }, [
            el('div', { class: 'lessonBanner' }, [
                el('span', { class: 'lessonPill mono' }, ['SOURCE']),
                el('div', { class: 'lessonTitle' }, ['Raw input']),
                el('div', { class: 'lessonMeta mono' }, ['Line-numbered source for quick jumping']),
            ]),
            renderSource(sourceText),
        ])
    );

    if (!mod) {
        // Parser failed — still show error and keep debug sections in TOC.
        if (parseError) main.appendChild(renderError(parseError));
        container.appendChild(sidebar);
        container.appendChild(main);
        return container;
    }

    const header = el('section', { class: 'moduleHeader card' }, [
        el('div', { class: 'moduleTitleRow' }, [
            el('div', { class: 'moduleTitle' }, [mod.title]),
            el('div', { class: 'moduleMeta mono' }, [`${mod.targetLang_G} → ${mod.homeLang_G}`]),
        ]),
        el('div', { class: 'moduleSub mono' }, [
            `DIOCO_DOC_ID: ${mod.diocoDocId}`,
            mod.description ? ` • ${mod.description}` : '',
        ]),
        el('div', { class: 'pillRow' }, [
            el('span', { class: 'pill' }, [`Lessons: ${mod.lessons.length}`]),
            el('span', { class: 'pill' }, [
                `Activities: ${mod.lessons.reduce((n, l) => n + l.activities.length, 0)}`,
            ]),
        ]),
    ]);

    const voice = el('section', { class: 'card' }, [
        el('h2', { class: 'h2' }, ['Voice config']),
        el('div', { class: 'grid2' }, [
            formatVoiceLine('VOICE_DEFAULT', mod.voiceConfig.default),
            formatVoiceLine('VOICE_PROMPT', mod.voiceConfig.prompt),
            formatVoiceLine('VOICE_RESPONSE', mod.voiceConfig.response),
            formatVoiceLine('VOICE_INTRO', (mod.voiceConfig as any).introVoice),
        ]),
        el('div', { class: 'kv' }, [
            el('div', { class: 'k' }, ['VOICE_SPEAKER']),
            el(
                'div',
                { class: 'v' },
                Object.keys(mod.voiceConfig.speakers).length
                    ? [
                          el(
                              'ul',
                              { class: 'speakerList mono' },
                              Object.entries(mod.voiceConfig.speakers).map(([speaker, voice]) => {
                                  const vv =
                                      typeof voice === 'string'
                                          ? voice
                                          : `${voice.voice}${voice.prompt ? ` | ${voice.prompt}` : ''}`;
                                  return el('li', {}, [`${speaker} = ${vv}`]);
                              })
                          ),
                      ]
                    : [el('span', { class: 'muted' }, ['—'])],
            ),
        ]),
        el('div', { class: 'kv' }, [
            el('div', { class: 'k' }, ['TTS_PROMPT (module)']),
            el('div', { class: 'v' }, [mod.ttsPrompt ?? el('span', { class: 'muted' }, ['—'])]),
        ]),
    ]);

    main.appendChild(header);
    main.appendChild(voice);

    for (const [lessonIdx, lesson] of mod.lessons.entries()) {
        const lessonId = `lesson-${lessonIdx}-${slug(lesson.title) || lesson.id}`;

        nav.appendChild(
            el('a', { class: 'navLesson', href: `#${lessonId}` }, [
                el('span', { class: 'navLessonNum mono' }, [`L${lessonIdx + 1}`]),
                el('span', { class: 'navLessonTitle' }, [lesson.title]),
            ])
        );

        // Lesson section in main
        const lessonSection = el('section', { class: 'lesson card', id: lessonId }, [
            el('div', { class: 'lessonBanner' }, [
                el('span', { class: 'lessonPill mono' }, [`LESSON ${lessonIdx + 1}`]),
                el('div', { class: 'lessonTitle' }, [lesson.title]),
                el('div', { class: 'lessonMeta mono' }, [
                    `${lesson.activities.length} activities • id: ${lesson.id}`,
                ]),
            ]),
        ]);

        // Activities
        for (const [actIdx, activity] of lesson.activities.entries()) {
            const actId = `${lessonId}-act-${actIdx}-${slug(activity.title) || activity.id}`;
            nav.appendChild(
                el('a', { class: 'navAct', href: `#${actId}` }, [
                    el('span', { class: `badge badge-${activity.type.toLowerCase()} mono` }, [activity.type]),
                    el('span', { class: 'navActTitle' }, [activity.title]),
                    el('span', { class: 'navActCount mono' }, [
                        activityCardCount(activity) === null ? '' : String(activityCardCount(activity)),
                    ]),
                ])
            );

            lessonSection.appendChild(renderActivity(activity, actId, rawIndex));
        }

        main.appendChild(lessonSection);
    }

    container.appendChild(sidebar);
    container.appendChild(main);
    return container;
}

function renderActivity(activity: Activity, id: string, rawIndex?: Record<string, RawBlock>): HTMLElement {
    const raw = rawIndex?.[activity.id];
    const header = el('div', { class: 'activityHeader' }, [
        el('div', { class: 'activityTitleRow' }, [
            el('div', { class: 'activityTitleLeft' }, [
                el('span', { class: `badge badge-${activity.type.toLowerCase()} mono` }, [activity.type]),
                el('div', { class: 'activityTitle' }, [activity.title]),
            ]),
            el('div', { class: 'activityTools' }, [
                raw ? el('span', { class: 'toolPill mono' }, [`L${raw.startLine}–L${raw.endLine}`]) : null,
                activity.type === 'EXERCISE' && raw
                    ? el('details', { class: 'rawDetails' }, [
                          el('summary', { class: 'toolBtn mono' }, ['Raw']),
                          el('pre', { class: 'rawPre mono' }, [raw.text]),
                      ])
                    : null,
            ]),
        ]),
    ]);

    const body: HTMLElement[] = [];

    if (activity.type === 'DIALOGUE') {
        const a = activity as DialogueActivity;
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['INSTRUCTION']),
                el('div', { class: 'v' }, [a.instruction ?? el('span', { class: 'muted' }, ['—'])]),
            ])
        );
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['TTS_PROMPT']),
                el('div', { class: 'v' }, [a.ttsPrompt ?? el('span', { class: 'muted' }, ['—'])]),
            ])
        );
        // Review mode: show everything (speaker/text/translation/notes) with no hidden reveal.
        body.push(
            el('div', { class: 'tableWrap' }, [
                el('table', { class: 'table mono' }, [
                    el('thead', {}, [
                        el('tr', {}, [
                            el('th', { class: 'colIdx' }, ['#']),
                            el('th', { class: 'colSpeaker' }, ['SPEAKER']),
                            el('th', {}, ['LINE']),
                            el('th', {}, ['TRANSLATION']),
                            el('th', {}, ['VOCAB']),
                            el('th', {}, ['VOCAB_T']),
                            el('th', {}, ['NOTES']),
                        ]),
                    ]),
                    el(
                        'tbody',
                        {},
                        a.lines.map((line, i) =>
                            el('tr', {}, [
                                el('td', { class: 'colIdx muted' }, [String(i + 1)]),
                                el('td', { class: 'cellMuted' }, [line.speaker ?? '—']),
                                el('td', { class: 'cellStrong' }, [line.text]),
                                el('td', { class: 'cellMuted' }, [line.translation || '—']),
                                el('td', { class: 'cellMuted' }, [
                                    line.vocab?.length ? line.vocab.map((v) => v.word).join(', ') : '—',
                                ]),
                                el('td', { class: 'cellMuted' }, [
                                    line.vocab?.length
                                        ? line.vocab.map((v) => v.definition || '—').join('\n')
                                        : '—',
                                ]),
                                el('td', { class: 'cellMuted' }, [line.notes ?? '—']),
                            ])
                        )
                    ),
                ]),
            ])
        );
    } else if (activity.type === 'EXERCISE') {
        const a = activity as ExerciseActivity;
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['INSTRUCTION']),
                el('div', { class: 'v' }, [a.instruction ?? el('span', { class: 'muted' }, ['—'])]),
            ])
        );
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['TTS_PROMPT']),
                el('div', { class: 'v' }, [a.ttsPrompt ?? el('span', { class: 'muted' }, ['—'])]),
            ])
        );
        // Review mode: show everything (prompt/response + translations) with no hidden reveal.
        body.push(
            el('div', { class: 'tableWrap' }, [
                el('table', { class: 'table mono' }, [
                    el('thead', {}, [
                        el('tr', {}, [
                            el('th', { class: 'colIdx' }, ['#']),
                            el('th', { class: 'colEx' }, ['EX']),
                            el('th', {}, ['PROMPT']),
                            el('th', {}, ['PROMPT_T']),
                            el('th', {}, ['RESPONSE']),
                            el('th', {}, ['RESPONSE_T']),
                        ]),
                    ]),
                    el(
                        'tbody',
                        {},
                        a.items.map((item, i) =>
                            el('tr', { class: item.isExample ? 'rowExample' : '' }, [
                                el('td', { class: 'colIdx muted' }, [String(i + 1)]),
                                el('td', { class: 'colEx' }, [item.isExample ? 'EX' : '']),
                                el('td', { class: 'cellStrong' }, [item.prompt]),
                                el('td', { class: 'cellMuted' }, [item.promptTranslation ?? '—']),
                                el('td', { class: 'cellStrong' }, [item.response]),
                                el('td', { class: 'cellMuted' }, [item.responseTranslation ?? '—']),
                            ])
                        )
                    ),
                ]),
            ])
        );
    } else if (activity.type === 'GRAMMAR') {
        const a = activity as GrammarActivity;
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['IMAGE']),
                el('div', { class: 'v mono' }, [a.image ?? '—']),
            ])
        );
        body.push(
            el('div', { class: 'grammar' }, [
                renderMarkdown(a.content),
            ])
        );
    } else if (activity.type === 'CHAT') {
        const a = activity as ChatActivity;
        body.push(
            el('div', { class: 'kv' }, [
                el('div', { class: 'k' }, ['SCENARIO']),
                el('div', { class: 'v' }, [a.scenario]),
            ])
        );
        body.push(
            el('details', { class: 'details' }, [
                el('summary', { class: 'summary' }, ['Show INITIAL_PROMPT']),
                el('div', { class: 'chatPrompt mono' }, [a.initialPrompt]),
            ])
        );
    }

    return el('article', { class: 'activity', id }, [header, ...body]);
}

function renderError(e: unknown): HTMLElement {
    const msg = e instanceof Error ? e.message : String(e);
    return el('div', { class: 'card error' }, [
        el('div', { class: 'errorTitle' }, ['Parse error']),
        el('pre', { class: 'errorBody mono' }, [msg]),
    ]);
}

async function readFileText(f: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ''));
        r.onerror = () => reject(r.error ?? new Error('Failed reading file'));
        r.readAsText(f);
    });
}

function setup(): void {
    const fileInput = document.querySelector<HTMLInputElement>('#file')!;
    const drop = document.querySelector<HTMLElement>('#drop')!;
    const output = document.querySelector<HTMLElement>('#output')!;
    const filename = document.querySelector<HTMLElement>('#filename')!;

    async function loadText(text: string, name: string) {
        clear(output as HTMLElement);
        filename.textContent = name;
        const diags = lintModuleText(text);
        const rawIndex = buildActivityRawIndex(text);
        let parsed: Module | null = null;
        let parseErr: unknown | null = null;
        try {
            parsed = parseModuleFile(text);
        } catch (e) {
            parseErr = e;
        }
        output.appendChild(
            renderPreviewPage({
                module: parsed,
                rawIndex,
                diagnostics: diags,
                sourceText: text,
                parseError: parseErr,
            })
        );
    }

    fileInput.addEventListener('change', async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        await loadText(await readFileText(f), f.name);
    });

    // Drag/drop
    drop.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        drop.classList.remove('drag');
        const f = ev.dataTransfer?.files?.[0];
        if (!f) return;
        if (fileInput) fileInput.value = '';
        await loadText(await readFileText(f), f.name);
    });

    // Load demo (optional)
    const demoBtn = document.querySelector<HTMLButtonElement>('#demo');
    demoBtn?.addEventListener('click', async () => {
        // Works even when opened as a local file (file://), where fetch() is blocked.
        const embeddedDemo = `
$MODULE
DIOCO_DOC_ID: lc_demo
TITLE: Demo Module
DESCRIPTION: Quick demo content for the preview UI
TARGET_LANG_G: es
HOME_LANG_G: en

$LESSON Lesson 1: Greetings

$DIALOGUE Basic Greetings
INSTRUCTION: Listen and repeat.
VOCAB: buenos días
VOCAB_T: good morning
SPEAKER: Ana
LINE: Hola, buenos días.
LINE_T: Hello, good morning.
NOTES: "Buenos días" is used until noon.

$EXERCISE Practice
INSTRUCTION: Translate the following.
EXAMPLE
PROMPT: Good morning
PROMPT_T: (English) Good morning
RESPONSE: Buenos días
RESPONSE_T: (English) Good morning

$LESSON Lesson 2: Chat

$CHAT Practice Saying Goodbye
SCENARIO: You are leaving a shop after making a purchase.
INITIAL_PROMPT: You are a friendly shop owner. Say goodbye to the customer warmly.
`.trim();

        try {
            const res = await fetch('./demo.module');
            if (res.ok) {
                await loadText(await res.text(), 'demo.module');
                return;
            }
        } catch {
            // fall back
        }

        await loadText(embeddedDemo, 'demo (embedded)');
    });
}

document.addEventListener('DOMContentLoaded', setup);


