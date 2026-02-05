import vscode from 'vscode';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { ReadRegistry } from './RegistryUtil';
import * as CommonUtils from '../utils/CommonUtils';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface SteamPaths {
    installPath: string | null;
    steamAppsPath: string | null;
    libraryFolders: string[];
    executablePath: string | null;
}


export async function getSteamPathFromConfig(): Promise<string | null> {
    const homeDir = os.homedir();
    
    // 检查 Steam 配置文件
    const configPaths = [
        `${homeDir}/.steam/registry.vdf`,
        `${homeDir}/.local/share/Steam/config/config.vdf`,
        `${homeDir}/.steam/steam/config/config.vdf`,
    ];
    
    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf8');
                // 在配置文件中查找安装路径
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('"InstallConfigStore"') || 
                        lines[i].includes('"BaseInstallFolder"')) {
                        // 查找包含路径的行
                        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                            if (lines[j].includes('"') && !lines[j].includes('"Steam"')) {
                                const match = lines[j].match(/"([^"]+)"/);
                                if (match && match[1]) {
                                    let foundPath = match[1];
                                    // 替换转义字符
                                    foundPath = foundPath.replace(/\\\\/g, '/');
                                    if (fs.existsSync(foundPath)) {
                                        return foundPath;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('读取配置文件失败:', error);
            }
        }
    }
    
    return null;
}

export async function findSteamPath(): Promise<{
    path: string | null;
    source: string;
    isFlatpak?: boolean;
    isSnap?: boolean;
}> {
    const result = {
        path: null as string | null,
        source: 'not found',
        isFlatpak: false,
        isSnap: false
    };
    
    // 1. 检查 Flatpak 安装
    const flatpakPath = `${os.homedir()}/.var/app/com.valvesoftware.Steam/data/Steam`;
    if (fs.existsSync(flatpakPath)) {
        result.path = flatpakPath;
        result.source = 'flatpak';
        result.isFlatpak = true;
        return result;
    }
    
    // 2. 检查 Snap 安装
    try {
        const snapPath = `${os.homedir()}/snap/steam/common/.steam`;
        if (fs.existsSync(snapPath)) {
            result.path = snapPath;
            result.source = 'snap';
            result.isSnap = true;
            return result;
        }
    } catch (error) {
        // 忽略错误
    }
    
    // 3. 检查环境变量
    if (process.env.STEAM && fs.existsSync(process.env.STEAM)) {
        result.path = process.env.STEAM;
        result.source = 'environment variable';
        return result;
    }
    
    // 4. 检查常见路径
    const commonPaths = [
        `${os.homedir()}/.local/share/Steam`,
        `${os.homedir()}/.steam/steam`,
        `${os.homedir()}/.steam`,
        `${os.homedir()}/Steam`,
    ];
    
    for (const steamPath of commonPaths) {
        if (fs.existsSync(steamPath) && 
            (fs.existsSync(path.join(steamPath, 'steamapps')) || 
             fs.existsSync(path.join(steamPath, 'SteamApps')))) {
            result.path = steamPath;
            result.source = 'common path';
            return result;
        }
    }
    
    // 5. 从配置文件查找
    const configPath = await getSteamPathFromConfig();
    if (configPath) {
        result.path = configPath;
        result.source = 'config file';
        return result;
    }
    
    return result;
}

export async function getSteamPathsFromLinux(): Promise<SteamPaths> {
    const steamPath = await findSteamPath();
    
    if (!steamPath.path) {
        return {
            installPath: null,
            steamAppsPath: null,
            libraryFolders: [],
            executablePath: null
        };
    }
    
    const result: SteamPaths = {
        installPath: steamPath.path,
        steamAppsPath: null,
        libraryFolders: [],
        executablePath: null
    };
    
    // 获取 steamapps 路径
    const possibleAppsPaths = [
        path.join(steamPath.path, 'steamapps'),
        path.join(steamPath.path, 'SteamApps'),
        path.join(steamPath.path, 'steam', 'steamapps')
    ];
    
    for (const appsPath of possibleAppsPaths) {
        if (fs.existsSync(appsPath)) {
            result.steamAppsPath = appsPath;
            break;
        }
    }
    
    // 获取库文件夹列表
    if (result.steamAppsPath) {
        const libraryFile = path.join(result.steamAppsPath, 'libraryfolders.vdf');
        if (fs.existsSync(libraryFile)) {
            try {
                const content = fs.readFileSync(libraryFile, 'utf8');
                // 解析 VDF 文件查找路径
                const pathMatches = content.match(/"path"\s+"([^"]+)"/g);
                if (pathMatches) {
                    for (const match of pathMatches) {
                        const pathMatch = match.match(/"path"\s+"([^"]+)"/);
                        if (pathMatch && pathMatch[1]) {
                            const libPath = pathMatch[1].replace(/\\\\/g, '/');
                            if (fs.existsSync(libPath)) {
                                result.libraryFolders.push(libPath);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('解析 libraryfolders.vdf 失败:', error);
            }
        }
    }
    
    // 查找可执行文件
    const possibleExecutables = [
        path.join(steamPath.path, 'steam.sh'),
        path.join(steamPath.path, 'steam'),
        path.join(steamPath.path, 'ubuntu12_32', 'steam'),
        '/usr/bin/steam',
        '/usr/games/steam'
    ];
    
    for (const execPath of possibleExecutables) {
        try {
            fs.accessSync(execPath, fs.constants.X_OK);
            result.executablePath = execPath;
            break;
        } catch {
            // 继续尝试下一个
        }
    }
    
    return result;
}

/**
 * 通过注册表获取Steam安装路径
 */
export async function GetSteamPathFromRegistry(): Promise<string> {
    try {
        // 尝试从64位注册表获取
        const path64 = await ReadRegistry('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
        if (path64) {return path64;}

        // 尝试从32位注册表获取
        const path32 = await ReadRegistry('HKEY_LOCAL_MACHINE\\SOFTWARE\\Valve\\Steam', 'InstallPath');
        if (path32) {return path32;}

        throw new Error('无法在注册表中找到Steam安装路径');
    } catch (error) {
        throw new Error(`获取Steam路径失败: ${error}`);
    }
}

/**
 * 从注册表查询结果中提取路径
 */
function extractRegistryPath(output: string): string | null {
    const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/);
    return match ? match[1].trim() : null;
}

/**
 * 通过常见安装目录查找Steam路径
 */
export function GetSteamPathFromCommonLocations(): string | null {
    const commonPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        process.env.ProgramFiles + '\\Steam',
        process.env['ProgramFiles(x86)'] + '\\Steam',
        join(process.env.USERPROFILE || '', 'Steam'),
        join(process.env.USERPROFILE || '', 'Program Files', 'Steam'),
    ];

    for (const path of commonPaths) {
        if (path && existsSync(path)) {
            return path;
        }
    }
    return null;
}

function GetSteamInstallPathFromConfig():string | undefined {
    const config = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hotReplace');
    const steamInstallPath = config.get<string>('steamInstallPath');
    if (steamInstallPath && steamInstallPath !== 'auto') {
        // 检查该路径地下是否存在steam可执行文件
        const filepath = path.join(steamInstallPath, `steam${CommonUtils.IsWindows() ? 'exe' : ''}`);
        if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) {
            throw new Error('配置的Steam安装路径下未找到steam可执行文件路径，路径可能配置的不正确');
        }
        return steamInstallPath;
    }
}

async function GetSteamInstallPathFromWindows(): Promise<string> {
    try {
        const registryPath = await GetSteamPathFromRegistry();
        return registryPath;
    } catch (error) {
        const commonPath = GetSteamPathFromCommonLocations();
        if (commonPath) {
            return commonPath;
        }
        throw new Error('无法找到Steam安装路径，请在配置文件中手动配置');
    }
}



export async function GetSteamInstallPath(): Promise<string> {
    const steamInstallPath = GetSteamInstallPathFromConfig();
    if (steamInstallPath) {
        return steamInstallPath;
    }

    if (CommonUtils.IsWindows()) {
        return await GetSteamInstallPathFromWindows();
    } else {
        const pathInfo = await getSteamPathsFromLinux();
        if (!pathInfo.installPath) {
            throw new Error('无法找到Steam安装路径，请在配置文件中手动配置');
        }

        return pathInfo.installPath;
    }
}