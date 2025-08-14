document.addEventListener('DOMContentLoaded', (event) => {
    const convertBtn = document.getElementById('convert-btn');
    const cppCodeTextarea = document.getElementById('cpp-code');
    const blueprintOutputDiv = document.getElementById('blueprint-output');

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
            blueprintOutputDiv.innerText = 'Please enter some C++ code.';
            return;
        }

        try {
            const ast = parseCpp(cppCode);
            const blueprintRepresentation = convertToBlueprint(ast);
            displayBlueprint(blueprintRepresentation);
        } catch (error) {
            blueprintOutputDiv.innerText = 'Error: ' + error.message;
        }
    });

    function parseCpp(code) {
        const functionRegex = /(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{((?:[^{}]|{[^{}]*})*)\}/s;
        const match = code.match(functionRegex);

        if (!match) {
            throw new Error('Could not parse the function. Please provide a function like "int MyFunction(...) { ... }"');
        }

        const returnType = match[1];
        const functionName = match[2];
        const params = match[3].split(',').map(p => p.trim()).filter(p => p);
        const body = match[4].trim();

        return {
            type: 'FunctionDeclaration',
            name: functionName,
            returnType: returnType,
            parameters: params,
            body: parseBlock(body)
        };
    }

    function parseBlock(blockCode) {
        // This is a simplified parser. It will not handle all C++ syntax.
        const statements = [];
        const lines = blockCode.split(/\\n|;/).map(l => l.trim()).filter(l => l);

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            const ifRegex = /if\s*\((.*)\)/;
            const ifMatch = line.match(ifRegex);
            if (ifMatch) {
                const ifBlockEnd = lines.indexOf('}', i);
                const ifBlock = lines.slice(i + 1, ifBlockEnd).join('; ');
                statements.push({
                    type: 'IfStatement',
                    condition: ifMatch[1].trim(),
                    body: parseBlock(ifBlock)
                });
                i = ifBlockEnd;
                continue;
            }

            const returnRegex = /return\s+(.*)/;
            const returnMatch = line.match(returnRegex);
            if (returnMatch) {
                statements.push({
                    type: 'ReturnStatement',
                    value: returnMatch[1].trim()
                });
                continue;
            }

            const declarationAssignmentRegex = /(\w+)\s+(\w+)\s*=\s*(.*)/;
            const declarationMatch = line.match(declarationAssignmentRegex);
            if (declarationMatch) {
                statements.push({
                    type: 'VariableDeclaration',
                    dataType: declarationMatch[1],
                    variableName: declarationMatch[2],
                    value: declarationMatch[3]
                });
                continue;
            }
        }
        return statements;
    }

    function convertToBlueprint(ast) {
        if (ast.type !== 'FunctionDeclaration') {
            return 'Unsupported C++ construct.';
        }

        let output = `Blueprint for function: ${ast.name}\\n\\n`;
        output += '--- NODES ---\\n';

        output += '  - Node: Function Entry\\n';
        output += `    Name: ${ast.name}\\n`;
        output += '    ExecOut: ->\\n';
        ast.parameters.forEach(param => {
            output += `    Parameter: ${param}\\n`;
        });
        output += '\\n';

        output += convertBlockToBlueprint(ast.body, "    ");

        if (ast.returnType !== 'void') {
            output += '  - Node: Return Node\\n';
            output += `    Type: ${ast.returnType}\\n`;
        }

        output += '\\n--- END BLUEPRINT ---';

        return output;
    }

    function convertBlockToBlueprint(block, indent) {
        let blockOutput = "";
        block.forEach(statement => {
            if (statement.type === 'VariableDeclaration') {
                blockOutput += `${indent}- Node: Set Variable (${statement.variableName})\\n`;
                blockOutput += `${indent}  Type: ${statement.dataType}\\n`;
                blockOutput += `${indent}  Value: ${statement.value}\\n`;

            } else if (statement.type === 'IfStatement') {
                blockOutput += `${indent}- Node: Branch (if)\\n`;
                blockOutput += `${indent}  Condition: ${statement.condition}\\n`;
                blockOutput += `${indent}  ExecTrue: ->\\n`;
                blockOutput += convertBlockToBlueprint(statement.body, indent + "    ");
                blockOutput += `${indent}  ExecFalse: ->\\n`;
            } else if (statement.type === 'ReturnStatement') {
                blockOutput += `${indent}- Node: Return\\n`;
                blockOutput += `${indent}  Value: ${statement.value}\\n`;
            } else {
                blockOutput += `${indent}- Node: Unknown\\n${indent}  Content: ${statement.value}\\n`;
            }
            blockOutput += '\\n';
        });
        return blockOutput;
    }

    function displayBlueprint(blueprintText) {
        blueprintOutputDiv.innerText = blueprintText.replace(/\\n/g, '\\n');
    }
});
