class Pin {
    constructor(id, name, direction, type, ownerNode) {
        this.id = id;
        this.name = name;
        this.direction = direction; // "Input" or "Output"
        this.type = type; // e.g., "exec", "bool", "int"
        this.linkedTo = []; // Can link to multiple input pins
        this.ownerNode = ownerNode;
    }
}

class Node {
    constructor(id, name, type) {
        this.id = id;
        this.name = name;
        this.type = type; // e.g., "K2Node_IfThenElse"
        this.pins = [];
        this.posX = 0;
        this.posY = 0;
    }

    addPin(pin) {
        this.pins.push(pin);
    }
}

function generateGuid() {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

const layoutManager = {
    x: 0,
    y: 0,
    nodeWidth: 400,
    nodeHeight: 200,
    reset: function() {
        this.x = 0;
        this.y = 0;
    },
    getNextPosition: function() {
        const position = { x: this.x, y: this.y };
        this.x += this.nodeWidth;
        if (this.x > this.nodeWidth * 3) {
            this.x = 0;
            this.y += this.nodeHeight;
        }
        return position;
    }
};

document.addEventListener('DOMContentLoaded', (event) => {
    const convertBtn = document.getElementById('convert-btn');
    const cppCodeTextarea = document.getElementById('cpp-code');
    const blueprintOutputTextarea = document.getElementById('blueprint-output');

    const exampleCode = `int Max(int a, int b) {
    if (a > b) {
        return a;
    }
    return b;
}`;
    cppCodeTextarea.value = exampleCode;

    convertBtn.addEventListener('click', () => {
        const cppCode = cppCodeTextarea.value;
        if (cppCode.trim() === '') {
            blueprintOutputTextarea.value = 'Please enter some C++ code.';
            return;
        }

        try {
            const ast = parseCpp(cppCode);
            const graph = convertToBlueprint(ast);
            const blueprintRepresentation = generateBlueprintText(graph);
            displayBlueprint(blueprintRepresentation);
        } catch (error) {
            blueprintOutputTextarea.value = 'Error: ' + error.message;
        }
    });

    function findMatchingBrace(str, start) {
        let depth = 1;
        for (let i = start + 1; i < str.length; i++) {
            if (str[i] === '{') {
                depth++;
            } else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    function parseCpp(code) {
        const functionRegex = /^\s*(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{/;
        const match = code.match(functionRegex);
        if (!match) throw new Error('Could not parse the function signature. Expected format: "type name(...) {"');
        const openingBraceIndex = match[0].length - 1;
        const closingBraceIndex = findMatchingBrace(code, openingBraceIndex);
        if (closingBraceIndex === -1) throw new Error('Could not find matching closing brace for function body.');
        return {
            type: 'FunctionDeclaration', name: match[2], returnType: match[1],
            parameters: match[3].split(',').map(p => p.trim()).filter(p => p),
            body: parseBlock(code.substring(openingBraceIndex + 1, closingBraceIndex))
        };
    }

    function parseBlock(blockCode) {
        const statements = [];
        let remainingCode = blockCode.trim();
        while (remainingCode.length > 0) {
            let matched = false;
            const ifRegex = /^\s*if\s*\(([^)]*)\)\s*\{/;
            const ifMatch = remainingCode.match(ifRegex);
            if (ifMatch) {
                const openingBraceIndex = ifMatch[0].length - 1;
                const closingBraceIndex = findMatchingBrace(remainingCode, openingBraceIndex);
                if (closingBraceIndex === -1) throw new Error("Syntax error: Mismatched braces in 'if' statement.");
                statements.push({ type: 'IfStatement', condition: ifMatch[1].trim(), body: parseBlock(remainingCode.substring(openingBraceIndex + 1, closingBraceIndex)) });
                remainingCode = remainingCode.substring(closingBraceIndex + 1);
                matched = true;
            }
            if (!matched) {
                const returnRegex = /^\s*return\s+([^;]+);/;
                const returnMatch = remainingCode.match(returnRegex);
                if (returnMatch) {
                    statements.push({ type: 'ReturnStatement', value: returnMatch[1].trim() });
                    remainingCode = remainingCode.substring(returnMatch[0].length);
                    matched = true;
                }
            }
            if (!matched) {
                const oldLength = remainingCode.length;
                remainingCode = remainingCode.trim();
                if (remainingCode.length === oldLength && oldLength > 0) throw new Error(`Unrecognized syntax near: "${remainingCode.substring(0, 20)}..."`);
            }
        }
        return statements;
    }

    function convertToBlueprint(ast) {
        layoutManager.reset();
        const graph = { nodes: [], localVariables: new Map() };
        const entryNode = new Node(generateGuid(), ast.name, 'K2Node_FunctionEntry');
        const entryPos = layoutManager.getNextPosition();
        entryNode.posX = entryPos.x; entryNode.posY = entryPos.y;
        const entryExecOut = new Pin(generateGuid(), 'then', 'Output', 'exec', entryNode);
        entryNode.addPin(entryExecOut);
        ast.parameters.forEach(param => {
            const [type, name] = param.split(' ').map(s => s.trim());
            const paramPin = new Pin(generateGuid(), name, 'Output', type, entryNode);
            entryNode.addPin(paramPin);
            graph.localVariables.set(name, paramPin);
        });
        graph.nodes.push(entryNode);
        let returnNode = null;
        if (ast.returnType !== 'void') {
            returnNode = new Node(generateGuid(), 'ReturnValue', 'K2Node_FunctionResult');
            const returnPos = {x: layoutManager.x + 800, y: layoutManager.y};
            returnNode.posX = returnPos.x; returnNode.posY = returnPos.y;
            returnNode.addPin(new Pin(generateGuid(), 'execute', 'Input', 'exec', returnNode));
            returnNode.addPin(new Pin(generateGuid(), `ReturnValue`, 'Input', ast.returnType, returnNode));
            graph.nodes.push(returnNode);
        }
        convertBlockToBlueprint(ast.body, graph, entryExecOut, returnNode);
        return graph;
    }

    function convertBlockToBlueprint(statements, graph, currentExecPin, returnNode) {
        let lastExecPin = currentExecPin;
        for (const statement of statements) {
            if (statement.type === 'IfStatement') {
                const ifNode = new Node(generateGuid(), 'IfThenElse', 'K2Node_IfThenElse');
                const ifPos = layoutManager.getNextPosition();
                ifNode.posX = ifPos.x; ifNode.posY = ifPos.y;
                const execIn = new Pin(generateGuid(), 'execute', 'Input', 'exec', ifNode);
                const conditionIn = new Pin(generateGuid(), 'Condition', 'Input', 'bool', ifNode);
                const thenOut = new Pin(generateGuid(), 'then', 'Output', 'exec', ifNode);
                const elseOut = new Pin(generateGuid(), 'else', 'Output', 'exec', ifNode);
                ifNode.pins.push(execIn, conditionIn, thenOut, elseOut);
                if(lastExecPin) lastExecPin.linkedTo.push(execIn);
                graph.nodes.push(ifNode);
                const thenLastPin = convertBlockToBlueprint(statement.body, graph, thenOut, returnNode);
                lastExecPin = elseOut;
            } else if (statement.type === 'ReturnStatement' && returnNode) {
                const returnExecIn = returnNode.pins.find(p => p.type === 'exec');
                if(lastExecPin) lastExecPin.linkedTo.push(returnExecIn);
                lastExecPin = null;
            }
        }
        return lastExecPin;
    }

    function generateBlueprintText(graph) {
        let clipboardText = 'Begin Object Class=/Script/BlueprintGraph.EdGraph Name="EdGraph_1"\n';
        graph.nodes.forEach(node => {
            const nodeName = `${node.type}_${node.id.substring(0, 8)}`;
            clipboardText += `   Begin Object Class=/Script/BlueprintGraph.${node.type} Name="${nodeName}"\n`;
            clipboardText += `      NodePosX=${node.posX}\n`;
            clipboardText += `      NodePosY=${node.posY}\n`;
            clipboardText += `      NodeGuid=${node.id}\n`;
            node.pins.forEach(pin => {
                let pinString = `      CustomProperties Pin (PinId=${pin.id},PinName="${pin.name}",`;
                if (pin.direction === 'Output') pinString += `Direction="EGPD_Output",`;
                let linkedTo = '';
                if(pin.linkedTo.length > 0) {
                    linkedTo += `LinkedTo=(`;
                    pin.linkedTo.forEach((link, index) => {
                        const ownerNode = link.ownerNode;
                        const ownerNodeName = `${ownerNode.type}_${ownerNode.id.substring(0, 8)}`;
                        linkedTo += `${ownerNodeName} ${link.id}`;
                        if(index < pin.linkedTo.length - 1) linkedTo += ',';
                    });
                    linkedTo += `),`;
                }
                pinString += `${linkedTo}PinType.PinCategory="${pin.type}",PersistentGuid=00000000000000000000000000000000,bHidden=False,bNotConnectable=False,bDefaultValueIsReadOnly=False,bDefaultValueIsIgnored=False,bAdvancedView=False,bOrphanedPin=False,)\n`;
                clipboardText += pinString;
            });
            clipboardText += '   End Object\n';
        });
        clipboardText += 'End Object\n';
        return clipboardText;
    }

    function displayBlueprint(blueprintText) {
        blueprintOutputTextarea.value = blueprintText;
    }
});
