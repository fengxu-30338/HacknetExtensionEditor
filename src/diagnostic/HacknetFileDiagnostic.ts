import * as vscode from 'vscode';
import * as CommonUtils from '../utils/CommonUtils';
import path from 'path';
import { Worker } from 'worker_threads';
import lodash from "lodash";
import { Diagnostic, DiagnosticRequest, DiagnosticResult, DiagnosticWorkerMsg, DiagnosticWorkerMsgType, QueryRelativeFileReq, QueryRelativeFileResp } from './HacknetFileDiagnosticWorker';
import { CodeHints, GetHacknetEditorHintFileUri, HintFileExist } from '../code-hint/CodeHint';
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
    console.log(workerPath);
    const worker = new Worker(workerPath);
    context.subscriptions.push({ dispose: () => worker.terminate() });
    worker.on('message', msg => HandleDiagnosticWorkerMsg(msg, worker));

    // 创建诊断监听
    const debounceStartDiagnosticFile = lodash.debounce(StartDiagnosticFile, 1000);
    vscode.workspace.onDidChangeTextDocument(e => debounceStartDiagnosticFile(e.document.uri, worker));
    vscode.window.onDidChangeActiveTextEditor(e => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        debounceStartDiagnosticFile(editor.document.uri, worker);
    });
    vscode.window.onDidChangeVisibleTextEditors(e => {
        e.forEach(editor => {
            debounceStartDiagnosticFile(editor.document.uri, worker);
        });
    });


    // 解析完编辑器提示文件后获取所有xml文件执行诊断一次
    EventManager.onEvent(EventType.CodeHintParseCompleted, async () => {
        const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
        xmlFiles.forEach(uri => {
            StartDiagnosticFile(uri, worker);
        });
    });
    
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


// 开始诊断文件
async function StartDiagnosticFile(fileUri: vscode.Uri, worker:Worker) {
    if (!HintFileExist()) {
        return;
    }

    if (!fileUri.fsPath.toLocaleLowerCase().endsWith('.xml')) {
        return;
    }

    if (fileUri.fsPath === GetHacknetEditorHintFileUri().fsPath) {
        return;
    }
    
    const req:DiagnosticRequest = {
        filepath: fileUri.fsPath, 
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

