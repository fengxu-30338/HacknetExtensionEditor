import { parentPort, workerData } from 'worker_threads';
import { XMLParser as StandardXMLParser } from 'fast-xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

export interface XmlNodeParseResult {
    filepath: string
    node: any
}

// 获取配置
const { 
    scanFolder  // 扫描目录
} = workerData;

console.log("GlobalXmlScanerWorker: 开始扫描目录==================", workerData);

const xmlParser = new StandardXMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export async function ScanDirectory(dirPath:string) {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
            // 递归扫描子目录
            await ScanDirectory(fullPath);
        } else if (file.isFile()) {
            // 处理文件
            await processFile(fullPath);
        }
    }
}


async function processFile(fullPath: string) {
    if (!fullPath.endsWith('.xml')) {
        return;
    }

    try {
        const text = await fs.readFile(fullPath, 'utf-8');
        const msg: XmlNodeParseResult = {filepath: fullPath, node: xmlParser.parse(text)};
        parentPort?.postMessage(msg);
    } catch (error) {
        console.error(`GlobalXmlScanerWorker: 解析xml文件失败 ${fullPath}`, error);
    }
}


// 启动首次扫描
ScanDirectory(scanFolder);

// 监听其他解析消息
parentPort?.on('message', (filepath) => {
    processFile(filepath);
});