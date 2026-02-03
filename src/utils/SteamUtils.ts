import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { ReadRegistry } from './RegistryUtil';

const execAsync = promisify(exec);

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

/**
 * 获取Steam安装路径（综合方法）
 */
export async function GetSteamInstallPath(): Promise<string> {
    try {
        const registryPath = await GetSteamPathFromRegistry();
        return registryPath;
    } catch (error) {
        const commonPath = GetSteamPathFromCommonLocations();
        if (commonPath) {
            return commonPath;
        }
        throw new Error('无法找到Steam安装路径。请确保Steam已安装');
    }
}

/**
 * 获取Steam可执行文件路径
 */
export async function GetSteamExecutablePath(): Promise<string> {
    const steamPath = await GetSteamInstallPath();
    const exePath = join(steamPath, 'steam.exe');
    
    if (!existsSync(exePath)) {
        throw new Error(`在路径 ${steamPath} 中未找到steam.exe`);
    }
    
    return exePath;
}

/**
 * 检查Steam是否已安装
 */
export async function IsSteamInstalled(): Promise<boolean> {
    try {
        await GetSteamInstallPath();
        return true;
    } catch {
        return false;
    }
}
