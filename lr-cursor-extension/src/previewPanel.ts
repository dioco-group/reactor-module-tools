import * as vscode from "vscode";
import * as path from "path";
import { parseModuleFile } from "./parser/moduleParser";
import { lintModuleText } from "./parser/diagnostics";
import {
  Module,
  Activity,
  DialogueActivity,
  SelectActivity,
  SelectItem,
  SelectOption,
  ProduceActivity,
  ProduceItem,
  GrammarActivity,
  ChatActivity,
  DialogueLine,
  VoiceSpec,
} from "./parser/types";
import { Diagnostic } from "./parser/diagnostics";

export class ModulePreviewPanel {
  static currentPanel: ModulePreviewPanel | undefined;
  private panel: vscode.WebviewPanel;
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentDocumentDir: vscode.Uri | null = null;
  private currentModuleBaseName: string | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri, docDir?: vscode.Uri): ModulePreviewPanel {
    const column = vscode.ViewColumn.Beside;
    if (ModulePreviewPanel.currentPanel) {
      ModulePreviewPanel.currentPanel.panel.reveal(column);
      return ModulePreviewPanel.currentPanel;
    }
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((f) => f.uri);
    const roots = [vscode.Uri.joinPath(extensionUri, "media"), ...workspaceRoots];
    // Ensure the module's own folder (which holds its images/audio clips) is
    // loadable even when no workspace folder is open.
    if (docDir) roots.push(docDir);
    const panel = vscode.window.createWebviewPanel(
      "lr.modulePreview",
      "Module Preview",
      column,
      {
        enableScripts: false,
        localResourceRoots: roots,
      },
    );
    ModulePreviewPanel.currentPanel = new ModulePreviewPanel(
      panel,
      extensionUri,
    );
    return ModulePreviewPanel.currentPanel;
  }

  update(document: vscode.TextDocument): void {
    this.currentDocumentDir = vscode.Uri.file(path.dirname(document.fileName));
    this.currentModuleBaseName = path.basename(document.fileName, ".module");

    const text = document.getText();
    let html: string;
    try {
      const mod = parseModuleFile(text);
      html = this.renderModule(mod);
    } catch (e: any) {
      const diagnostics = lintModuleText(text);
      html = this.renderError(e.message || String(e), diagnostics);
    }
    this.panel.title = `Preview: ${document.fileName.split("/").pop()}`;
    this.panel.webview.html = html;
  }

  private renderModule(mod: Module): string {
    const toc = this.renderTOC(mod);
    const content = this.renderContent(mod);
    return this.wrapHtml(`
      <div class="layout">
        <nav class="toc">${toc}</nav>
        <main class="content">${content}</main>
      </div>
    `);
  }

  private renderTOC(mod: Module): string {
    let html = `<div class="toc-title">${esc(mod.title)}</div>`;
    html += `<div class="toc-meta">${esc(langName(mod.targetLang_G))} <span class="muted">→</span> ${esc(langName(mod.homeLang_G))}</div>`;
    for (const lesson of mod.lessons) {
      html += `<div class="toc-lesson"><a href="#${esc(lesson.id)}">${esc(lesson.title)}</a></div>`;
      for (const act of lesson.activities) {
        html += `<div class="toc-activity"><a href="#${esc(act.id)}">${activityTypeDot(act.type)} ${esc(act.title)}</a></div>`;
      }
    }
    return html;
  }

  private renderContent(mod: Module): string {
    let html = "";
    html += `<header class="module-header">`;
    html += `<h1>${esc(mod.title)}</h1>`;
    if (mod.description)
      html += `<p class="description">${esc(mod.description)}</p>`;
    html += `<div class="meta">`;
    html += `<span class="lang-badge"><span class="lang-key">Target</span><span class="lang-name">${esc(langName(mod.targetLang_G))}</span></span>`;
    html += `<span class="lang-badge"><span class="lang-key">Home</span><span class="lang-name">${esc(langName(mod.homeLang_G))}</span></span>`;
    html += `<span class="doc-id">${esc(mod.moduleKey)}</span></div>`;
    html += this.renderVoiceConfig(mod);
    html += `</header>`;
    for (const lesson of mod.lessons) {
      html += `<section class="lesson" id="${esc(lesson.id)}">`;
      html += `<h2 class="lesson-title">${esc(lesson.title)}</h2>`;
      for (const act of lesson.activities) {
        html += this.renderActivity(act);
      }
      html += `</section>`;
    }
    return html;
  }

  private renderVoiceConfig(mod: Module): string {
    const vc = mod.voiceConfig;
    const entries: string[] = [];
    if (vc.default)
      entries.push(
        `<span class="voice-label">Default:</span> ${voiceSpecStr(vc.default)}`,
      );
    if (vc.introVoice)
      entries.push(
        `<span class="voice-label">Intro:</span> ${voiceSpecStr(vc.introVoice)}`,
      );
    if (vc.prompt)
      entries.push(
        `<span class="voice-label">Prompt:</span> ${voiceSpecStr(vc.prompt)}`,
      );
    if (vc.response)
      entries.push(
        `<span class="voice-label">Response:</span> ${voiceSpecStr(vc.response)}`,
      );
    for (const [name, spec] of Object.entries(vc.speakers)) {
      entries.push(
        `<span class="voice-label">${esc(name)}:</span> ${voiceSpecStr(spec)}`,
      );
    }
    if (entries.length === 0) return "";
    return `<div class="voice-config"><div class="voice-config-title">Voice Configuration</div>${entries.map((e) => `<div class="voice-entry">${e}</div>`).join("")}</div>`;
  }

  private renderActivity(act: Activity): string {
    let html = `<div class="activity activity-${act.type.toLowerCase()}" id="${esc(act.id)}">`;
    html += `<h3>${activityTypeChip(act.type)} <span class="activity-title">${esc(act.title)}</span></h3>`;
    if (act.intro)
      html += `<div class="intro"><span class="field-label">INTRO</span> ${esc(act.intro)}</div>`;
    switch (act.type) {
      case "DIALOGUE":
        html += this.renderDialogue(act);
        break;
      case "SELECT":
        html += this.renderSelect(act);
        break;
      case "PRODUCE":
        html += this.renderProduce(act);
        break;
      case "GRAMMAR":
        html += this.renderGrammar(act);
        break;
      case "CHAT":
        html += this.renderChat(act);
        break;
    }
    html += `</div>`;
    return html;
  }

  private renderAudio(file: string, _label: string): string {
    const src = this.resolveAssetSrc(file);
    return (
      `<div class="audio-ref">` +
      `<audio class="clip" controls preload="none" src="${esc(src)}"></audio></div>`
    );
  }

  // Image only — no filename caption. The filename rides `alt`, so a missing image
  // renders a labeled placeholder box (styled via .asset-img) instead of nothing.
  private renderImage(file: string): string {
    const src = this.resolveAssetSrc(file);
    return `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="${esc(file)}" /></div>`;
  }

  private renderDialogue(act: DialogueActivity): string {
    let html = "";
    if (act.instruction)
      html += `<div class="instruction"><span class="field-label">INSTRUCTION</span> ${esc(act.instruction)}</div>`;
    if (act.repeat) html += `<div class="flags">${flagChip("repeat")}</div>`;
    if (act.image) html += this.renderImage(act.image);
    html += `<div class="dialogue-lines">`;
    for (const line of act.lines) {
      html += this.renderDialogueLine(line);
    }
    html += `</div>`;
    return html;
  }

  private renderDialogueLine(line: DialogueLine): string {
    let html = `<div class="dialogue-line">`;
    if (line.speaker) html += `<div class="speaker">${esc(line.speaker)}</div>`;
    if (line.image) html += this.renderImage(line.image);
    if (line.vocab && line.vocab.length > 0) {
      html += `<div class="vocab-list">`;
      for (const v of line.vocab) {
        html += `<span class="vocab-item"><span class="vocab-word">${esc(v.word)}</span>`;
        if (v.definition)
          html += ` <span class="vocab-def">${esc(v.definition)}</span>`;
        html += `</span>`;
      }
      html += `</div>`;
    }
    html += `<div class="line-text">${esc(line.text)}</div>`;
    if (line.translation)
      html += `<div class="line-translation">${esc(line.translation)}</div>`;
    if (line.audio) html += this.renderAudio(line.audio, "AUDIO");
    if (line.notes) html += `<div class="line-notes">${esc(line.notes)}</div>`;
    html += `</div>`;
    return html;
  }

  private renderSelect(act: SelectActivity): string {
    let html = "";
    if (act.instruction)
      html += `<div class="instruction"><span class="field-label">INSTRUCTION</span> ${esc(act.instruction)}</div>`;
    let selFlags = "";
    if (act.multi) selFlags += flagChip("multi");
    if (act.showPrompt) selFlags += flagChip("showprompt");
    if (act.repeat) selFlags += flagChip("repeat");
    if (selFlags) html += `<div class="flags">${selFlags}</div>`;
    if (act.image) html += this.renderImage(act.image);
    if (act.options.length) html += this.renderOptions(act.options, "Options");
    html += `<div class="exercise-items">`;
    for (let i = 0; i < act.items.length; i++) {
      html += this.renderSelectItem(act.items[i], i + 1, act.options);
    }
    html += `</div>`;
    return html;
  }

  private optionVal(o: SelectOption): string {
    return o.image
      ? `<img class="option-img" src="${esc(this.resolveAssetSrc(o.image))}" alt="${esc(o.image)}" />`
      : esc(o.text || "");
  }

  private renderOptions(options: SelectOption[], label: string, correctIds?: string[]): string {
    const correct = new Set(correctIds || []);
    let html = `<div class="options"><div class="field-label">${esc(label)}</div>`;
    for (const o of options) {
      const isC = correct.has(o.id);
      html += `<div class="option${isC ? " correct" : ""}"><b class="opt-id">${esc(o.id)}</b> <span class="opt-val">${this.optionVal(o)}</span>${isC ? `<span class="opt-check">\u2713</span>` : ""}</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Shared-pool items reference the answer by id; resolve it back to the option's
  // content and show it as a single highlighted "correct answer" chip.
  private renderAnswer(answerIds: string[], options?: SelectOption[]): string {
    const byId = new Map((options || []).map((o) => [o.id, o]));
    let html = `<div class="options"><div class="field-label">Answer</div>`;
    for (const id of answerIds) {
      const o = byId.get(id);
      const val = o ? this.optionVal(o) : "";
      html += `<div class="option correct"><b class="opt-id">${esc(id)}</b> <span class="opt-val">${val}</span><span class="opt-check">\u2713</span></div>`;
    }
    html += `</div>`;
    return html;
  }

  private renderSelectItem(item: SelectItem, num: number, sharedOptions?: SelectOption[]): string {
    const cls = item.isExample ? "exercise-item example" : "exercise-item";
    let html = `<div class="${cls}">`;
    if (item.isExample) html += `<div class="example-badge">Example</div>`;
    html += `<div class="exercise-num">${num}</div>`;
    html += `<div class="exercise-body">`;
    if (item.prompt)
      html += `<div class="prompt">${fieldChip("prompt")} ${esc(item.prompt)}</div>`;
    if (item.template)
      html += `<div class="template">${fieldChip("template")} <span class="template-text">${esc(item.template)}</span></div>`;
    if (item.promptImage) html += this.renderImage(item.promptImage);
    if (item.audio) html += this.renderAudio(item.audio, "AUDIO");
    if (item.options && item.options.length) {
      // per-item options: outline the correct one (no separate answer line)
      html += this.renderOptions(item.options, "Options", item.answer);
    } else {
      // shared option pool: show the correct option resolved from the pool
      html += this.renderAnswer(item.answer, sharedOptions);
    }
    if (item.feedback)
      html += `<div class="prompt-t"><span class="field-label">FEEDBACK</span> ${esc(item.feedback)}</div>`;
    html += `</div></div>`;
    return html;
  }

  private renderProduce(act: ProduceActivity): string {
    let html = "";
    if (act.instruction)
      html += `<div class="instruction"><span class="field-label">INSTRUCTION</span> ${esc(act.instruction)}</div>`;
    let prodFlags = flagChip("input", act.input) + flagChip("check", act.check);
    if (act.showPrompt) prodFlags += flagChip("showprompt");
    if (act.repeat) prodFlags += flagChip("repeat");
    html += `<div class="flags">${prodFlags}</div>`;
    if (act.image) html += this.renderImage(act.image);
    html += `<div class="exercise-items">`;
    for (let i = 0; i < act.items.length; i++) {
      html += this.renderProduceItem(act.items[i], i + 1);
    }
    html += `</div>`;
    return html;
  }

  private renderProduceItem(item: ProduceItem, num: number): string {
    const cls = item.isExample ? "exercise-item example" : "exercise-item";
    let html = `<div class="${cls}">`;
    if (item.isExample) html += `<div class="example-badge">Example</div>`;
    html += `<div class="exercise-num">${num}</div>`;
    html += `<div class="exercise-body">`;
    if (item.prompt)
      html += `<div class="prompt">${fieldChip("prompt")} ${esc(item.prompt)}</div>`;
    if (item.template)
      html += `<div class="template">${fieldChip("template")} <span class="template-text">${esc(item.template)}</span></div>`;
    if (item.promptImage) html += this.renderImage(item.promptImage);
    if (item.audio) html += this.renderAudio(item.audio, "AUDIO");
    if (item.response != null)
      html += `<div class="response">${fieldChip("response")} ${esc(item.response)}</div>`;
    if (item.responseAudio) html += this.renderAudio(item.responseAudio, "RESPONSE_AUDIO");
    if (item.accept && item.accept.length)
      html += `<div class="prompt-t"><span class="field-label">ACCEPT</span> ${esc(item.accept.join(" | "))}</div>`;
    if (item.rubric)
      html += `<div class="prompt-t"><span class="field-label">RUBRIC</span> ${esc(item.rubric)}</div>`;
    html += `</div></div>`;
    return html;
  }

  private renderGrammar(act: GrammarActivity): string {
    return `<div class="grammar-content">${renderMarkdown(act.content, (src) => this.resolveAssetSrc(src))}</div>`;
  }

  private renderChat(act: ChatActivity): string {
    let html = "";
    html += `<div class="chat-field"><span class="field-label">SCENARIO</span><div class="chat-text">${esc(act.scenario)}</div></div>`;
    html += `<div class="chat-field"><span class="field-label">INITIAL_PROMPT</span><div class="chat-text">${esc(act.initialPrompt)}</div></div>`;
    return html;
  }

  private renderError(message: string, diagnostics: Diagnostic[]): string {
    let html = `<div class="error"><h2>Parse Error</h2><pre>${esc(message)}</pre>`;
    if (diagnostics && diagnostics.length > 0) {
      html += `<h3>Issues Found</h3><ul class="diagnostics">`;
      for (const d of diagnostics) {
        const cls = d.severity === "error" ? "diag-error" : "diag-warning";
        html += `<li class="${cls}"><span class="diag-line">Line ${d.line}</span> ${esc(d.message)}`;
        if (d.code) html += ` <span class="diag-code">${esc(d.code)}</span>`;
        html += `</li>`;
      }
      html += `</ul>`;
    }
    html += `</div>`;
    return this.wrapHtml(html);
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
  }

  dispose(): void {
    ModulePreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()!.dispose();
  }

  private resolveAssetSrc(assetPath: string): string {
    if (!assetPath) return assetPath;
    // Allow absolute URLs / data URIs
    if (/^(https?:)?\/\//.test(assetPath) || assetPath.startsWith("data:")) return assetPath;
    if (!this.currentDocumentDir) return assetPath;

    let cleaned = assetPath.trim();
    while (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
    while (cleaned.startsWith("../")) cleaned = cleaned.slice(3);

    // Module folder convention: bare filenames resolve to <moduleBaseName>/<filename>
    if (!cleaned.includes("/") && this.currentModuleBaseName) {
      cleaned = `${this.currentModuleBaseName}/${cleaned}`;
    }

    const uri = vscode.Uri.joinPath(this.currentDocumentDir, ...cleaned.split("/"));
    return this.panel.webview.asWebviewUri(uri).toString();
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activityTypeChip(type: string): string {
  const t = type.toLowerCase();
  const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return `<span class="type-chip type-${t}">${esc(label)}</span>`;
}

function activityTypeDot(type: string): string {
  return `<span class="type-dot type-${type.toLowerCase()}" title="${esc(type)}"></span>`;
}

function fieldChip(kind: string): string {
  const letters: Record<string, string> = {
    prompt: "P",
    response: "R",
    template: "T",
    answer: "A",
  };
  const letter = letters[kind] || "?";
  return `<span class="fc fc-${kind}" title="${kind.toUpperCase()}">${letter}</span>`;
}

function flagChip(kind: string, value?: string): string {
  const labels: Record<string, string> = {
    repeat: "REPEAT",
    showprompt: "SHOW_PROMPT",
    multi: "MULTI",
    input: "INPUT",
    check: "CHECK",
  };
  const lab = labels[kind] || kind.toUpperCase();
  const v = value ? ` <b>${esc(value)}</b>` : "";
  return `<span class="chip chip-${kind}">${lab}${v}</span>`;
}

function langName(code: string): string {
  const m: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    ar: "Arabic",
    de: "German",
    it: "Italian",
    ru: "Russian",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    pt: "Portuguese",
    vi: "Vietnamese",
  };
  const key = (code || "").toLowerCase();
  return m[key] || code;
}

function voiceSpecStr(spec: string | VoiceSpec): string {
  if (typeof spec === "string") return esc(spec);
  let s = `<span class="voice-name">${esc(spec.voice)}</span>`;
  if (spec.prompt)
    s += ` <span class="voice-prompt">${esc(spec.prompt)}</span>`;
  return s;
}

function renderMarkdown(md: string, resolveImage?: (src: string) => string): string {
  const images: string[] = [];
  const withPlaceholders = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const resolved = resolveImage ? resolveImage(String(src)) : String(src);
    const tag = `<img class="md-img" src="${esc(String(resolved))}" alt="${esc(String(alt))}" />`;
    images.push(tag);
    return `@@IMG${images.length - 1}@@`;
  });

  let html = esc(withPlaceholders);
  // {curly bracket} phrases -> highlighted audio buttons
  html = html.replace(/\{([^}]+)\}/g, '<span class="audio-phrase">$1</span>');
  html = html.replace(/^### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^## (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/^\|(.+)\|$/gm, (match: string) => {
    const cells = match
      .split("|")
      .filter((c: string) => c.trim())
      .map((c: string) => c.trim());
    if (cells.every((c: string) => /^[-:]+$/.test(c))) return "";
    const tag = "td";
    return (
      "<tr>" +
      cells.map((c: string) => `<${tag}>${c}</${tag}>`).join("") +
      "</tr>"
    );
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, "<table>$&</table>");
  html = html.replace(/\n\n+/g, "</p><p>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h[45]>)/g, "$1");
  html = html.replace(/(<\/h[45]>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<table>)/g, "$1");
  html = html.replace(/(<\/table>)\s*<\/p>/g, "$1");
  html = html.replace(/@@IMG(\d+)@@/g, (_m, idx) => images[Number(idx)] || "");
  return html;
}

const CSS = `
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);
  --border: var(--vscode-panel-border, #333);
  --accent: var(--vscode-textLink-foreground, #4fc1ff);
  --muted: var(--vscode-descriptionForeground, #888);
  --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
  --success: #4ec9b0;
  --warning: #dcdcaa;
  /* neon palette — bright chip backgrounds, dark chip text for contrast on any theme */
  --chip-fg: #0a0e17;
  --c-dialogue: #c77dff;
  --c-select:   #22d3ee;
  --c-produce:  #2bf08a;
  --c-grammar:  #ffd23f;
  --c-chat:     #ff5fb0;
  --c-prompt:   #22d3ee;
  --c-response: #2bf08a;
  --c-template: #ffd23f;
  --c-answer:   #2bf08a;
  --c-repeat:   #b388ff;
  --c-show:     #ff9f1c;
  --c-multi:    #2ee6c5;
  --c-input:    #22d3ee;
  --c-check:    #2bf08a;
  --correct:    #2bf08a;
  --template-text: #ffce5c;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--vscode-font-family, system-ui); font-size: 13px; color: var(--fg); background: var(--bg); line-height: 1.5; }

.layout { display: flex; min-height: 100vh; }
.toc { width: 172px; min-width: 172px; padding: 10px 8px; border-right: 1px solid var(--border); position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.toc-title { font-weight: 600; font-size: 13px; margin-bottom: 3px; }
.toc-meta { color: var(--muted); font-size: 11px; margin-bottom: 10px; }
.toc-lesson { margin-top: 8px; font-weight: 600; font-size: 12px; }
.toc-activity { padding-left: 4px; font-size: 12px; display: flex; align-items: center; gap: 5px; }
.toc-activity a { display: flex; align-items: center; gap: 5px; }
.toc a { color: var(--fg); text-decoration: none; }
.toc a:hover { color: var(--accent); }
.type-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; display: inline-block; }

.content { flex: 1; padding: 14px 16px; max-width: 880px; min-width: 0; }

.module-header { margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.module-header h1 { font-size: 19px; margin-bottom: 6px; }
.description { color: var(--muted); margin-bottom: 8px; }
.meta { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
.lang-badge { display: inline-flex; align-items: stretch; border-radius: 4px; overflow: hidden; border: 1px solid var(--border); font-size: 11px; }
.lang-key { background: rgba(127,127,127,0.18); color: var(--muted); padding: 2px 7px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
.lang-name { padding: 2px 8px; font-weight: 600; }
.doc-id { color: var(--muted); font-family: monospace; font-size: 11px; }

.voice-config { margin-top: 12px; padding: 8px 12px; background: var(--card-bg); border-radius: 4px; border: 1px solid var(--border); }
.voice-config-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.voice-entry { font-size: 12px; margin: 2px 0; }
.voice-label { color: var(--muted); }
.voice-name { color: var(--accent); font-family: monospace; }
.voice-prompt { color: var(--muted); font-style: italic; }

.lesson { margin-bottom: 26px; }
.lesson-title { font-size: 16px; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

.activity { margin-bottom: 16px; padding: 10px 12px; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border); }
.activity h3 { font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.activity-title { flex: 1 1 auto; min-width: 0; }

/* activity-type chip (header) + dot (toc) */
.type-chip { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--chip-fg); padding: 2px 7px; border-radius: 4px; flex: 0 0 auto; }
.type-dialogue { background: var(--c-dialogue); } .type-dot.type-dialogue { background: var(--c-dialogue); }
.type-select   { background: var(--c-select); }   .type-dot.type-select   { background: var(--c-select); }
.type-produce  { background: var(--c-produce); }  .type-dot.type-produce  { background: var(--c-produce); }
.type-grammar  { background: var(--c-grammar); }  .type-dot.type-grammar  { background: var(--c-grammar); }
.type-chat     { background: var(--c-chat); }     .type-dot.type-chat     { background: var(--c-chat); }

/* small inline label for INTRO / INSTRUCTION / IMAGE / ACCEPT / RUBRIC / FEEDBACK */
.field-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--fg); opacity: .55; margin-right: 5px; }

/* P / R / T / A letter boxes */
.fc { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 3px; color: var(--chip-fg); font-weight: 800; font-size: 10px; vertical-align: middle; margin-right: 5px; flex: 0 0 auto; }
.fc-prompt { background: var(--c-prompt); }
.fc-response { background: var(--c-response); }
.fc-template { background: var(--c-template); }
.fc-answer { background: var(--c-answer); }

.intro { color: var(--muted); font-style: italic; margin-bottom: 8px; padding: 5px 8px; border-left: 2px solid var(--accent); }
.instruction { color: var(--fg); opacity: .8; margin-bottom: 8px; font-size: 12px; }

.dialogue-lines { display: flex; flex-direction: column; gap: 8px; }
.dialogue-line { padding: 7px 0; border-bottom: 1px solid var(--border); }
.dialogue-line:last-child { border-bottom: none; }
.speaker { font-weight: 600; color: var(--accent); font-size: 12px; margin-bottom: 2px; }
.line-text { font-size: 15px; margin-bottom: 2px; }
.line-translation { color: var(--muted); font-size: 13px; }
.line-notes { color: var(--warning); font-size: 12px; margin-top: 4px; padding: 4px 8px; background: rgba(220, 220, 170, 0.08); border-radius: 3px; }
.asset-block { margin: 6px 0 8px; }
/* width:100% keeps a full-width box; alt = filename, so a missing image renders a
   labeled placeholder strip (min-height) instead of nothing. */
.asset-img { display: block; width: 100%; max-height: 220px; min-height: 38px; object-fit: contain; background: rgba(127,127,127,0.06); border-radius: 6px; border: 1px solid var(--border); font-size: 11px; color: var(--muted); padding: 2px; }
.asset-cap { margin-top: 5px; color: var(--muted); font-size: 11px; }
.md-img { display: block; width: 100%; max-height: 300px; object-fit: contain; background: rgba(127,127,127,0.06); border-radius: 6px; border: 1px solid var(--border); margin: 10px 0; }
.vocab-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.vocab-item { font-size: 11px; padding: 2px 6px; background: rgba(78, 201, 176, 0.12); border: 1px solid rgba(78, 201, 176, 0.3); border-radius: 3px; }
.vocab-word { color: var(--success); font-weight: 600; }
.vocab-def { color: var(--muted); }

.exercise-items { display: flex; flex-direction: column; gap: 5px; }
.exercise-item { display: flex; gap: 8px; padding: 5px 7px; border-radius: 4px; }
.exercise-item.example { background: rgba(78, 201, 176, 0.08); border: 1px dashed rgba(78, 201, 176, 0.35); }
.example-badge { font-size: 10px; font-weight: 600; color: var(--success); text-transform: uppercase; }
.exercise-num { color: var(--muted); font-size: 12px; min-width: 18px; padding-top: 2px; }
.exercise-body { flex: 1; min-width: 0; }
.prompt { margin-bottom: 3px; }
.template { margin-bottom: 3px; }
.template-text { color: var(--template-text); }
.prompt-t, .response-t { color: var(--muted); font-size: 12px; margin: 2px 0; }
.response { color: var(--success); margin-bottom: 3px; }
.answer { color: var(--success); font-weight: 600; margin-bottom: 3px; }

.flags { margin: 4px 0 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.chip { font-size: 10px; font-weight: 800; letter-spacing: .03em; color: var(--chip-fg); border-radius: 4px; padding: 2px 7px; }
.chip b { font-weight: 800; }
.chip-repeat { background: var(--c-repeat); }
.chip-showprompt { background: var(--c-show); }
.chip-multi { background: var(--c-multi); }
.chip-input { background: var(--c-input); }
.chip-check { background: var(--c-check); }

.options { margin: 6px 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.option { display: flex; align-items: center; gap: 8px; padding: 3px 8px; max-width: 100%; background: rgba(127,127,127,0.10); border: 1px solid var(--border); border-radius: 5px; }
.option.correct { border-color: var(--correct); box-shadow: 0 0 0 1px var(--correct); background: rgba(43,240,138,0.12); }
.opt-id { color: var(--accent); font-weight: 700; font-family: monospace; min-width: 12px; text-align: center; }
.opt-val { min-width: 0; }
.opt-check { color: var(--correct); font-weight: 800; margin-left: auto; }
.option-img { display: block; max-height: 84px; max-width: 160px; object-fit: contain; border-radius: 4px; border: 1px solid var(--border); background: rgba(127,127,127,0.06); }
.audio-ref { margin: 4px 0; }
.clip { height: 30px; width: 100%; max-width: 260px; vertical-align: middle; }

.grammar-content { line-height: 1.7; }
.grammar-content h4, .grammar-content h5 { margin: 12px 0 6px; }
.grammar-content ul { padding-left: 18px; margin: 6px 0; }
.grammar-content li { margin: 3px 0; }
.grammar-content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.grammar-content td { padding: 4px 10px; border: 1px solid var(--border); }
.grammar-content tr:first-child td { font-weight: 600; background: rgba(127,127,127,0.14); }
.audio-phrase { color: var(--accent); background: rgba(79, 193, 255, 0.10); padding: 1px 4px; border-radius: 3px; cursor: default; }

.chat-field { margin-bottom: 8px; }
.chat-text { padding: 8px 12px; background: rgba(79, 193, 255, 0.06); border-radius: 4px; margin-top: 4px; }

.error { padding: 18px; }
.error h2 { color: var(--vscode-errorForeground, #f44); margin-bottom: 12px; }
.error h3 { margin-top: 16px; margin-bottom: 8px; font-size: 14px; }
.error pre { white-space: pre-wrap; font-size: 13px; background: var(--card-bg); padding: 12px; border-radius: 4px; }
.diagnostics { list-style: none; padding: 0; }
.diagnostics li { padding: 4px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
.diag-error { color: var(--vscode-errorForeground, #f44); }
.diag-warning { color: var(--warning); }
.diag-line { font-weight: 600; margin-right: 8px; font-family: monospace; }
.diag-code { color: var(--muted); font-size: 11px; font-family: monospace; }
`;
