import * as vscode from 'vscode';
import * as CommonUtils from '../utils/CommonUtils';
import path from 'path';
import { Worker } from 'worker_threads';
import { Diagnostic, DiagnosticRequest, DiagnosticResult, DiagnosticWorkerDataType, DiagnosticWorkerMsg, DiagnosticWorkerMsgType, QueryRelativeFileReq, QueryRelativeFileResp } from './HacknetFileDiagnosticWorker';
import { CodeHints, HintFileExist } from '../code-hint/CodeHint';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { EventManager, EventType } from '../event/EventManager';


// 诊断集合
let diagnosticCollection!: vscode.DiagnosticCollection;


/**
 * 开始诊断文件错误
 */
export function StartDiagnostic() {
    const context = CommonUtils.GetExtensionContext();
    // 创建诊断集合
    diagnosticCollection = vscode.languages.createDiagnosticCollection('hacknet');
    context.subscriptions.push(diagnosticCollection);

    // 创建诊断worker
    const workerPath = path.join(__dirname, 'HacknetFileDiagnosticWorker.js');
    const workerData: DiagnosticWorkerDataType = {
        workspacePath: CommonUtils.GetWorkspaceRootUri()!.fsPath
    };
    const worker = new Worker(workerPath, {workerData});
    context.subscriptions.push({ dispose: () => worker.terminate() });
    worker.on('message', msg => HandleDiagnosticWorkerMsg(msg, worker));
    worker.on('error', error => console.error('DiagnosticWorker error:', error));

    // 创建诊断监听(使用filepath做防抖，相同的filepath 1秒内只执行一次)
    const debounceStartDiagnosticFile = CommonUtils.debounce(StartDiagnosticFile, 1000, 0);
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    // 文件内容变更（磁盘层面）
    watcher.onDidChange(uri => {
        // console.log('文件变更', uri.fsPath);
        debounceStartDiagnosticFile(uri.fsPath, true, false, worker);
    });

    // 文件创建
    watcher.onDidCreate(uri => {
        // console.log('文件创建', uri.fsPath);
        debounceStartDiagnosticFile(uri.fsPath, true, false, worker);
    });

    // 文件删除
    watcher.onDidDelete(uri => {
        // console.log('文件删除', uri.fsPath);
        debounceStartDiagnosticFile(uri.fsPath, true, false, worker);
    });
    context.subscriptions.push(watcher);

    // 监听xml节点变动
    EventManager.onEvent(EventType.HacknetNodeFileChange, (e) => {
        // console.log('xml节点变动');
        if (e.filepath) {
            debounceStartDiagnosticFile(e.filepath, true, false, worker);
        }
    });


    // 解析完编辑器提示文件后获取所有xml文件执行诊断一次
    EventManager.onEvent(EventType.CodeHintParseCompleted, () => ScanAllXmlFileForDiagnostic(worker));

    // 每隔10分钟全部扫描一次，清理可能改变的文件依赖关系
    const timer = setInterval(() => {
        ScanAllXmlFileForDiagnostic(worker);
    }, 10 * 60 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
    
}

// 处理worker发送过来的消息
async function HandleDiagnosticWorkerMsg(msg:DiagnosticWorkerMsg, worker: Worker) {
    // console.log("HandleDiagnosticWorkerMsg", msg.type, msg.data);
    switch (msg.type) {
        case DiagnosticWorkerMsgType.DiagnosticResp:
            HandleDiagnosticResult(msg.data);
            break;
        
        case DiagnosticWorkerMsgType.QueryRelativeFileReq:
            HandleQueryRelativeFileResp(msg.data, worker);
            break;
    }
}

// 处理查询文件相对路径请求
async function HandleQueryRelativeFileResp(req: QueryRelativeFileReq, worker: Worker) {
    // console.log('收到查询文件请求', req);
    const resp:QueryRelativeFileResp = {
        id: req.id,
        result: []
    };
    const rootUri = CommonUtils.GetWorkspaceRootUri()!;
    const uriArr = await vscode.workspace.findFiles(req.queryStr);

    if (req.queryFolder) {
        const folders = uriArr.map(uri => path.relative(rootUri.fsPath, vscode.Uri.joinPath(uri, '..').fsPath).replaceAll('\\', '/'));
        resp.result.push(...new Set<string>(folders));
    } else {
        resp.result.push(...uriArr.map(uri => path.relative(rootUri.fsPath, uri.fsPath).replaceAll('\\', '/')));
    }

    // console.log('处理查询文件结果', resp);
    worker.postMessage(resp);
}

// 处理诊断结果
function HandleDiagnosticResult(result:DiagnosticResult) {
    const uri = vscode.Uri.file(result.filepath);
    if (result.result.length > 0) {
        diagnosticCollection.set(uri, ParseDiagnosticToVscodeFormat(result.result));
    } else {
        diagnosticCollection.delete(uri);
    }
}

// 扫描所有的xml文件诊断
async function ScanAllXmlFileForDiagnostic(worker:Worker) { 
    const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
    StartDiagnosticFile(xmlFiles.map(uri => uri.fsPath), false, true, worker);
}

// 开始诊断文件
async function StartDiagnosticFile(filepath:string | string[], scanDepedencyFile:boolean, reset:boolean, worker:Worker) {
    if (!HintFileExist()) {
        return;
    }

    const req:DiagnosticRequest = {
        filepath,
        scanDepedencyFile,
        resetDepedencyTable: reset,
        nodeHints: [...CodeHints.NodeCodeHintSource], 
        nodeHolder: hacknetNodeHolder
    };
    const msg: DiagnosticWorkerMsg = {
        type: DiagnosticWorkerMsgType.DiagnosticReq,
        data: req
    };
    worker.postMessage(msg);
}

function ParseDiagnosticToVscodeFormat(diagnostic: Diagnostic[]): vscode.Diagnostic[]{
    return diagnostic.map(item => {
        const diag = new vscode.Diagnostic(
            new vscode.Range(item.range.startLine, item.range.startCharacter, item.range.endLine, item.range.endCharacter), 
            item.message, (item.type as any) as vscode.DiagnosticSeverity);
        diag.source = item.source;

        return diag;
    });
}

