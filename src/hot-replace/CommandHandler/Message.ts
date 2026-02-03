import { XMLParser as StandardXMLParser } from 'fast-xml-parser';
const xmlParser = new StandardXMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export interface XmlAttributes {
    [key: string]: string 
}

export class XmlNode {
    public Children: XmlNode[] = [];
    public Attributes: XmlAttributes = {};

    constructor(public TagName: string, public Text: string = '') {
        this.Children = [];
    }

    private formatToXmlInner(indent: number = 0) {
        let xml = '';
        const indentStr = ' '.repeat(indent);
        xml += `${indentStr}<${this.TagName}`;
        for (const key in this.Attributes) {
            xml += ` ${key}="${this.Attributes[key]}"`;
        }
        xml += `>`;
        const hasChildren = this.Children.length > 0;
        if (hasChildren) {
            xml += `\n${this.Text}`;
        } else {
            xml += `${this.Text}`;
        }
        for (const child of this.Children) {
            xml += child.formatToXmlInner(indent + 4);
        }
        xml += `${hasChildren ? indentStr : ''}</${this.TagName}>\n`;
        return xml;
    }

    public formatToXml():string {
        return this.formatToXmlInner();
    }
}

function CreateXmlNode(obj: any, tagName: string): XmlNode {
    var node = new XmlNode(tagName);

    if (typeof obj !== 'object') {
        node.Text = obj;
        return node;
    }

    for (const key in obj) {
        if (key === '#text') {
            node.Text = obj[key];
            continue;
        }

        const val = obj[key];
        node.Children.push(CreateXmlNode(val, key));
    }

    return node;
}

export function CreatePayload(payload: any):XmlNode {
    return CreateXmlNode(payload, 'Payload');
}

export function ParseTextToObj(text: string): any {
    return xmlParser.parse(text);
}