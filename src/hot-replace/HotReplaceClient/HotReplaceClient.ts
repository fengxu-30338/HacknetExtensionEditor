import * as vscode from 'vscode';
import { ReadRegistry } from "../../utils/RegistryUtil";
import * as SteamUtils from "../../utils/SteamUtils";
import * as HotReplaceClientUtil  from '../CommandHandler/Client';
import * as CommonUtils from '../../utils/CommonUtils';
import OutputManager from '../../utils/OutputChannelUtils';
import { ShowLoading, CloseLoading } from '../../utils/LoadingUtils';
import { exec } from 'child_process';
import { promisify } from 'util';
import path, { dirname } from 'path';
import fs from 'fs';
import os from 'os';
import { HacknetHotReplaceRequest } from '../CommandHandler/Request';
import * as HotReplaceRequest from '../CommandHandler/Request';
import { HacknetHotReplaceResponse } from '../CommandHandler/Response';
import { getAllProcessNames } from '../../utils/ProcessUtils';

const execAsync = promisify(exec);
let InSendRequestPreCheck = false;

/**
 * 检查热替换服务器是否在线
 * @returns 是否在线
 */
async function CheckHotReplaceServerOnline(): Promise<boolean> {
    try {
        let timespan:string | null = null;
        if (CommonUtils.IsWindows()) {
            timespan = await ReadRegistry('HKEY_CURRENT_USER\\Software\\Hacknet', 'HotReplaceServerOnlineTimespan');
            if (!timespan) {
                return false;
            }
        } else {
            timespan = (await fs.promises.readFile(`${os.homedir()}/.HacknetHotReplace/HotReplaceServerOnlineTimespan`)).toString();
            if (!timespan) {
                return false;
            }
        }

        const timespanMill = parseInt(timespan);

        const currentTimespan = Date.now();
        if (currentTimespan - timespanMill < 6000) {
            return true;
        }
    } catch (error) {
        console.log(`检查热替换服务器是否在线失败: ${error}`);
        throw error;
    }

    return false;
}

async function GetHacknetFolder(): Promise<string> {
    const steamPath = await SteamUtils.GetSteamInstallPath();
    const folder = path.join(steamPath, 'steamapps', 'common', 'Hacknet');
    if (!fs.existsSync(folder)) {
        throw new Error('未获取到Hacknet文件夹，可能未安装Hacknet');
    }
    return folder;
}

async function GetHacknetExePath(): Promise<string> {
    const config = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hotReplace');
    let hacknetExePath = config.get<string>('hacknetExePath') || null;
    if (!hacknetExePath || hacknetExePath.toLowerCase() === 'auto') {
        const hacknetFolder = await GetHacknetFolder();
        const defaultName = CommonUtils.IsWindows() ? 'Hacknet.exe' : 'StartPathfinder.sh';
        hacknetExePath = path.join(hacknetFolder, defaultName);
        if (!hacknetExePath) {
            throw new Error(`未获取到${defaultName}路径，可能未安装Hacknet`);
        }
    }
    hacknetExePath = hacknetExePath.trim().replace(/^["']|["']$/g, '');

    if (!fs.existsSync(hacknetExePath)) {
        throw new Error(`Hacknet执行文件路径不存在: ${hacknetExePath}`);
    }

    // 检查该路径是否是一个文件
    if (!fs.statSync(hacknetExePath).isFile()) {
        throw new Error(`请指定一个Hacknet的执行文件路径，而非目录`);
    }

    return hacknetExePath;
}

async function CheckHacknetProcessExist(): Promise<boolean> {
    try {
        const hacknetExePath = await GetHacknetExePath();
        const fileName = path.basename(hacknetExePath);
        const processes = await getAllProcessNames();
        const isExist = processes.some((process) => process === 'Hacknet.exe' || process === 'HacknetPathfind' || process === fileName);
        return isExist;
    } catch (error) {
        throw new Error(`检查Hacknet进程失败: ${error}`);
    }
}

async function KillHacknetProcessForWindows() {
    const loadingId = ShowLoading('关闭Hacknet进程中...');
    try {
        const command = `taskkill /F /IM Hacknet.exe`;
        await execAsync(command);

        // 等待进程关闭
        await CommonUtils.IntervalCheck(async () => !(await CheckHacknetProcessExist()), 500, 30000, '关闭Hacknet进程超时');
    } catch (error) {
        throw new Error(`关闭Hacknet进程失败: ${error}`);
    } finally {
        CloseLoading(loadingId);
    }
}

async function TipUseraCloseHacknetProcessIfExist(tipMsg:string): Promise<void> {
    const hacknetProcessExist = await CheckHacknetProcessExist();
    if (!hacknetProcessExist) {
        return;
    }

    if (CommonUtils.IsWindows()) {
        const result = await vscode.window.showInformationMessage(tipMsg, {modal: true}, '关闭Hacknet进程');
        if (result !== '关闭Hacknet进程') {
            throw new Error('请先关闭Hacknet进程后在尝试执行该操作');
        }

        await KillHacknetProcessForWindows();
    } else {
        throw new Error(tipMsg);
    }
}

/**
 * 检查并更新热替换动态库
 */
async function CheckAndUpdateHotReplaceDll() {
    const hacknetFolder = await GetHacknetFolder();
    const localDllPath = CommonUtils.GetFilepathInExtension('resources/HotReplace/HacknetHotReplace.dll');
    const dllName = 'HacknetHotReplace.dll';
    const hotReplaceDllFolder = path.join(hacknetFolder, 'BepInEx', 'plugins');
    const hotReplaceDllFullPath = path.join(hotReplaceDllFolder, dllName);
    if (!fs.existsSync(hotReplaceDllFolder)) {
        throw new Error(`全局PathFinder插件路径不存在，请安装PathFinder后才执行该操作。`);
    }

    if (!fs.existsSync(hotReplaceDllFullPath)) {
        // 直接覆盖
        await fs.promises.copyFile(localDllPath, hotReplaceDllFullPath);
        OutputManager.log(`热替换服务插件已安装成功，路径: ${hotReplaceDllFullPath}`);
        // 检查Hacknet.exe进程是否启动，启动则提醒用户需要重启
        await TipUseraCloseHacknetProcessIfExist('热替换服务插件已安装成功，检测到Hacknet.exe进程已启动，需要关闭后重启才可生效。');
        return;
    }
    
    const localDllHash = await CommonUtils.GetFileHash(localDllPath);
    const hotReplaceDllHash = await CommonUtils.GetFileHash(hotReplaceDllFullPath);
    if (localDllHash === hotReplaceDllHash) {
        return;
    }
    // 检查Hacknet.exe进程是否启动，启动则提醒用户需要关闭Hacknet.exe，覆盖dll，在重启Hacknet.exe
    await TipUseraCloseHacknetProcessIfExist('热替换服务插件需要更新，检测到Hacknet.exe进程已启动，需要关闭后才可执行更新。');
    // 覆盖dll
    await fs.promises.copyFile(localDllPath, hotReplaceDllFullPath);
    OutputManager.log(`热替换服务插件更新成功，路径: ${hotReplaceDllFullPath}`);
}

async function GetHacknetStartCommand():Promise<{folder: string, command: string}> {
    const config = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hotReplace');
    const hacknetExePath = await GetHacknetExePath();
    const args = config.get<string>('hacknetExeStartArgs') || '';
    
    return {
        folder: dirname(hacknetExePath!),
        command: `${CommonUtils.IsWindows() ? '.\\' : 'bash '}${path.basename(hacknetExePath!)} ${args}`
    };
}

/**
 * hacknet热替换指令运行前检查
 */
async function RunHotReplaceCommandPreCheck() {
    while (InSendRequestPreCheck) {
        // 等待check完成
        await CommonUtils.IntervalCheck(() => !InSendRequestPreCheck, 5, 30000);
    }

    try {
        InSendRequestPreCheck = true;
        // 更新热替换动态库
        await CheckAndUpdateHotReplaceDll();

        // hacknet进程存在时，检查热替换服务是否运行
        const hacknetProcessExist = await CheckHacknetProcessExist();
        if (hacknetProcessExist) {
            const hotReplaceServerOnline = await CheckHotReplaceServerOnline();
            if (!hotReplaceServerOnline) {
                throw new Error('热替换服务未运行，可能的原因是您未安装或启用PathFinder插件,或系统配置的Hacknet非PathFinder版本，请自行在设置中配置PF版本的启动路径');
            }
        } else {
            // 启动Hacknet.exe并等待热替换服务启动
            const hacknetStartCmd = await GetHacknetStartCommand();
            try {
                const terminal = vscode.window.createTerminal({
                    name: 'HacknetHotReplace',
                    cwd: hacknetStartCmd.folder
                });
                terminal.sendText(hacknetStartCmd.command);
                terminal.show();
            } catch (error) {
                throw new Error(`启动Hacknet.exe失败: ${error}`);
            }

            // 等待热替换服务启动
            const loadingId = ShowLoading('正在启动Hacknet.exe并等待热替换服务开启...');
            try {
                await CommonUtils.IntervalCheck(() => CheckHotReplaceServerOnline(), 100, 30000);
                OutputManager.log('Hacknet热替换服务已启动');
            } catch (error) {
                throw new Error('热替换服务启动超时，可能的原因是您未安装或启用PathFinder插件');
            } finally  {
                CloseLoading(loadingId);
            }  
        }
    } finally {
        InSendRequestPreCheck = false;
    }
}


class HotReplaceClient {
    private static Instance: HotReplaceClient;
    private constructor(){}

    public static getInstance(): HotReplaceClient {
        if (!HotReplaceClient.Instance) {
            HotReplaceClient.Instance = new HotReplaceClient();
        }
        return HotReplaceClient.Instance;
    }

    private async CommonSendRequest<T extends HacknetHotReplaceRequest>(request: T, timeout: number = 30000): Promise<HacknetHotReplaceResponse<any>> {
        await RunHotReplaceCommandPreCheck();
        const response = await HotReplaceClientUtil.SendRequest(request, timeout);
        if (!response.Success) {
            throw new Error(`执行指令[${request.CommandType}]失败: ${response.ErrorMsg}`);
        }
        return response;
    }

    /**
     * 使Hacknet进入指定扩展
     * @param reqPayload 进入扩展请求参数
     */
    public async EnterExtension(reqPayload: HotReplaceRequest.EnterExtensionRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.EnterExtensionRequest(reqPayload));
    }

    /**
     * 热重载指定计算机
     * @param reqPayload 热重载计算机请求参数
     */
    public async HotReloadComputer(reqPayload: HotReplaceRequest.HotReloadComputerRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadComputerRequest(reqPayload));
    }

    /**
     * 连接指定计算机并赋予该计算机的Admin权限
     * @param reqPayload 连接计算机请求参数
     */
    public async ConnectComputerAndGrantAdmin(reqPayload: HotReplaceRequest.ConnectComputerRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.ConnectComputerRequest(reqPayload));
    }

    /**
     * 热重载指定任务
     * @param reqPayload 热重载任务请求参数
     */
    public async HotReloadMission(reqPayload: HotReplaceRequest.HotReloadMissionRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadMissionRequest(reqPayload));
    }

    /**
     * 热重载指定Action
     * @param reqPayload 热重载Action请求参数
     */
    public async HotReloadAction(reqPayload: HotReplaceRequest.HotReloadActionRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadActionRequest(reqPayload));
    }

    /**
     * 热重载指定主题文件
     * @param reqPayload 热重载主题请求参数
     */
    public async HotReloadTheme(reqPayload: HotReplaceRequest.HotReloadThemeRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadThemeRequest(reqPayload));
    }

    /**
     * 热重载指定Faction文件
     * @param reqPayload 热重载Faction请求参数
     */
    public async HotReloadFaction(reqPayload: HotReplaceRequest.HotReloadFactionRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadFactionRequest(reqPayload));
    }

    /**
     * 热重载所有People文件
     */
    public async HotReloadPeople(): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.HotReloadPeopleRequest());
    }

    /**
     * 执行指定Action
     * @param reqPayload 执行Action请求参数
     */
    public async ExecuteAction(reqPayload: HotReplaceRequest.ExecuteActionRequestPayload): Promise<void> {
        await this.CommonSendRequest(new HotReplaceRequest.ExecuteActionRequest(reqPayload));
    }

    /**
     * 打印当前Os信息
     */
    public async PrintOsInfo(): Promise<string> {
        const res = await this.CommonSendRequest(new HotReplaceRequest.PrintOsInfoRequest());
        return res.Payload as string;
    }

    /**
     * 打印当前Computer信息
     * @param reqPayload 打印Computer信息请求参数
     */
    public async PrintComputerInfo(reqPayload: HotReplaceRequest.PrintComputerRequestPayload): Promise<string> {
        const res = await this.CommonSendRequest(new HotReplaceRequest.PrintComputerInfoRequest(reqPayload));
        return res.Payload as string;
    }

    /**
     * 分析绘制调用
     * @param reqPayload 分析绘制调用请求参数
     */
    public async AnalysisDrawCall(reqPayload: HotReplaceRequest.AnalysisDrawCallRequestPayload): Promise<string> {
        const res = await this.CommonSendRequest(new HotReplaceRequest.AnalysisDrawCallRequest(reqPayload), 40000);
        return res.Payload as string;
    }
}

export default HotReplaceClient.getInstance();




export async function InitHotReplaceClent() {
    const context = CommonUtils.GetExtensionContext();

    HotReplaceClientUtil.InitUdpClient();
    context.subscriptions.push({
        dispose: () => {
            HotReplaceClientUtil.DeInitUdpClient();
        }
    });
    OutputManager.log('热替换Client初始化完成');
}