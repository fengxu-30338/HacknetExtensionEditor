declare module 'moo' {
    export interface MooToken {
        col: number
        line: number
        lineBreaks: number
        offset: number
        text: string
        type: string
        value: string
    }

    interface MooLexer {
        reset: (arg0: string) => void
        next: () => MooToken
    }

    interface Moo {
        compile: (arg0: any) => MooLexer
    }

    const defalutObj: Moo;

    export default defalutObj;
}