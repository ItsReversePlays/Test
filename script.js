// --- NEW DATA STRUCTURES AND ASSET DB ---
function generateGuid() {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

const blueprintAssetDb = {
    functions: {
        '>': {
            type: 'K2Node_CallFunction',
            functionReference: { MemberParent: `"/Script/CoreUObject.Class'/Script/Engine.KismetMathLibrary'"`, MemberName: `"Greater_IntInt"` },
            pins: [ { name: 'a', type: 'int', direction: 'Input' }, { name: 'b', type: 'int', direction: 'Input' }, { name: 'ReturnValue', type: 'bool', direction: 'Output' }]
        },
        '<': {
            type: 'K2Node_CallFunction',
            functionReference: { MemberParent: `"/Script/CoreUObject.Class'/Script/Engine.KismetMathLibrary'"`, MemberName: `"Less_IntInt"` },
            pins: [ { name: 'a', type: 'int', direction: 'Input' }, { name: 'b', type: 'int', direction: 'Input' }, { name: 'ReturnValue', type: 'bool', direction: 'Output' }]
        },
        '+': {
            type: 'K2Node_CallFunction',
            functionReference: { MemberParent: `"/Script/CoreUObject.Class'/Script/Engine.KismetMathLibrary'"`, MemberName: `"Add_IntInt"` },
            pins: [ { name: 'a', type: 'int', direction: 'Input' }, { name: 'b', type: 'int', direction: 'Input' }, { name: 'ReturnValue', type: 'int', direction: 'Output' }]
        }
    },
    ifThenElse: {
        type: 'K2Node_IfThenElse',
        pins: [ { name: 'execute', type: 'exec', direction: 'Input' }, { name: 'Condition', type: 'bool', direction: 'Input' }, { name: 'then', type: 'exec', direction: 'Output' }, { name: 'else', type: 'exec', direction: 'Output' } ]
    }
};

class Pin {
    constructor(ownerNode, pinTemplate) {
        this.ownerNode = ownerNode;
        this.id = generateGuid();
        this.name = pinTemplate.name;
        this.direction = pinTemplate.direction || 'Input';
        this.type = pinTemplate.type;
        this.linkedTo = [];
        this.defaultValue = pinTemplate.defaultValue || null;
    }
}

class Node {
    constructor(nodeTemplate) {
        this.id = generateGuid();
        this.type = nodeTemplate.type;
        this.name = `${this.type}_${this.id.substring(0,8)}`;
        this.posX = 0;
        this.posY = 0;
        this.pins = [];
        this.functionReference = nodeTemplate.functionReference || null;
        this.variableReference = nodeTemplate.variableReference || null;
        this.NodeWidth = nodeTemplate.NodeWidth || 0;
        this.NodeHeight = nodeTemplate.NodeHeight || 0;
        this.NodeComment = nodeTemplate.NodeComment || '';
        if (nodeTemplate.pins) {
            nodeTemplate.pins.forEach(pinTemplate => { this.pins.push(new Pin(this, pinTemplate)); });
        }
    }
    getPin(name) { return this.pins.find(p => p.name === name); }
}

const layoutManager = {
    x: 0, y: 0, nodeWidth: 400, nodeHeight: 200,
    reset: function() { this.x = 0; this.y = 0; },
    getNextPosition: function() {
        const position = { x: this.x, y: this.y };
        this.x += this.nodeWidth;
        if (this.x > this.nodeWidth * 3) { this.x = 0; this.y += this.nodeHeight; }
        return position;
    },
    getExpressionNodePosition: function() {
        const pos = this.getNextPosition();
        return { x: pos.x - 1200, y: pos.y };
    }
};

document.addEventListener('DOMContentLoaded', (event) => {
    const convertBtn = document.getElementById('convert-btn');
    const cppCodeTextarea = document.getElementById('cpp-code');
    const blueprintOutputTextarea = document.getElementById('blueprint-output');
    const exampleCode = `int Abs(int x) {
    if (x < 0) {
        return x; // Should be -x, but unary minus is not supported yet
    } else {
        return x;
    }
}`;
    cppCodeTextarea.value = exampleCode;
    convertBtn.addEventListener('click', () => {
        const cppCode = cppCodeTextarea.value.trim();
        if (cppCode === '') { blueprintOutputTextarea.value = 'Please enter some C++ code.'; return; }
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
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function parseExpression(expression) {
        expression = expression.trim();
        const binaryRegex = /^\s*(\w+)\s*([>|<|==|!=|+|-|*|/])\s*(\w+)\s*$/;
        const binaryMatch = expression.match(binaryRegex);
        if (binaryMatch) {
            return { type: 'BinaryExpression', operator: binaryMatch[2], left: parseExpression(binaryMatch[1]), right: parseExpression(binaryMatch[3]) };
        }
        if (!isNaN(expression) && !isNaN(parseFloat(expression))) return { type: 'Literal', value: expression, dataType: 'int' };
        if (expression === 'true' || expression === 'false') return { type: 'Literal', value: expression, dataType: 'bool' };
        return { type: 'Identifier', name: expression };
    }

    function parseCpp(code) {
        const functionRegex = /^\s*(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{/;
        const match = code.match(functionRegex);
        if (!match) throw new Error('Could not parse function signature.');
        const openingBraceIndex = match[0].length - 1;
        const closingBraceIndex = findMatchingBrace(code, openingBraceIndex);
        if (closingBraceIndex === -1) throw new Error('Could not find matching brace for function body.');
        return { type: 'FunctionDeclaration', name: match[2], returnType: match[1], parameters: match[3].split(',').map(p => p.trim()).filter(p => p), body: parseBlock(code.substring(openingBraceIndex + 1, closingBraceIndex)) };
    }

    function parseBlock(blockCode) {
        const statements = [];
        let remainingCode = blockCode.trim();
        while (remainingCode.length > 0) {
            let matched = false;
            const ifRegex = /^\s*if\s*\(([^)]*)\)\s*\{/;
            const ifMatch = remainingCode.match(ifRegex);
            if (ifMatch) {
                const ifStatement = { type: 'IfStatement', condition: ifMatch[1].trim() };
                let ifOpeningBraceIndex = ifMatch[0].length - 1;
                let ifClosingBraceIndex = findMatchingBrace(remainingCode, ifOpeningBraceIndex);
                if (ifClosingBraceIndex === -1) throw new Error("Mismatched braces in 'if' statement.");
                ifStatement.body = parseBlock(remainingCode.substring(ifOpeningBraceIndex + 1, ifClosingBraceIndex));
                remainingCode = remainingCode.substring(ifClosingBraceIndex + 1).trim();
                const elseRegex = /^\s*else\s*\{/;
                const elseMatch = remainingCode.match(elseRegex);
                if (elseMatch) {
                    let elseOpeningBraceIndex = elseMatch[0].length - 1;
                    let elseClosingBraceIndex = findMatchingBrace(remainingCode, elseOpeningBraceIndex);
                    if (elseClosingBraceIndex === -1) throw new Error("Mismatched braces in 'else' statement.");
                    ifStatement.elseBody = parseBlock(remainingCode.substring(elseOpeningBraceIndex + 1, elseClosingBraceIndex));
                    remainingCode = remainingCode.substring(elseClosingBraceIndex + 1);
                }
                statements.push(ifStatement);
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

    function generateExpressionNodes(expressionAst, graph) {
        if (expressionAst.type === 'Identifier') {
            const varPin = graph.localVariables.get(expressionAst.name);
            if (varPin) return varPin;
            const varNode = new Node({ type: 'K2Node_VariableGet', variableReference: { MemberName: `"${expressionAst.name}"` } });
            varNode.addPin(new Pin(varNode, {name: expressionAst.name, type: 'int', direction: 'Output'}));
            const pos = layoutManager.getExpressionNodePosition();
            varNode.posX = pos.x; varNode.posY = pos.y;
            graph.nodes.push(varNode);
            return varNode.getPin(expressionAst.name);
        }
        if (expressionAst.type === 'Literal') {
            const literalPin = new Pin(null, { name: 'Literal', type: expressionAst.dataType });
            literalPin.defaultValue = expressionAst.value;
            return literalPin;
        }
        if (expressionAst.type === 'BinaryExpression') {
            const operatorTemplate = blueprintAssetDb.functions[expressionAst.operator];
            if (!operatorTemplate) throw new Error(`Unsupported operator: ${expressionAst.operator}`);
            const opNode = new Node(operatorTemplate);
            const pos = layoutManager.getExpressionNodePosition();
            opNode.posX = pos.x; opNode.posY = pos.y;
            const leftPin = generateExpressionNodes(expressionAst.left, graph);
            const rightPin = generateExpressionNodes(expressionAst.right, graph);
            const inputA = opNode.getPin('a');
            const inputB = opNode.getPin('b');
            if (leftPin.ownerNode) { leftPin.linkedTo.push(inputA); } else { inputA.defaultValue = leftPin.defaultValue; }
            if (rightPin.ownerNode) { rightPin.linkedTo.push(inputB); } else { inputB.defaultValue = rightPin.defaultValue; }
            graph.nodes.push(opNode);
            return opNode.getPin('ReturnValue');
        }
        return null;
    }

    function convertToBlueprint(ast) {
        layoutManager.reset();
        const graph = { nodes: [], localVariables: new Map() };
        const entryNode = new Node({ type: 'K2Node_FunctionEntry' });
        entryNode.addPin(new Pin(entryNode, {name: 'then', type: 'exec', direction: 'Output'}));
        ast.parameters.forEach(param => {
            const [type, name] = param.split(' ').map(s => s.trim());
            const paramPin = new Pin(entryNode, {name: name, type: type, direction: 'Output'});
            entryNode.addPin(paramPin);
            graph.localVariables.set(name, paramPin);
        });
        graph.nodes.push(entryNode);
        let returnNode = null;
        if (ast.returnType !== 'void') {
            returnNode = new Node({ type: 'K2Node_FunctionResult' });
            returnNode.addPin(new Pin(returnNode, {name: 'execute', type: 'exec'}));
            returnNode.addPin(new Pin(returnNode, {name: 'ReturnValue', type: ast.returnType}));
            graph.nodes.push(returnNode);
        }
        layoutManager.reset();
        convertBlockToBlueprint(ast.body, graph, entryNode.getPin('then'), returnNode);

        const logicNodes = graph.nodes.filter(n => n.type !== 'K2Node_FunctionEntry' && n.type !== 'K2Node_FunctionResult');
        if (logicNodes.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            logicNodes.forEach(n => {
                minX = Math.min(minX, n.posX);
                minY = Math.min(minY, n.posY);
                maxX = Math.max(maxX, n.posX);
                maxY = Math.max(maxY, n.posY);
            });
            const commentNode = new Node({ type: 'EdGraphNode_Comment', NodeComment: `"${ast.name}"` });
            commentNode.posX = minX - 40;
            commentNode.posY = minY - 60;
            commentNode.NodeWidth = (maxX - minX) + layoutManager.nodeWidth + 80;
            commentNode.NodeHeight = (maxY - minY) + layoutManager.nodeHeight + 120;
            graph.nodes.push(commentNode);
        }
        return graph;
    }

    function convertBlockToBlueprint(statements, graph, currentExecPin, returnNode) {
        let lastExecPin = currentExecPin;
        for (const statement of statements) {
            if (statement.type === 'IfStatement') {
                const ifNode = new Node(blueprintAssetDb.ifThenElse);
                const pos = layoutManager.getNextPosition();
                ifNode.posX = pos.x; ifNode.posY = pos.y;
                if(lastExecPin) lastExecPin.linkedTo.push(ifNode.getPin('execute'));
                graph.nodes.push(ifNode);
                const conditionAst = parseExpression(statement.condition);
                const conditionOutputPin = generateExpressionNodes(conditionAst, graph);
                if (conditionOutputPin) conditionOutputPin.linkedTo.push(ifNode.getPin('Condition'));
                const thenLastPin = convertBlockToBlueprint(statement.body, graph, ifNode.getPin('then'), returnNode);
                let elseLastPin = null;
                if (statement.elseBody) {
                    elseLastPin = convertBlockToBlueprint(statement.elseBody, graph, ifNode.getPin('else'), returnNode);
                }
                lastExecPin = elseLastPin || ifNode.getPin('else');
            } else if (statement.type === 'ReturnStatement' && returnNode) {
                const returnExecIn = returnNode.getPin('execute');
                if(lastExecPin) lastExecPin.linkedTo.push(returnExecIn);
                const returnValuePin = returnNode.getPin('ReturnValue');
                const returnValueAst = parseExpression(statement.value);
                const returnValueOutputPin = generateExpressionNodes(returnValueAst, graph);
                if (returnValueOutputPin) {
                    if (returnValueOutputPin.ownerNode) returnValueOutputPin.linkedTo.push(returnValuePin);
                    else returnValuePin.defaultValue = returnValueOutputPin.defaultValue;
                }
                lastExecPin = null;
            }
        }
        return lastExecPin;
    }

    function generateBlueprintText(graph) {
        let clipboardText = 'Begin Object Class=/Script/BlueprintGraph.EdGraph Name="EdGraph_1"\n';
        graph.nodes.filter(n => n.type !== 'K2Node_FunctionEntry' && n.type !== 'K2Node_FunctionResult').forEach(node => {
            clipboardText += `   Begin Object Class=/Script/BlueprintGraph.${node.type} Name="${node.name}"\n`;
            if(node.functionReference) clipboardText += `      FunctionReference=(MemberParent=${node.functionReference.MemberParent},MemberName=${node.functionReference.MemberName})\n`;
            if(node.variableReference) clipboardText += `      VariableReference=(MemberName=${node.variableReference.MemberName},bSelfContext=True)\n`;
            if(node.NodeComment) clipboardText += `      NodeComment=${node.NodeComment}\n`;
            if(node.NodeWidth) clipboardText += `      NodeWidth=${node.NodeWidth}\n`;
            if(node.NodeHeight) clipboardText += `      NodeHeight=${node.NodeHeight}\n`;
            clipboardText += `      NodePosX=${node.posX}\n`;
            clipboardText += `      NodePosY=${node.posY}\n`;
            clipboardText += `      NodeGuid=${node.id}\n`;
            if (node.pins) {
                node.pins.forEach(pin => {
                    let pinString = `      CustomProperties Pin (PinId=${pin.id},PinName="${pin.name}",`;
                    if (pin.direction === 'Output') pinString += `Direction="EGPD_Output",`;
                    const validLinks = pin.linkedTo.filter(link => link.ownerNode && link.ownerNode.type !== 'K2Node_FunctionEntry' && link.ownerNode.type !== 'K2Node_FunctionResult');
                    if(validLinks.length > 0) {
                        let linkedTo = `LinkedTo=(`;
                        validLinks.forEach((link, index) => {
                            linkedTo += `${link.ownerNode.name} ${link.id}`;
                            if(index < validLinks.length - 1) linkedTo += ',';
                        });
                        linkedTo += `),`;
                        pinString += linkedTo;
                    }
                    if (pin.defaultValue) pinString += `DefaultValue="${pin.defaultValue}",`;
                    pinString += `PinType.PinCategory="${pin.type}",PersistentGuid=00000000000000000000000000000000,bHidden=False,bNotConnectable=False,bDefaultValueIsReadOnly=False,bDefaultValueIsIgnored=False,bAdvancedView=False,bOrphanedPin=False,)\n`;
                    clipboardText += pinString;
                });
            }
            clipboardText += '   End Object\n';
        });
        clipboardText += 'End Object\n';
        return clipboardText;
    }

    function displayBlueprint(blueprintText) {
        blueprintOutputTextarea.value = blueprintText;
    }
});
