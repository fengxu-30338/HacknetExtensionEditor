import moo, { MooToken } from 'moo';

const tokenDefine = {
    xmlStart:           {match: /<\?xml .*?\?>/, lineBreaks: true},
    xmlTagEnd:          {match: /(?:<\/[a-zA-Z_][\w\-]*>|\/>)/, lineBreaks: true},
    xmlTagStart:        {match: /<[a-zA-Z_][\w\-]*/, value: (text:string) => text.substring(1)},
    comment:            {match: /<!--(?:[^-]|-(?!->))*-->/s, lineBreaks: true},
    // 下面解析content时都可能为content
    attrValue:          {match: /(?:"[^"]*"|'[^']*')/, lineBreaks: true, value: (text:string) => text.substring(1, text.length - 1)},
    attrName:           /[a-zA-Z_][\w\-]+/,
    space:              {match: /[ \t\r\n]+/, lineBreaks: true },
    equal:              '=',
    content:            {match: /[^<>]+/, lineBreaks: true },
    xmlTagClose:        '>',
} as const;

type TokenType = {
    [key in keyof typeof tokenDefine]: string;
};

const TokenTypes: TokenType = {} as TokenType;
Object.keys(tokenDefine).forEach(key => (TokenTypes as any)[key] = key);

export interface ParseOption {
    needToken: boolean
    activeOffset: number
}

export class Node {
    public name: string;
    public nameToken: MooToken | null = null;
    public attribute: Map<string, string>;
    public attributeNameToken: Map<string, MooToken>;
    public attributeValueToken: Map<string, MooToken>;
    public children: Node[];
    public content:string = '';
    public contentToken: MooToken | null = null;
    public parent: Node | null;
    public nodePath: string;
    public level: number;

    constructor(name:string, parent: Node | null = null) {
        this.name = name;
        this.attribute = new Map();
        this.attributeNameToken = new Map();
        this.attributeValueToken = new Map();
        this.children = [];
        this.parent = parent;
        this.level = 1;
        this.nodePath =  this.GetNodePath();
    }

    private GetNodePath(): string {
        let path = this.name;
        let node = this.parent;
        while (node !== null) {
            path = node.name + '.' + path;
            node = node.parent;
            this.level++;
        }

        return path;
    }

    public get root():Node {
        let node:Node = this;
        while (node.parent !== null) {
            node = node.parent;
        }
        return node;
    }

    public GetNodesByNodePath(nodePath: string): Node[] {
        const nodes:Node[] = [];
        const res:Node[] = [];
        const pathLevel = nodePath.split('.').length;
        nodes.push(this);

        while (nodes.length > 0) {
            const node = nodes.shift()!;
            if (node.nodePath === nodePath) {
                res.push(node);
            }

            if (node.level >= pathLevel) {
                continue;
            }

            nodes.push(...node.children);
        }

        // console.log(this, nodePath, res);

        return res;
    }

    public GetAttr(name:string) {
        return this.attribute.get(name);
    }
}

export enum CursorPosition {
    Attribute,
    Content
}

export class ActiveNode {
    
    public Path:string;

    public Level:number;

    constructor(public node: Node, 
        public cursorPosition: CursorPosition = CursorPosition.Attribute,
        public activeAttributeNameToken: MooToken | null = null,
        public activeAttributeValueToken: MooToken | null = null
        ) {
            this.Level = node.level;
            this.Path = node.nodePath;
    }
}

class ActiveNodeError extends Error {
    constructor(public activeNode: ActiveNode, message: string = '') {
        super(message);
        this.name = "ActiveNodeError";
    }
}

export class XmlParser {
    private readonly XmlLexer = moo.compile(tokenDefine);
    private option:ParseOption = {
        needToken: true,
        activeOffset: Number.MAX_SAFE_INTEGER
    };
    private tokens: MooToken[] = [];

    private getNextToken(): MooToken | null {
        if (this.tokens.length > 0) {
            return this.tokens.shift()!;
        }
        const token = this.XmlLexer.next();
        return token === undefined ? null : token;
    }

    private getTokenType(token: MooToken | null): string {
        if (token === null) {
            return '__end__';
        }

        return token.type;
    }

    private preToken(jump = 0): MooToken | null {
        while (this.tokens.length <= jump) {
            const token = this.XmlLexer.next();
            if (token === undefined) {
                break;
            }
            this.tokens.push(token);
        }

        if (this.tokens.length <= jump) {
            return null;
        }

        return this.tokens[jump];
    }

    private get preCurTokenType(): string {
        return this.getTokenType(this.preToken());
    }

    private tokenCanBeContent(token: MooToken | null) {
        const tokenType = this.getTokenType(token);
        return tokenType === TokenTypes.attrName ||
             tokenType === TokenTypes.attrValue ||
             tokenType === TokenTypes.space ||
             tokenType === TokenTypes.content ||
             tokenType === TokenTypes.xmlTagClose ||
             tokenType === TokenTypes.equal;
    }

    private tokenInActiveOffset(token: MooToken | null) : boolean {
        if (token === null) {
            return false;
        }

        if (this.option.activeOffset >= token.offset && this.option.activeOffset < token.offset + token.text.length) {
            return true;
        }

        return false;
    }

    private jumpSpace(foreach: ((token:MooToken) => void) | null = null) {
        let token = this.preToken();
        while (token !== null && (token.type === TokenTypes.space || token.type === TokenTypes.comment)) {
            this.getNextToken();
            if (token.type === TokenTypes.space && foreach !== null) {
                foreach(token);
            }
            token = this.preToken();
        }
    }

    private jumpSpaceForActiveNode(node:Node, cursorPosition: CursorPosition) {
        this.jumpSpace(token => {
            if (this.tokenInActiveOffset(token)) {
                throw new ActiveNodeError(new ActiveNode(node, cursorPosition));
            }
        });
    }

    private jumpXmlStart() {
        this.jumpSpace();
        if (this.preCurTokenType !== TokenTypes.xmlStart) {
            return;
        }
        this.getNextToken();
    }

    private parseNodeAttribute(node: Node) {
        this.jumpSpaceForActiveNode(node, CursorPosition.Attribute);
        if (this.preCurTokenType !== TokenTypes.attrName) {
            return;
        }

        const attrNameToken = this.getNextToken()!;
        if (this.option.needToken) {
            node.attributeNameToken.set(attrNameToken.value, attrNameToken);
        }
        if (this.tokenInActiveOffset(attrNameToken)) {
            throw new ActiveNodeError(new ActiveNode(node, CursorPosition.Attribute, attrNameToken));
        }
        this.jumpSpaceForActiveNode(node, CursorPosition.Attribute);

        const equalToken = this.getNextToken();
        if (this.getTokenType(equalToken) !== TokenTypes.equal) {
            throw new Error(`current token shound be "=", but = '${this.preToken()}', attrName=${attrNameToken.value}`);
        }
        if (this.tokenInActiveOffset(equalToken)) {
            throw new ActiveNodeError(new ActiveNode(node, CursorPosition.Attribute, attrNameToken));
        }

        this.jumpSpaceForActiveNode(node, CursorPosition.Attribute);
        const valueToken = this.getNextToken()!;
        if (this.getTokenType(valueToken) !== TokenTypes.attrValue) {
            throw new Error(`current token shound be attr value, ${valueToken}`);
        }
        if (this.option.needToken) {
            node.attributeValueToken.set(attrNameToken.value, valueToken);
        }
        if (this.tokenInActiveOffset(valueToken)) {
            throw new ActiveNodeError(new ActiveNode(node, CursorPosition.Attribute, attrNameToken, valueToken));
        }

        node.attribute.set(attrNameToken.value, valueToken!.value);
        
        // 继续解析下一对属性
        this.parseNodeAttribute(node);

        this.jumpSpaceForActiveNode(node, CursorPosition.Attribute);
    }

    private parseNodeContent(node: Node) {
        while (this.preToken() !== null && this.preCurTokenType !== TokenTypes.xmlTagEnd) {
            const token = this.preToken();
            if (token === null) {
                return;
            }

            if (token.type === TokenTypes.comment) {
                this.getNextToken();
                continue;
            }
            
            if (this.tokenCanBeContent(token)) {
                this.getNextToken();
                node.content += token.text;
                if (node.contentToken === null && this.option.needToken) {
                    node.contentToken = token;
                }
                if (this.tokenInActiveOffset(token)) {
                    throw new ActiveNodeError(new ActiveNode(node, CursorPosition.Content));
                }
                continue;
            }

            if (token.type === TokenTypes.xmlTagStart) {
                this.parseNode(node);
                continue;
            }

            throw new Error(`current token shound be content, but = '${token.text}', in col ${token.col} , line ${token.line}`);
        }
    }

    private parseNode(parent: Node | null = null): Node {
        this.jumpSpace();
        if (this.preCurTokenType !== TokenTypes.xmlTagStart) {
            throw new Error(`current token shound be tag start, but = '${this.preToken()}'`);
        }
        const token = this.getNextToken()!;
        let node = new Node(token.value, parent);
        if (this.option.needToken) {
            node.nameToken = token;
        }
        if (parent !== null) {
            parent.children.push(node);
        }

        // 解析属性
        this.parseNodeAttribute(node);

        // 解析content以及子node
        let hasContent = false;
        if (this.preCurTokenType === TokenTypes.xmlTagClose) {
            hasContent = true;
            const xmlTagCloseToken = this.getNextToken();
            if (this.tokenInActiveOffset(xmlTagCloseToken)) {
                throw new ActiveNodeError(new ActiveNode(node, CursorPosition.Attribute));
            }
            this.parseNodeContent(node);
        }

        const xmlTagEndToken = this.getNextToken();
        if (this.getTokenType(xmlTagEndToken) !== TokenTypes.xmlTagEnd) {
            throw new Error(`current token shound be tag:${node.name} end`);
        }
        if (this.tokenInActiveOffset(xmlTagEndToken)) {
            throw new ActiveNodeError(new ActiveNode(node, hasContent ? CursorPosition.Content : CursorPosition.Attribute));
        }

        return node;
    }

    private setOption(opt: Partial<ParseOption> | null) {
        if (opt === null) {
            return;
        }

        if (opt.needToken !== undefined) {
            this.option.needToken = opt.needToken;
        }

        if (opt.activeOffset !== undefined) {
            this.option.activeOffset = opt.activeOffset;
        }
    }

    public parse(text:string, option:Partial<ParseOption> | null = null):Node {
        this.option.activeOffset = Number.MAX_SAFE_INTEGER;
        this.setOption(option);
        this.tokens = [];
        this.XmlLexer.reset(text);
        this.jumpXmlStart();
        return this.parseNode();
    }

    public parseActiveNode(text:string, option:Partial<ParseOption>) : ActiveNode | null {
        this.setOption(option);
        this.tokens = [];
        this.XmlLexer.reset(text);
        this.jumpXmlStart();
        try {
            this.parseNode();
        } catch (err) {
            if (err instanceof ActiveNodeError) {
                return err.activeNode;
            }
        }

        return null;
    }
}
