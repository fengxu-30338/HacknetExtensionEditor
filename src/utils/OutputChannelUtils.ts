import * as vscode from 'vscode';

class OutputManager {
    private static instance: OutputManager;
    private outputChannel: vscode.LogOutputChannel;
    
    private constructor(channelName: string) {
        this.outputChannel = vscode.window.createOutputChannel(channelName, {log: true});
    }
    
    public static getInstance(channelName: string = 'HacknetExtensionHelper'): OutputManager {
        if (!OutputManager.instance) {
            OutputManager.instance = new OutputManager(channelName);
        }
        return OutputManager.instance;
    }

    public debug(message: string, show: boolean = false): void {
        const viewConfig = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.viewer');
        const showDebugMessage = viewConfig.get<boolean>('showDebugMessage') || false;
        if (!showDebugMessage) {return;}

        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [DEBUG] ${message}`);
        this.outputChannel.info(`${message}`);
        
        if (show) {
            this.show();
        }
    }
    
    // 输出信息
    public log(message: string, show: boolean = false): void {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [INFO] ${message}`);
        this.outputChannel.info(`${message}`);
        
        if (show) {
            this.show();
        }
    }
    
    // 输出错误
    public error(error: any, show: boolean = true): void {
        const timestamp = new Date().toLocaleTimeString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${timestamp}] [ERROR] ${errorMessage}`);
        this.outputChannel.error(error);
        
        if (show) {
            this.show();
        }
    }
    
    // 显示输出面板
    public show(preserveFocus: boolean = false): void {
        this.outputChannel.show(preserveFocus);
    }
    
    // 隐藏输出面板
    public hide(): void {
        this.outputChannel.hide();
    }
    
    // 清空输出
    public clear(): void {
        this.outputChannel.clear();
    }
    
    // 释放资源
    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// 导出实例
export default OutputManager.getInstance();

// 导出类型
export { OutputManager };