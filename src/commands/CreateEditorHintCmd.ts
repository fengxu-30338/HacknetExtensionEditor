import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as CommonUtils from '../utils/CommonUtils';
import { GetHacknetEditorHintFileUri, CodeHints } from "../code-hint/CodeHint";
async function readHacknetDefaultEditorHintFile(context: vscode.ExtensionContext) {
    const filePath = path.join(context.extensionPath, 'templates', 'Hacknet-EditorHint.xml');
    const text = await fs.readFile(filePath, 'utf-8');
    return text;
}

function GetIncludeNodeToXmlContent():string {
    const incFiles = CodeHints.IncludeFiles;
    if (incFiles.length === 0) {
        return '';
    }

    let res = '';
    incFiles.forEach(inc => {
        res += `<Include path="${inc}" />\n\t`;
    });

    return res.trimEnd();
}

export default async function createHacknetEditorHintFileInWorkspaceRoot(context: vscode.ExtensionContext) {
    const workspaceRoot = CommonUtils.GetWorkspaceRootUri();
    if (workspaceRoot === undefined) {
        return;
    }
    const filePath = GetHacknetEditorHintFileUri();

    let fileExists = false;
    try {
        await vscode.workspace.fs.stat(filePath);
        fileExists = true;
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code !== vscode.FileSystemError.FileNotFound().code) {
            throw error;
        }
    }

    if (fileExists)
    {
        const selection = await vscode.window.showWarningMessage(
            `文件:Hacknet-EditorHint.xml 已存在，是否覆盖？`,
            { modal: true },
            '覆盖',
            '取消'
        );

        if (selection !== '覆盖') {
            return;
        }
    }
    
    try {
        // 创建文件并写入内容
        const text = await readHacknetDefaultEditorHintFile(context);
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(text.replace("<!-- %placeholder% -->", GetIncludeNodeToXmlContent())));

        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, {
            preview: true,  // 不以预览模式打开
            preserveFocus: true,  // 将焦点转移到新打开的编辑器
            viewColumn: vscode.ViewColumn.One  // 在第一个编辑器组打开
        });

        vscode.window.showInformationMessage(`Hacknet-EditorHint Create Success`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create file: ${error}`);
    }
}