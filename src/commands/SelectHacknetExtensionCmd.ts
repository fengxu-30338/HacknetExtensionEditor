import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'path';
import * as SteamUtils from "../utils/SteamUtils";
import { XMLParser as StandardXMLParser } from 'fast-xml-parser';

interface HacknetExtensionInfo {
    Name:string;
    Path:string;
}

const XmlParser = new StandardXMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

async function GetSubDirectories(dirPath:string):Promise<string[]> {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    const directories = items
      .filter(item => item.isDirectory())
      .map(item => path.join(dirPath, item.name));
    
    return directories;
  } catch (error) {
    console.error(`读取目录失败: ${error}`);
    return [];
  }
}

/**
 * 检查文件是否存在
 * @param filePath 文件路径
 * @returns 如果文件存在返回true，否则返回false
 */
function FileExists(filePath: string): boolean {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile();
    } catch (error) {
        return false;
    }
}


/**
 * 检查文件夹是否存在
 * @param dirPath 文件夹路径
 * @returns 如果文件夹存在返回true，否则返回false
 */
function DirectoryExists(dirPath: string): boolean {
    try {
        const stats = fs.statSync(dirPath);
        return stats.isDirectory();
    } catch (error) {
        return false;
    }
}

function CheckFolderIsHacknetExtensionFolder(folder:string):boolean {
    return FileExists(path.join(folder, 'ExtensionInfo.xml'));
}

async function GetAllExtensionPaths(): Promise<string[]> {
    const result:string[] = [];

    const steamPath = await SteamUtils.GetSteamInstallPath();
    const hacknetExtensionsPath = path.join(steamPath, 'steamapps', 'common', 'Hacknet', 'Extensions');
    if (DirectoryExists(hacknetExtensionsPath)) {
        const subDirs = await GetSubDirectories(hacknetExtensionsPath);
        result.push(...subDirs.filter(dir => CheckFolderIsHacknetExtensionFolder(dir)));
    }

    const workshopPath = path.join(steamPath, 'steamapps', 'workshop', 'content', '365450');
    if (DirectoryExists(workshopPath)) {
        const subDirs = await GetSubDirectories(workshopPath);
        result.push(...subDirs.filter(dir => CheckFolderIsHacknetExtensionFolder(dir)));
    }

    return result;
}

async function GetAllExtensionInfos():Promise<HacknetExtensionInfo[]> {
    const result:HacknetExtensionInfo[] = [];
    const folders = await GetAllExtensionPaths();

    for (const folder of folders) {
        const infoFilePath = path.join(folder, 'ExtensionInfo.xml');
        if (FileExists(infoFilePath)) {
            const xmlContent = fs.readFileSync(infoFilePath, 'utf8');
            const info = XmlParser.parse(xmlContent);
            result.push({
                Name: typeof info.HacknetExtension.Name === 'string' ? info.HacknetExtension.Name : info.HacknetExtension.Name['#text'],
                Path: folder,
            });
        }
    }

    return result;
}

export default function RegisterSelectHacknetExtensionCmd(context:vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.openSelectHacknetExtensionFolder', async () => {
        try {
            const extensions = await GetAllExtensionInfos();
            if (extensions.length === 0) {
                vscode.window.showInformationMessage('未找到任何Hacknet扩展');
                return;
            }

            const selected = await vscode.window.showQuickPick(extensions.map((ext, idx) => `${idx + 1}. ${ext.Name}`), {
                placeHolder: '选择要打开的Hacknet扩展',
            });

            if (selected) {
                const ext = extensions.find((ext, idx) => `${idx + 1}. ${ext.Name}` === selected);
                if (ext) {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(ext.Path));;
                }
            }
        } catch (error) {
            vscode.window.showInformationMessage('获取本地hacknet扩展目录失败: ' + error);
        }
    }));
}   