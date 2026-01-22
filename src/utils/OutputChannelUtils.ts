import * as vscode from 'vscode';

export class OutputManager {
    private static instance: OutputManager;
    private outputChannel: vscode.OutputChannel;
    
    private constructor(channelName: string) {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
    }
    
    public static getInstance(channelName: string = 'HacknetExtensionHelper'): OutputManager {
        if (!OutputManager.instance) {
            OutputManager.instance = new OutputManager(channelName);
        }
        return OutputManager.instance;
    }
    
    // 输出信息
    public log(message: string, show: boolean = false): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
        
        if (show) {
            this.show();
        }
    }
    
    // 输出错误
    public error(error: any, show: boolean = true): void {
        const timestamp = new Date().toLocaleTimeString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${errorMessage}`);
        
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

export default OutputManager.getInstance();