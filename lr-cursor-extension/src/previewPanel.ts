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
    html += `<div class="toc-meta">${esc(mod.targetLang_G)} → ${esc(mod.homeLang_G)}</div>`;
    for (const lesson of mod.lessons) {
      html += `<div class="toc-lesson"><a href="#${esc(lesson.id)}">${esc(lesson.title)}</a></div>`;
      for (const act of lesson.activities) {
        html += `<div class="toc-activity"><a href="#${esc(act.id)}">${activityIcon(act.type)} ${esc(act.title)}</a></div>`;
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
    html += `<div class="meta"><span class="badge target">${esc(mod.targetLang_G)}</span> <span class="badge home">${esc(mod.homeLang_G)}</span>`;
    html += ` <span class="doc-id">${esc(mod.moduleKey)}</span></div>`;
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
    html += `<h3>${activityIcon(act.type)} ${esc(act.title)}</h3>`;
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

  private renderAudio(file: string, label: string): string {
    const src = this.resolveAssetSrc(file);
    return (
      `<div class="audio-ref"><span class="field-label">${esc(label)}</span> ` +
      `<audio class="clip" controls preload="none" src="${esc(src)}"></audio> ` +
      `<code>${esc(file)}</code></div>`
    );
  }

  private renderDialogue(act: DialogueActivity): string {
    let html = "";
    if (act.instruction)
      html += `<div class="instruction"><span class="field-label">INSTRUCTION</span> ${esc(act.instruction)}</div>`;
    if (act.repeat) html += `<div class="flags"><span class="flag">REPEAT</span></div>`;
    if (act.image) {
      const src = this.resolveAssetSrc(act.image);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" /><div class="asset-cap"><span class="field-label">IMAGE</span> <code>${esc(act.image)}</code> <span class="muted">(activity-wide)</span></div></div>`;
    }
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
    if (line.image) {
      const src = this.resolveAssetSrc(line.image);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" />`;
      html += `<div class="asset-cap"><span class="field-label">IMAGE</span> <code>${esc(line.image)}</code></div></div>`;
    }
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
    const flags: string[] = [];
    if (act.multi) flags.push("MULTI");
    if (act.showPrompt) flags.push("SHOW_PROMPT");
    if (act.repeat) flags.push("REPEAT");
    if (flags.length) html += `<div class="flags">${flags.map((f) => `<span class="flag">${f}</span>`).join(" ")}</div>`;
    if (act.image) {
      const src = this.resolveAssetSrc(act.image);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" /><div class="asset-cap"><span class="field-label">IMAGE</span> <code>${esc(act.image)}</code></div></div>`;
    }
    if (act.options.length) html += this.renderOptions(act.options, "Options");
    html += `<div class="exercise-items">`;
    for (let i = 0; i < act.items.length; i++) {
      html += this.renderSelectItem(act.items[i], i + 1);
    }
    html += `</div>`;
    return html;
  }

  private renderOptions(options: SelectOption[], label: string): string {
    let html = `<div class="options"><span class="field-label">${esc(label)}</span> `;
    html += options
      .map((o) => {
        const val = o.image ? `<code>${esc(o.image)}</code>` : esc(o.text || "");
        return `<span class="option"><b>${esc(o.id)}</b> ${val}</span>`;
      })
      .join(" ");
    html += `</div>`;
    return html;
  }

  private renderSelectItem(item: SelectItem, num: number): string {
    const cls = item.isExample ? "exercise-item example" : "exercise-item";
    let html = `<div class="${cls}">`;
    if (item.isExample) html += `<div class="example-badge">Example</div>`;
    html += `<div class="exercise-num">${num}</div>`;
    html += `<div class="exercise-body">`;
    if (item.prompt)
      html += `<div class="prompt"><span class="field-label">PROMPT</span> ${esc(item.prompt)}</div>`;
    if (item.template)
      html += `<div class="prompt"><span class="field-label">TEMPLATE</span> <code>${esc(item.template)}</code></div>`;
    if (item.promptImage) {
      const src = this.resolveAssetSrc(item.promptImage);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" /><div class="asset-cap"><code>${esc(item.promptImage)}</code></div></div>`;
    }
    if (item.audio) html += this.renderAudio(item.audio, "AUDIO");
    if (item.options && item.options.length) html += this.renderOptions(item.options, "Options");
    html += `<div class="response"><span class="field-label">ANSWER</span> ${esc(item.answer.join(", "))}</div>`;
    if (item.feedback)
      html += `<div class="prompt-t"><span class="field-label">FEEDBACK</span> ${esc(item.feedback)}</div>`;
    html += `</div></div>`;
    return html;
  }

  private renderProduce(act: ProduceActivity): string {
    let html = "";
    if (act.instruction)
      html += `<div class="instruction"><span class="field-label">INSTRUCTION</span> ${esc(act.instruction)}</div>`;
    const flags = [`INPUT: ${act.input}`, `CHECK: ${act.check}`];
    if (act.showPrompt) flags.push("SHOW_PROMPT");
    if (act.repeat) flags.push("REPEAT");
    html += `<div class="flags">${flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(" ")}</div>`;
    if (act.image) {
      const src = this.resolveAssetSrc(act.image);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" /><div class="asset-cap"><code>${esc(act.image)}</code></div></div>`;
    }
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
      html += `<div class="prompt"><span class="field-label">PROMPT</span> ${esc(item.prompt)}</div>`;
    if (item.template)
      html += `<div class="prompt"><span class="field-label">TEMPLATE</span> <code>${esc(item.template)}</code></div>`;
    if (item.promptImage) {
      const src = this.resolveAssetSrc(item.promptImage);
      html += `<div class="asset-block"><img class="asset-img" src="${esc(src)}" alt="" /><div class="asset-cap"><code>${esc(item.promptImage)}</code></div></div>`;
    }
    if (item.audio) html += this.renderAudio(item.audio, "AUDIO");
    if (item.response != null)
      html += `<div class="response"><span class="field-label">RESPONSE</span> ${esc(item.response)}</div>`;
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

function activityIcon(type: string): string {
  switch (type) {
    case "DIALOGUE":
      return "\u{1F4AC}";
    case "SELECT":
      return "\u{2611}\u{FE0F}";
    case "PRODUCE":
      return "\u{270F}\u{FE0F}";
    case "GRAMMAR":
      return "\u{1F4D6}";
    case "CHAT":
      return "\u{1F5E3}\u{FE0F}";
    default:
      return "\u{1F4C4}";
  }
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
  --badge-bg: var(--vscode-badge-background, #333);
  --badge-fg: var(--vscode-badge-foreground, #fff);
  --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
  --success: #4ec9b0;
  --warning: #dcdcaa;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--vscode-font-family, system-ui); font-size: 13px; color: var(--fg); background: var(--bg); line-height: 1.5; }

.layout { display: flex; min-height: 100vh; }
.toc { width: 220px; min-width: 220px; padding: 16px 12px; border-right: 1px solid var(--border); position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.toc-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.toc-meta { color: var(--muted); font-size: 11px; margin-bottom: 12px; }
.toc-lesson { margin-top: 8px; font-weight: 600; font-size: 12px; }
.toc-activity { padding-left: 12px; font-size: 12px; }
.toc a { color: var(--fg); text-decoration: none; }
.toc a:hover { color: var(--accent); }

.content { flex: 1; padding: 24px 32px; max-width: 800px; }

.module-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.module-header h1 { font-size: 20px; margin-bottom: 6px; }
.description { color: var(--muted); margin-bottom: 8px; }
.meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.badge { padding: 2px 8px; border-radius: 3px; background: var(--badge-bg); color: var(--badge-fg); font-size: 11px; font-weight: 600; text-transform: uppercase; }
.doc-id { color: var(--muted); font-family: monospace; font-size: 11px; }

.voice-config { margin-top: 12px; padding: 8px 12px; background: var(--card-bg); border-radius: 4px; border: 1px solid var(--border); }
.voice-config-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.voice-entry { font-size: 12px; margin: 2px 0; }
.voice-label { color: var(--muted); }
.voice-name { color: var(--accent); font-family: monospace; }
.voice-prompt { color: var(--muted); font-style: italic; }

.lesson { margin-bottom: 32px; }
.lesson-title { font-size: 16px; margin-bottom: 16px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

.activity { margin-bottom: 20px; padding: 12px 16px; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border); }
.activity h3 { font-size: 14px; margin-bottom: 8px; }

.field-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--muted); background: var(--badge-bg); padding: 1px 5px; border-radius: 2px; margin-right: 4px; }

.intro { color: var(--muted); font-style: italic; margin-bottom: 8px; padding: 6px 8px; border-left: 2px solid var(--accent); }
.instruction { color: var(--muted); margin-bottom: 10px; font-size: 12px; }

.dialogue-lines { display: flex; flex-direction: column; gap: 10px; }
.dialogue-line { padding: 8px 0; border-bottom: 1px solid var(--border); }
.dialogue-line:last-child { border-bottom: none; }
.speaker { font-weight: 600; color: var(--accent); font-size: 12px; margin-bottom: 2px; }
.line-text { font-size: 15px; margin-bottom: 2px; }
.line-translation { color: var(--muted); font-size: 13px; }
.line-notes { color: var(--warning); font-size: 12px; margin-top: 4px; padding: 4px 8px; background: rgba(220, 220, 170, 0.08); border-radius: 3px; }
.asset-block { margin: 8px 0 10px; }
.asset-img { display: block; width: 100%; max-height: 240px; object-fit: contain; background: rgba(255,255,255,0.04); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); }
.asset-cap { margin-top: 6px; color: var(--muted); font-size: 11px; }
.md-img { display: block; width: 100%; max-height: 320px; object-fit: contain; background: rgba(255,255,255,0.04); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); margin: 10px 0; }
.vocab-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.vocab-item { font-size: 11px; padding: 2px 6px; background: rgba(78, 201, 176, 0.1); border: 1px solid rgba(78, 201, 176, 0.2); border-radius: 3px; }
.vocab-word { color: var(--success); font-weight: 600; }
.vocab-def { color: var(--muted); }

.exercise-items { display: flex; flex-direction: column; gap: 6px; }
.exercise-item { display: flex; gap: 8px; padding: 6px 8px; border-radius: 4px; }
.exercise-item.example { background: rgba(78, 201, 176, 0.08); border: 1px dashed rgba(78, 201, 176, 0.3); }
.example-badge { font-size: 10px; font-weight: 600; color: var(--success); text-transform: uppercase; }
.exercise-num { color: var(--muted); font-size: 12px; min-width: 20px; padding-top: 2px; }
.exercise-body { flex: 1; }
.prompt { margin-bottom: 2px; }
.prompt-t, .response-t { color: var(--muted); font-size: 12px; padding-left: 4px; }
.response { color: var(--success); }
.flags { margin: 4px 0 8px; }
.flag { font-size: 10px; font-weight: 600; color: var(--accent); background: rgba(79,193,255,0.1); border: 1px solid rgba(79,193,255,0.25); border-radius: 3px; padding: 1px 6px; margin-right: 4px; }
.options { margin: 4px 0; font-size: 12px; }
.option { display: inline-block; margin: 0 6px 4px 0; padding: 1px 6px; background: var(--badge-bg); border-radius: 3px; }
.audio-ref { color: var(--muted); font-size: 11px; margin: 4px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.clip { height: 30px; vertical-align: middle; max-width: 320px; }

.grammar-content { line-height: 1.7; }
.grammar-content h4, .grammar-content h5 { margin: 12px 0 6px; }
.grammar-content ul { padding-left: 20px; margin: 6px 0; }
.grammar-content li { margin: 3px 0; }
.grammar-content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.grammar-content td { padding: 4px 10px; border: 1px solid var(--border); }
.grammar-content tr:first-child td { font-weight: 600; background: var(--badge-bg); }
.audio-phrase { color: var(--accent); background: rgba(79, 193, 255, 0.08); padding: 1px 4px; border-radius: 3px; cursor: default; }

.chat-field { margin-bottom: 8px; }
.chat-text { padding: 8px 12px; background: rgba(79, 193, 255, 0.05); border-radius: 4px; margin-top: 4px; }

.error { padding: 24px; }
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
