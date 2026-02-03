import dgram from 'dgram';
import { HacknetHotReplaceRequest } from './Request';
import { HacknetHotReplaceResponse } from './Response';
import OutputManager from '../../utils/OutputChannelUtils';
import { ReadRegistry } from '../../utils/RegistryUtil';

interface RequestPromiseWrapper<T> {
    msgType: string;
    sendTime: number;
    resolve: (response: HacknetHotReplaceResponse<T>) => void;
    reject: (error: Error) => void;
}

const RequestMap = new Map<string, RequestPromiseWrapper<any>>();
const client = dgram.createSocket('udp4');
let Timer: NodeJS.Timeout;
const HOST = '127.0.0.1';

client.on('error', (err) => {
    OutputManager.error(err);
    client.close();
});

export function InitUdpClient(localPort?: number) {
    client.bind(localPort || 0, HOST, () => {
        const localPort = client.address().port;
        OutputManager.log(`Hacknet HotReplace Client bound to port ${localPort}`);
    });
    Timer = setInterval(() => {
        const now = Date.now();
        for (const [msgGuid, wrapper] of RequestMap) {
            if (now - wrapper.sendTime > 30000) {
                wrapper.reject(new Error(`Command[${wrapper.msgType}], Request timeout`));
                RequestMap.delete(msgGuid);
            }
        }
    }, 500);
}

export function DeInitUdpClient() {
    client.close();
    clearInterval(Timer);
}


async function GetHotReplaceServerPort(): Promise<number> {
    try {
        const port = await ReadRegistry('HKEY_CURRENT_USER\\Software\\Hacknet', 'HotReplaceServerPort');
        if (port) {
            return parseInt(port);
        }

        throw new Error(`获取到热替换服务器端口信息异常:${port}，请先尝试启动服务后在执行该操作。`); 
    } catch (error) {
        throw new Error('未获取到热替换服务器端口，请先尝试启动服务后在执行该操作。'); 
    }
}

export async function SendRequest(request: HacknetHotReplaceRequest): Promise<HacknetHotReplaceResponse<any>> {
    const HotReplaceServePort = await GetHotReplaceServerPort();
    return new Promise<HacknetHotReplaceResponse<any>>((resolve, reject) => {
        const msg = request.GetMessage();
        OutputManager.log(`[HacknetHotReplaceClient] Message sent to ${HOST}:${HotReplaceServePort}, Content:\n${msg}`);
        client.send(msg, HotReplaceServePort, HOST, (err) => {
            if (err) {
                console.error('Failed to send message:', err);
                reject(err);
                return;
            }
            RequestMap.set(request.MsgGuid, {
                msgType: request.CommandType,
                sendTime: Date.now(),
                resolve,
                reject,
            });
        });
    });
}



client.on('message', (msg, rinfo) => {
    const msgStr = msg.toString();
    OutputManager.log(`[HacknetHotReplaceClient] Received message from ${rinfo.address}:${rinfo.port}, Content:\n${msgStr}`);
    try {
        const response = new HacknetHotReplaceResponse(msgStr);
        const wrapper = RequestMap.get(response.MsgGuid);
        if (wrapper) {
            wrapper.resolve(response);
            RequestMap.delete(response.MsgGuid);
        }
    } catch (error) {
        OutputManager.error(`Failed to parse message: ${error}`);
    }
});

