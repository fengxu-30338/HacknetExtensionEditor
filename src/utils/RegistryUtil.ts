import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 读取注册表项
 */
export async function ReadRegistry(regPath: string, regKey: string): Promise<string | null> {
    try {
        const command = `reg query "${regPath}" /v "${regKey}"`;
        const result = await execAsync(command);
        const path = extractRegistryPath(result.stdout, regKey);
        if (path) {return path;}
        return null;
    } catch (error) {
        throw new Error(`获取Steam路径失败: ${error}`);
    }
}

/**
 * 从注册表查询结果中提取路径
 */
function extractRegistryPath(output: string, regKey: string): string | null {
    const match = output.match(new RegExp(`${regKey}\\s+REG_SZ\\s+(.+)`));
    return match ? match[1].trim() : null;
}