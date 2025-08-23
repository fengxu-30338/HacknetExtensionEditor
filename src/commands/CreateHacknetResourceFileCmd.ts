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

    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createHackerScriptFile', uri => {
        CreateHacknetTemplateFile(uri, `HackerScript-${CommonUtils.GetRandStr(6)}.txt`, 'Hacknet-HackerScript.txt');
    }));
}