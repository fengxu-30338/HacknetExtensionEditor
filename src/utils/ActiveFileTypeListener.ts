import * as vscode from 'vscode';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeInfo, HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from '../event/EventManager';
import * as CommonUtils from '../utils/CommonUtils';

export interface ActiveFileNodeType {
    nodeType: HacknetNodeType | null;
    filepath: string | null;
}

const CurrentFileNodeType: ActiveFileNodeType = {
    nodeType: HacknetNodeType.Other,
    filepath: null,
};

/**
 * 获取当前活动文件的节点类型
 * @returns 当前活动文件的节点类型
 */
export function GetActiveFile(): ActiveFileNodeType & {node:HacknetNodeInfo | null} {
    if (!CurrentFileNodeType.filepath) {
        return {...CurrentFileNodeType, node: null};
    }
    return {...CurrentFileNodeType, node: hacknetNodeHolder.GetNodeByFilepath(CurrentFileNodeType.filepath)};
}


/**
 * 开始监听活动文件类型变化
 */
export function StartListenActiveFileChanged() {
    const context = CommonUtils.GetExtensionContext();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(_ => OnEditorFileChanged()));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(_ => OnEditorFileChanged()));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(_ => OnEditorFileChanged()));
    EventManager.onEvent(EventType.HacknetNodeFileChange, _ => OnEditorFileChanged());

    OnEditorFileChanged();
}


function OnEditorFileChanged() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        CurrentFileNodeType.nodeType = null;
        CurrentFileNodeType.filepath = null;
        EventManager.fireEvent(EventType.EditorActiveFileChange, {nodeType: null});
        return;
    }

    const filepath = editor.document.fileName;
    const nodeType = hacknetNodeHolder.GetNodeTypeByFilepath(filepath);

    if (CurrentFileNodeType.nodeType === nodeType && CurrentFileNodeType.filepath === filepath) {
        return;
    }

    CurrentFileNodeType.nodeType = nodeType;
    CurrentFileNodeType.filepath = filepath;
    EventManager.fireEvent(EventType.EditorActiveFileChange, {nodeType});
}