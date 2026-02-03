import { ParseTextToObj } from "./Message";

export class HacknetHotReplaceResponse<T> {
    /** 命令类型 */
    public CommandType!: string;
    /** 消息GUID */
    public MsgGuid!: string;
    /** 是否成功 */
    public Success!: boolean;
    /** 错误信息 */
    public ErrorMsg: string = '';
    /** 响应负载 */
    public Payload!: T;

    constructor(responseMsg: string) {
        this.ParseResponseMsg(responseMsg);
    }

    private ParseResponseMsg(responseMsg: string) {
        const obj = ParseTextToObj(responseMsg);
        if (!('CommandResponse' in obj)) {
            throw new Error('ResponseMsg is not a CommandResponse');
        }

        const commandResponse = obj['CommandResponse'];
        this.CommandType = commandResponse['CommandType'];
        this.MsgGuid = commandResponse['MsgGuid'];
        this.Success = commandResponse['Success'].toLowerCase() === 'true';

        const payload = commandResponse['Payload'];
        if (!this.Success) {
            this.ErrorMsg = payload;
        }
        this.Payload = payload;
    }
}

type CommonResponsePayload = string;