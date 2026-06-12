import * as vscode from "vscode";

export class ModuleDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    let currentLesson: vscode.DocumentSymbol | null = null;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();

      if (text.startsWith("$MODULE")) {
        const title = text.slice(7).trim() || "Module";
        symbols.push(
          new vscode.DocumentSymbol(
            title,
            "",
            vscode.SymbolKind.Module,
            line.range,
            line.range,
          ),
        );
      } else if (text.startsWith("$LESSON")) {
        const title = text.slice(7).trim() || "Untitled Lesson";
        currentLesson = new vscode.DocumentSymbol(
          title,
          "",
          vscode.SymbolKind.Namespace,
          line.range,
          line.range,
        );
        symbols.push(currentLesson);
      } else if (text.startsWith("$DIALOGUE")) {
        const title = text.slice(9).trim() || "Dialogue";
        const sym = new vscode.DocumentSymbol(
          title,
          "Dialogue",
          vscode.SymbolKind.Function,
          line.range,
          line.range,
        );
        if (currentLesson) currentLesson.children.push(sym);
        else symbols.push(sym);
      } else if (text.startsWith("$SELECT")) {
        const title = text.slice(7).trim() || "Select";
        const sym = new vscode.DocumentSymbol(
          title,
          "Select",
          vscode.SymbolKind.Function,
          line.range,
          line.range,
        );
        if (currentLesson) currentLesson.children.push(sym);
        else symbols.push(sym);
      } else if (text.startsWith("$PRODUCE")) {
        const title = text.slice(8).trim() || "Produce";
        const sym = new vscode.DocumentSymbol(
          title,
          "Produce",
          vscode.SymbolKind.Function,
          line.range,
          line.range,
        );
        if (currentLesson) currentLesson.children.push(sym);
        else symbols.push(sym);
      } else if (text.startsWith("$GRAMMAR")) {
        const title = text.slice(8).trim() || "Grammar";
        const sym = new vscode.DocumentSymbol(
          title,
          "Grammar",
          vscode.SymbolKind.Function,
          line.range,
          line.range,
        );
        if (currentLesson) currentLesson.children.push(sym);
        else symbols.push(sym);
      } else if (text.startsWith("$CHAT")) {
        const title = text.slice(5).trim() || "Chat";
        const sym = new vscode.DocumentSymbol(
          title,
          "Chat",
          vscode.SymbolKind.Function,
          line.range,
          line.range,
        );
        if (currentLesson) currentLesson.children.push(sym);
        else symbols.push(sym);
      }
    }

    for (let i = 0; i < symbols.length; i++) {
      const next = symbols[i + 1];
      const endLine = next ? next.range.start.line - 1 : document.lineCount - 1;
      symbols[i].range = new vscode.Range(
        symbols[i].range.start,
        document.lineAt(Math.max(0, endLine)).range.end,
      );

      for (let j = 0; j < symbols[i].children.length; j++) {
        const child = symbols[i].children[j];
        const nextChild = symbols[i].children[j + 1];
        const childEndLine = nextChild
          ? nextChild.range.start.line - 1
          : next
            ? next.range.start.line - 1
            : document.lineCount - 1;
        child.range = new vscode.Range(
          child.range.start,
          document.lineAt(Math.max(0, childEndLine)).range.end,
        );
      }
    }

    return symbols;
  }
}
