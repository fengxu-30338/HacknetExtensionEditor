import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as CommonUtils from '../utils/CommonUtils';
import { GetHacknetEditorHintFileUri } from "../code-hint/CodeHint";

export enum HintFileExistRule {
    Overwrite = 0,
    Abandon = 1,
    Ask = 2
}

async function readHacknetDefaultEditorHintFile(context: vscode.ExtensionContext) {
    const filePath = path.join(context.extensionPath, 'templates', 'Hacknet-EditorHint.xml');
    const text = await fs.readFile(filePath, 'utf-8');
    return text;
}

function GetIncludeNodeFromXmlContent(content:string):string {
    if (content.length === 0) {
        return '';
    }
    const pattern = /<Include\s+([\s\S]*?)(\/>|>([\s\S]*?)<\/Include>)/g;
    let match;
    const includes:string[] = [];
    while ((match = pattern.exec(content)) !== null) {
        const include = match[0];
        includes.push(include);
    }
    // console.log("搜索到的Include节点:", includes);
    return includes.join('\n\t');
}

export async function CheckHacknetEditorHintFileExist() {
    const workspaceRoot = CommonUtils.GetWorkspaceRootUri();
    if (workspaceRoot === undefined) {
        return false;
    }
    const filePath = GetHacknetEditorHintFileUri();

    try {
        await vscode.workspace.fs.stat(filePath);
        return true;
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code !== vscode.FileSystemError.FileNotFound().code) {
            throw error;
        }
    }

    return false;
}

export async function CreateHacknetEditorHintFileInWorkspaceRoot(context: vscode.ExtensionContext, existRule: HintFileExistRule = HintFileExistRule.Ask, notifyUser: boolean = true) {
    const workspaceRoot = CommonUtils.GetWorkspaceRootUri();
    if (workspaceRoot === undefined) {
        return;
    }
    const filePath = GetHacknetEditorHintFileUri();

    let fileExists = false;
    let oldFileContent = '';
    try {
        await vscode.workspace.fs.stat(filePath);
        fileExists = true;
        oldFileContent = Buffer.from(await vscode.workspace.fs.readFile(filePath)).toString('utf-8');
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code !== vscode.FileSystemError.FileNotFound().code) {
            throw error;
        }
    }

    if (fileExists)
    {
        if (existRule === HintFileExistRule.Ask) {
            const selection = await vscode.window.showWarningMessage(
                `文件:Hacknet-EditorHint.xml 已存在，是否覆盖？`,
                { modal: true },
                '覆盖',
                '取消'
            );

            if (selection !== '覆盖') {
                return;
            }

        } else if (existRule === HintFileExistRule.Abandon) {
            return;
        }
    }
    
    try {
        // 创建文件并写入内容
        const text = await readHacknetDefaultEditorHintFile(context);
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(text.replace("<!-- %placeholder% -->", GetIncludeNodeFromXmlContent(oldFileContent))));

        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, {
            preview: true,  // 不以预览模式打开
            preserveFocus: true,  // 将焦点转移到新打开的编辑器
            viewColumn: vscode.ViewColumn.One  // 在第一个编辑器组打开
        });

        if (notifyUser) {
            vscode.window.showInformationMessage(`Hacknet-EditorHint Create Success`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create file: ${error}`);
    }
}