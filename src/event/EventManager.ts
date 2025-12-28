import { EventEmitter } from 'events';

export enum EventType {
    CodeHintSourceChange = 'CodeHintSourceChange',
    CodeHintParseCompleted = 'CodeHintParseCompleted',
    HacknetNodeFileChange = 'HacknetNodeFileChange',
}


// 创建事件发射器实例
class MyEventManager {
    private static instance: MyEventManager;
    private eventEmitter: EventEmitter;

    private constructor() {
        this.eventEmitter = new EventEmitter();
    }

    public static getInstance(): MyEventManager {
        if (!MyEventManager.instance) {
            MyEventManager.instance = new MyEventManager();
        }
        return MyEventManager.instance;
    }

    // 触发自定义事件
    public fireEvent(eventName: EventType, data?: any): void {
        this.eventEmitter.emit(eventName, data);
    }

    // 监听自定义事件
    public onEvent(eventName: EventType, listener: (data?: any) => void): void {
        this.eventEmitter.on(eventName, listener);
    }

    // 移除事件监听器
    public removeListener(eventName: EventType, listener: (data?: any) => void): void {
        this.eventEmitter.removeListener(eventName, listener);
    }

    // 移除所有事件监听器
    public removeAllListeners(): void {
        this.eventEmitter.removeAllListeners();
    }
}

export const EventManager = MyEventManager.getInstance();