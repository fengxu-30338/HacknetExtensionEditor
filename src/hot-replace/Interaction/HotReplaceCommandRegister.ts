import * as vscode from 'vscode';
import * as CommonUtils from '../../utils/CommonUtils';
import HotReplaceClient from '../HotReplaceClient/HotReplaceClient';
import OutputManager from '../../utils/OutputChannelUtils';
import { hacknetNodeHolder } from '../../worker/GlobalHacknetXmlNodeHolder';


async function ExecHotReplaceCommandWrapper<T>(command: () => Promise<T>, title: string): Promise<T | null> {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
    }, async (progress, token) => {
        try {
            return await command();
        } catch (error) {
            OutputManager.error(`指令执行失败: ${error}`);
            vscode.window.showErrorMessage(`指令执行失败: ${error}`);
        }
        return null;
    });
}

function GetCurrentOpenFilePath():string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error("当前没有打开的文件");
    }
    return editor.document.uri.fsPath;
}

function GetCurrentOpenComputerId():string {
    const fsPath = GetCurrentOpenFilePath();

    const node = hacknetNodeHolder.GetNodeByFilepath(fsPath);
    if (!node) {
        throw new Error("当前打开的文件不是Hacknet计算机文件");
    }

    try {
        return node.Computer.id;
    } catch (error) {
        throw new Error("获取当前打开的计算机ID失败");
    }
}

async function ShowXmlDocument(content: string) {
    // 将content中所有转义字符替换为实际xml字符
    content = content.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

    const doc = await vscode.workspace.openTextDocument({
        language: 'xml',
        content: content,
    });

    await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.One
    });
}

async function ShowTextDocument(content: string) {
    const doc = await vscode.workspace.openTextDocument({
        language: 'text',
        content: content,
    });

    await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.One
    });
}


export function RegisterHotReplaceClientCommands() {
    const context = CommonUtils.GetExtensionContext();
    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.EnterExtension', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.EnterExtension({
                    ExtensionFolder: CommonUtils.GetWorkspaceRootUri()!.fsPath,
                    NeedApproval: false,
                    EnterNoAccount: true,
                });
            }, "正在执行[进入Hacknet Extension]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadComputer', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadComputer({
                    ComputerPath: GetCurrentOpenFilePath(),
                });
            }, "正在执行[重载当前计算机文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.ConnectComputerAndGrantAdmin', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.ConnectComputerAndGrantAdmin({
                    ComputerId: GetCurrentOpenComputerId(),
                });
            }, "正在执行[连接当前计算机并授予管理员权限]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadMission', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadMission({
                    MissionPath: GetCurrentOpenFilePath(),
                    ClearOldAction: false,
                });
            }, "正在执行[热重载当前Mission文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadMissionAndClearOldAction', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadMission({
                    MissionPath: GetCurrentOpenFilePath(),
                    ClearOldAction: true,
                });
            }, "正在执行[热重载当前Mission文件并清除旧Action]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadAction', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadAction({
                    ActionPath: GetCurrentOpenFilePath(),
                    ClearOldAction: false,
                });
            }, "正在执行[热重载当前Action文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadActionAndClearOldAction', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadAction({
                    ActionPath: GetCurrentOpenFilePath(),
                    ClearOldAction: true,
                });
            }, "正在执行[热重载当前Action文件并清除旧Action]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadTheme', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadTheme({
                    ThemePath: GetCurrentOpenFilePath(),
                });
            }, "正在执行[重载当前Theme文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadFaction', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadFaction({
                    FactionPath: GetCurrentOpenFilePath(),
                });
            }, "正在执行[重载当前Faction文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.HotReloadPeople', () => {
            ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.HotReloadPeople();
            }, "正在执行[重载所有People文件]指令...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.PrintOsInfo', async () => {
            const content = await ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.PrintOsInfo();
            }, "正在执行[打印当前Os信息]指令...");
            if (content) {
                ShowXmlDocument(content);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.PrintComputerInfo', async () => {
            const content = await ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.PrintComputerInfo({
                    ComputerId: GetCurrentOpenComputerId(),
                });
            }, "正在执行[打印当前Computer信息]指令...");
            if (content) {
                ShowXmlDocument(content);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hacknetextensionhelper.HotReplace.AnalysisDrawCall', async () => {
            const analysisType = [
                {
                    label: 'text',
                    description: '分析文本绘制调用',
                },
                {
                    label: 'graphics',
                    description: '分析图形绘制调用',
                },
            ];
            const type = await vscode.window.showQuickPick(analysisType, {
                placeHolder: '请选择分析类型',
            });
            if (!type) {
                return;
            }

            let content = '';
            if (type.label === 'text') {
                content = await vscode.window.showInputBox({
                    prompt: '请输入要查找的文本内容',
                }) || '';
                if (!content) {
                    return;
                }
            }
            vscode.window.showInformationMessage(`请在Hacknet中使用中键点击要分析的绘制调用的区域`);
            const res = await ExecHotReplaceCommandWrapper(() => {
                return HotReplaceClient.AnalysisDrawCall({
                    Type: type.label as any,
                    Content: content,
                });
            }, `正在执行[${type.description}]指令...`);
            if (res) {
                ShowTextDocument(res);
            }
        })
    );
}