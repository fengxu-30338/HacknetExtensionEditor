import * as vscode from 'vscode';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from '../event/EventManager';


export function RegisterTutorialViewer(context: vscode.ExtensionContext) {
    // 注册命令
    RegisterLookUpTutorialDocCommand(context);
    // 注册状态栏
    InitStatusBarOnlyInHacknetFile(context);
}

function RegisterLookUpTutorialDocCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.lookUpTutorialDoc', LookUpTutorialDocCommand));
}

function LookUpTutorialDocCommand(...args: any[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}
    const filepath = editor.document.fileName;
    const nodeType = hacknetNodeHolder.GetNodeTypeByFilepath(filepath);
    if (nodeType === null) {
        return;
    }
    const docUrl = GetDocUrlByFilepath(filepath);
    if (docUrl === null) {
        return;
    }

    vscode.env.openExternal(vscode.Uri.parse(docUrl));
}

function GetDocUrlByFilepath(filepath:string): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }
    const nodeType = hacknetNodeHolder.GetNodeTypeByFilepath(filepath);
    if (nodeType === null) {
        return null;
    }

    switch (nodeType) {
        case HacknetNodeType.Action:
            return "https://hacknet.wiki/reference/Action";
        case HacknetNodeType.Computer:
            return "https://hacknet.wiki/reference/Computer";
        case HacknetNodeType.Faction:
            return "https://hacknet.wiki/reference/Faction";
        case HacknetNodeType.Mission:
            return "https://hacknet.wiki/reference/Mission";
        case HacknetNodeType.People:
            return "https://hacknet.wiki/reference/People";
        case HacknetNodeType.Theme:
            return "https://hacknet.wiki/reference/Theme";
        default:
            return null;
    }
}

function OnEditorFileChangedForChangeStatusBar(statusBarItem: vscode.StatusBarItem) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}
    const filepath = editor.document.fileName;
    const docUrl = GetDocUrlByFilepath(filepath);
    if (docUrl === null) {
        statusBarItem.hide();
        return;
    }

    statusBarItem.show();
}

function InitStatusBarOnlyInHacknetFile(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(globe) 查看本文件编写教程";
    statusBarItem.tooltip = "查看Hacknet文件编写教程";
    statusBarItem.command = "hacknetextensionhelper.lookUpTutorialDoc";
    statusBarItem.hide();
    context.subscriptions.push(statusBarItem);

    EventManager.onEvent(EventType.EditorActiveFileChange, _ => {
        OnEditorFileChangedForChangeStatusBar(statusBarItem);
    });
}