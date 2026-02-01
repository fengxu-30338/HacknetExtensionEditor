import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as CommonUtils from '../utils/CommonUtils';


async function CreateHacknetTemplateFile(folderUri:vscode.Uri, defaultFileName: string, templateFileName: string) {
    const newFileUri = vscode.Uri.joinPath(folderUri, defaultFileName);
    
    try {
        // 读模板
        const templateFilePath = path.join(CommonUtils.GetExtensionContext().extensionPath, 'templates', templateFileName);
        const templateFileContent = await fs.readFile(templateFilePath, {encoding: 'utf-8'});

        await vscode.workspace.fs.writeFile(newFileUri, Buffer.from(templateFileContent));
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
        const document = await vscode.workspace.openTextDocument(newFileUri);
        await vscode.window.showTextDocument(document);

        setTimeout(() => {
            vscode.commands.executeCommand('renameFile', newFileUri);
        }, 100);
    } catch (error) {
        vscode.window.showErrorMessage('创建Hacknet模板文件失败:' + error);
    }
}

async function CheckDirectoryIsEmpty(dirPath:string) {
    try {
        const files = await fs.readdir(dirPath);
        return files.length === 0 || files.every(file => file.startsWith('.'));
    } catch (error) {
        return false;
    }
}

async function DeepCopyDir(srcDir:string, dstDir:string) {
    await fs.mkdir(dstDir, { recursive: true });
    const files = await fs.readdir(srcDir);
    for (const file of files) {
        const srcPath = path.join(srcDir, file);
        const dstPath = path.join(dstDir, file);
        const stat = await fs.stat(srcPath);
        if (stat.isDirectory()) {
            await DeepCopyDir(srcPath, dstPath);
        } else {
            await fs.copyFile(srcPath, dstPath);
        }
    }
}

async function CreateHacknetExtensionProjectTemplate() {
    try {
        const workspaceUri = CommonUtils.GetWorkspaceRootUri();
        if (!workspaceUri) {
            vscode.window.showErrorMessage('请在工作空间根目录下执行');
            return;
        }
        // 插件工作根目录是否是一个空目录
        const isEmpty = await CheckDirectoryIsEmpty(workspaceUri.fsPath);
        if (!isEmpty) {
            vscode.window.showErrorMessage('请保证工作空间根目录为空时在重新创建项目模板');
            return;
        }
        // 将templates/ProjectTemplate目录以及子目录下所有的文件复制到工作根目录中
        const projectTemplateDir = path.join(CommonUtils.GetExtensionContext().extensionPath, 'templates', 'ProjectTemplate');
        await DeepCopyDir(projectTemplateDir, workspaceUri.fsPath);

        vscode.window.showInformationMessage('创建Hacknet扩展项目模板成功');
    } catch (error) {
        console.error('创建Hacknet扩展项目模板失败:' + error);
        vscode.window.showErrorMessage('创建Hacknet扩展项目模板失败:' + error);
    }
}


export function RegisterCreateHacknetResourceFileCommands(context:vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createComputerFile', uri => {
        CreateHacknetTemplateFile(uri, `Computer-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-Computer.xml');
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createPeopleFile', uri => {
        CreateHacknetTemplateFile(uri, `People-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-People.xml');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createActionFile', uri => {
        CreateHacknetTemplateFile(uri, `Action-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-Action.xml');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createFactionFile', uri => {
        CreateHacknetTemplateFile(uri, `Faction-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-Faction.xml');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createMissionFile', uri => {
        CreateHacknetTemplateFile(uri, `Mission-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-Mission.xml');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createThemeFile', uri => {
        CreateHacknetTemplateFile(uri, `Theme-${CommonUtils.GetRandStr(6)}.xml`, 'Hacknet-Theme.xml');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createHackerScriptFile', uri => {
        CreateHacknetTemplateFile(uri, `HackerScript-${CommonUtils.GetRandStr(6)}.txt`, 'Hacknet-HackerScript.txt');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createExtensionProjectTemplate', uri => {
        CreateHacknetExtensionProjectTemplate();
    }));
}