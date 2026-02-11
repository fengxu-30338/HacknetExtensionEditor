import * as childProcess from 'child_process';
import * as os from 'os';

export async function getAllProcessNames(): Promise<string[]> {
    try {
        const platform = os.platform();
        let command: string;
        
        switch (platform) {
            case 'win32':
                command = 'tasklist /FO CSV /NH';
                break;
            default:
                command = 'ps -eo comm --no-headers';
        }
        
        const result = await executeCommand(command);
        return parseProcessOutput(result, platform);
        
    } catch (error) {
        console.error('Failed to get process list:', error);
        return [];
    }
}

function executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        childProcess.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

function parseProcessOutput(output: string, platform: string): string[] {
    const processNames: string[] = [];
    const lines = output.trim().split(/\r?\n/).filter(line => line.length > 0);
    
    for (const line of lines) {
        let processName: string;
        
        switch (platform) {
            case 'win32':
                processName = parseWindowsProcess(line);
                break;
            default:
                processName = line.trim();
        }
        
        if (processName && !processNames.includes(processName)) {
            processNames.push(processName);
        }
    }
    
    return processNames;
}

function parseWindowsProcess(line: string): string {
    const parts = line.split(',');
    if (parts.length > 0) {
        const name = parts[0].replace(/"/g, '').trim();
        return name;
    }
    return '';
}