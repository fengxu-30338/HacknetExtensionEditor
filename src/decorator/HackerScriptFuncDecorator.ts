import * as vscode from 'vscode';
import { CodeHints } from "../code-hint/CodeHint";
import { minimatch } from "minimatch";
import * as CommonUtils from '../utils/CommonUtils';
import { EventManager, EventType } from "../event/EventManager";
import path from 'path';
import lodash from "lodash";

const infoDecoration = vscode.window.createTextEditorDecorationType({
    color: '#0080ff',
});


function highlightHackerScriptFunc() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const hackerScriptsHint = CodeHints.HackerScriptSource;
    const rootUri = CommonUtils.GetWorkspaceRootUri();
    if (!rootUri) {
        return;
    }

    if (hackerScriptsHint.codeHintItems.length === 0) {
        return;
    }

    // 检验路径是否满足要求
    const document = editor.document;
    const replativeDocumentFilePath = path.relative(rootUri.fsPath, document.uri.fsPath);
    if (!minimatch(replativeDocumentFilePath, hackerScriptsHint.fileTriggerPattern)) {
        return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    const lineCount = document.lineCount;

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i).text.trim();
        const command = hackerScriptsHint.codeHintItems.find(item => line.startsWith(`${item.label ?? item.value} `));
        if (!command) {
            continue;
        }

        const cmdStr = command.label ?? command.value;
        const startIdx = line.indexOf(cmdStr);
        const startPos = new vscode.Position(i, startIdx);
        const endPos = new vscode.Position(i, startIdx + cmdStr.length);

        decorations.push({
            range: new vscode.Range(startPos, endPos),
            hoverMessage: command.desc
        });
    }
    
    editor.setDecorations(infoDecoration, decorations);
}

/**
 * 注册黑客脚本方法高亮文本装饰器
 */
export function RegisterHackerScriptsHightlight() {
    highlightHackerScriptFunc();
    const debounceHighlightHackerScriptFunc = lodash.debounce(highlightHackerScriptFunc, 200);
    vscode.workspace.onDidChangeTextDocument(_ => debounceHighlightHackerScriptFunc());
    vscode.window.onDidChangeActiveTextEditor(_ => debounceHighlightHackerScriptFunc());
    vscode.window.onDidChangeVisibleTextEditors(_ => debounceHighlightHackerScriptFunc());
    EventManager.onEvent(EventType.CodeHintSourceChange, _ => debounceHighlightHackerScriptFunc());
}