import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as CommonUtils from '../utils/CommonUtils';
import { GetHacknetEditorHintFileUri } from "../code-hint/CodeHint";
import { XMLParser as StandardXMLParser } from 'fast-xml-parser';
import { EventManager, EventType } from '../event/EventManager';

export enum HintFileExistRule {
    Overwrite = 0,
    Abandon = 1,
    Ask = 2
}

const XmlParser = new StandardXMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
let InTipUserCreateHintFile = false;

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


/**
 * 在资源管理器中显示并高亮指定文件
 * @param filePath 文件的完整路径
 */
export async function revealFileInExplorer(filePath: string) {
    try {
        // 将文件路径转换为 VS Code 的 Uri
        const uri = vscode.Uri.file(filePath);
        
        // 执行命令，在资源管理器中显示该文件
        await vscode.commands.executeCommand('revealInExplorer', uri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`无法显示文件: ${error}`);
    }
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

        if (notifyUser) {
            revealFileInExplorer(filePath.fsPath);
            vscode.window.showInformationMessage(`Hacknet-EditorHint Create Success`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create file: ${error}`);
    }
}

function GetExtensionInfoFilePath() {
    return path.join(CommonUtils.GetWorkspaceRootUri()!.fsPath, 'ExtensionInfo.xml');
}

async function CheckExtensionTipUserCreateHintFileImpl(context: vscode.ExtensionContext) {
    if (await CheckHacknetEditorHintFileExist()) {
        return;
    }
    
    const extInfoPath = GetExtensionInfoFilePath();
    try {
        const xmlContent = await fs.readFile(extInfoPath, 'utf8');
        const info = XmlParser.parse(xmlContent);
        if (!('HacknetExtension' in info)) {
            return;
        }

        if (InTipUserCreateHintFile) {
            return;
        }
        InTipUserCreateHintFile = true;
        
        const choice = await vscode.window.showInformationMessage(
            '检测到当前项目为Hacknet扩展，是否创建Hacknet扩展编辑器提示文件?',
            {
                modal: true,
                detail: 'Hacknet-EditorHint.xml是Hacknet扩展的编辑器提示文件，用于在编辑Hacknet扩展时提供提示、自动完成、关键字高亮、错误检测、主题调试等功能。'
            },
            '确定'
        );

        if (choice !== '确定') {
            return;
        }

        await CreateHacknetEditorHintFileInWorkspaceRoot(context);

    } catch (error) {
        // ignore error
        console.error(error);
    } finally {
        InTipUserCreateHintFile = false;
    }
}

export async function CheckExtensionTipUserCreateHintFile(context: vscode.ExtensionContext) {
    CheckExtensionTipUserCreateHintFileImpl(context);

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        await CheckExtensionTipUserCreateHintFileImpl(context);
    }));

    EventManager.onEvent(EventType.HacknetNodeFileChange, ({modify, filepath}) => {
        if (modify === 'add' && filepath === GetExtensionInfoFilePath()) {
            CheckExtensionTipUserCreateHintFileImpl(context);
        }
    });
}