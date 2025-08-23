import * as vscode from 'vscode';
import { CodeHints } from "../code-hint/CodeHint";
import * as CommonUtils from '../utils/CommonUtils';
import { minimatch } from "minimatch";
import path from 'path';
import { EventManager, EventType } from "../event/EventManager";
import lodash from "lodash";

const infoDecoration = vscode.window.createTextEditorDecorationType({
    color: '#306970ff',
    backgroundColor: '#bbc4ccff'
});


function highlightReplaceText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const rootUri = CommonUtils.GetWorkspaceRootUri();
    if (!rootUri) {
        return;
    }

    if (CodeHints.ReplaceTextSource.length === 0) {
        return;
    }

    // 检验路径是否满足要求
    const document = editor.document;
    const replativeDocumentFilePath = path.relative(rootUri.fsPath, document.uri.fsPath);
    if (minimatch(replativeDocumentFilePath, 'Hacknet-EditorHint.xml')) {
        return;
    }
    
    const decorations: vscode.DecorationOptions[] = [];
    const relpaceTextRegex = /#[^%\r\n]+?#/g;
    let match;
    const text = document.getText();

    while ((match = relpaceTextRegex.exec(text)) !== null) {
        const startPos = match.index;
        const endPos = startPos + match[0].length;
        const replaceText = match[0];
        const repItem = CodeHints.ReplaceTextSource.find(item => item.value === replaceText);
        if (!repItem) {
            continue;
        }

        decorations.push({
            range: new vscode.Range(document.positionAt(startPos), document.positionAt(endPos)),
            hoverMessage: repItem.desc
        });
    }
    
    editor.setDecorations(infoDecoration, decorations);
}

/**
 * 注册替换文本的高亮装饰器
 */
export function RegisterHacknetReplaceTextHightlight() {
    highlightReplaceText();
    const debounceHighlightReplaceText= lodash.debounce(highlightReplaceText, 200);
    vscode.workspace.onDidChangeTextDocument(_ => debounceHighlightReplaceText());
    vscode.window.onDidChangeActiveTextEditor(_ => debounceHighlightReplaceText());
    vscode.window.onDidChangeVisibleTextEditors(_ => debounceHighlightReplaceText());
    EventManager.onEvent(EventType.CodeHintSourceChange, _ => debounceHighlightReplaceText());
}