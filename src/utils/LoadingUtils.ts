import * as vscode from 'vscode';

interface LoadingInfo {
    message: string;
    id: LoadingId;
}

export type LoadingId = number;

// id生成器
let IdGenerator: LoadingId = 0;
// 存放所有的loading
const loadingArr: LoadingInfo[] = [];

// 创建状态栏项
const loadingStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right, 
    100
);

// 显示 loading
export function ShowLoading(message: string = '加载中...'):LoadingId {
    loadingStatusBar.text = `$(loading~spin) ${message}`;
    loadingStatusBar.show();
    const loadingInfo: LoadingInfo = {
        message,
        id: IdGenerator++
    };
    loadingArr.push(loadingInfo);
    return loadingInfo.id;
}

// 关闭 loading
export function CloseLoading(id: LoadingId) {
    const index = loadingArr.findIndex(item => item.id === id);
    if (index < 0) {
        return;
    }

    if (index === loadingArr.length - 1) {
        loadingArr.pop();
        if (loadingArr.length > 0) {
            const lastLoading = loadingArr[loadingArr.length - 1];
            loadingStatusBar.text = `$(loading~spin) ${lastLoading.message}`;
            loadingStatusBar.show();
        } else {
            loadingStatusBar.hide();
        }

        return;
    }

    loadingArr.splice(index, 1);
}