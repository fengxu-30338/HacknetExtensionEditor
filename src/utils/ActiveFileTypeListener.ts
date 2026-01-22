import * as vscode from 'vscode';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeInfo, HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from '../event/EventManager';
import * as CommonUtils from '../utils/CommonUtils';

export interface ActiveFileNodeType {
    nodeType: HacknetNodeType;
    filepath: string;
}

const CurrentFileNodeType: ActiveFileNodeType = {
    nodeType: HacknetNodeType.Other,
    filepath: '',
};

/**
 * 获取当前活动文件的节点类型
 * @returns 当前活动文件的节点类型
 */
export function GetActiveFile(): ActiveFileNodeType & {node:HacknetNodeInfo} {
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
    if (!editor) {return;}

    const filepath = editor.document.fileName;
    const nodeType = hacknetNodeHolder.GetNodeTypeByFilepath(filepath);
    if (nodeType === null) {
        return;
    }

    if (CurrentFileNodeType.nodeType === nodeType && CurrentFileNodeType.filepath === filepath) {
        return;
    }

    CurrentFileNodeType.nodeType = nodeType;
    CurrentFileNodeType.filepath = filepath;
    EventManager.fireEvent(EventType.EditorActiveFileChange, {nodeType});
}