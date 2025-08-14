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
        return -1; // Not found
    }

    function parseCpp(code) {
        const functionRegex = /^\s*(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{/;
        const match = code.match(functionRegex);

        if (!match) {
            throw new Error('Could not parse the function signature. Expected format: "type name(...) {"');
        }

        const openingBraceIndex = match[0].length - 1;
        const closingBraceIndex = findMatchingBrace(code, openingBraceIndex);

        if (closingBraceIndex === -1) {
            throw new Error('Could not find matching closing brace for function body.');
        }

        const returnType = match[1];
        const functionName = match[2];
        const params = match[3].split(',').map(p => p.trim()).filter(p => p);
        const body = code.substring(openingBraceIndex + 1, closingBraceIndex);

        return {
            type: 'FunctionDeclaration',
            name: functionName,
            returnType: returnType,
            parameters: params,
            body: parseBlock(body)
        };
    }

    function parseBlock(blockCode) {
        const statements = [];
        let remainingCode = blockCode.trim();

        while (remainingCode.length > 0) {
            let matched = false;

            // Try to match an if statement
            const ifRegex = /^\s*if\s*\(([^)]*)\)\s*\{/;
            const ifMatch = remainingCode.match(ifRegex);
            if (ifMatch) {
                const openingBraceIndex = ifMatch[0].length - 1;
                const closingBraceIndex = findMatchingBrace(remainingCode, openingBraceIndex);

                if (closingBraceIndex === -1) {
                    throw new Error("Syntax error: Mismatched braces in 'if' statement.");
                }

                const condition = ifMatch[1].trim();
                const body = remainingCode.substring(openingBraceIndex + 1, closingBraceIndex);

                statements.push({
                    type: 'IfStatement',
                    condition: condition,
                    body: parseBlock(body)
                });

                remainingCode = remainingCode.substring(closingBraceIndex + 1);
                matched = true;
            }

            // Try to match a return statement
            if (!matched) {
                const returnRegex = /^\s*return\s+([^;]+);/;
                const returnMatch = remainingCode.match(returnRegex);
                if (returnMatch) {
                    statements.push({
                        type: 'ReturnStatement',
                        value: returnMatch[1].trim()
                    });
                    remainingCode = remainingCode.substring(returnMatch[0].length);
                    matched = true;
                }
            }

            // Try to match a variable declaration
            if (!matched) {
                const varRegex = /^\s*(\w+)\s+(\w+)\s*=\s*([^;]+);/;
                const varMatch = remainingCode.match(varRegex);
                if(varMatch) {
                    statements.push({
                        type: 'VariableDeclaration',
                        dataType: varMatch[1],
                        variableName: varMatch[2],
                        value: varMatch[3].trim()
                    });
                    remainingCode = remainingCode.substring(varMatch[0].length);
                    matched = true;
                }
            }

            // If nothing matched, trim whitespace and continue, or throw error
            if (!matched) {
                const oldLength = remainingCode.length;
                remainingCode = remainingCode.trim();
                if (remainingCode.length === oldLength && oldLength > 0) {
                    throw new Error(`Unrecognized syntax near: "${remainingCode.substring(0, 20)}..."`);
                }
            }
        }
        return statements;
    }

    function convertToBlueprint(ast) {
        if (ast.type !== 'FunctionDeclaration') {
            return 'Unsupported C++ construct.';
        }

        let output = `Blueprint for function: ${ast.name}\n\n`;
        output += '--- NODES ---\n';

        output += '  - Node: Function Entry\n';
        output += `    Name: ${ast.name}\n`;
        output += '    ExecOut: ->\n';
        ast.parameters.forEach(param => {
            output += `    Parameter: ${param}\n`;
        });
        output += '\n';

        output += convertBlockToBlueprint(ast.body, "    ");

        if (ast.returnType !== 'void') {
            output += '  - Node: Return Node\n';
            output += `    Type: ${ast.returnType}\n`;
        }

        output += '\n--- END BLUEPRINT ---';

        return output;
    }

    function convertBlockToBlueprint(block, indent) {
        let blockOutput = "";
        block.forEach(statement => {
            if (statement.type === 'VariableDeclaration') {
                blockOutput += `${indent}- Node: Set Variable (${statement.variableName})\n`;
                blockOutput += `${indent}  Type: ${statement.dataType}\n`;
                blockOutput += `${indent}  Value: ${statement.value}\n`;

            } else if (statement.type === 'IfStatement') {
                blockOutput += `${indent}- Node: Branch (if)\n`;
                blockOutput += `${indent}  Condition: ${statement.condition}\n`;
                blockOutput += `${indent}  ExecTrue: ->\n`;
                blockOutput += convertBlockToBlueprint(statement.body, indent + "    ");
                blockOutput += `${indent}  ExecFalse: ->\n`;
            } else if (statement.type === 'ReturnStatement') {
                blockOutput += `${indent}- Node: Return\n`;
                blockOutput += `${indent}  Value: ${statement.value}\n`;
            } else {
                blockOutput += `${indent}- Node: Unknown\n${indent}  Content: ${statement.value}\n`;
            }
            blockOutput += '\n';
        });
        return blockOutput;
    }

    function displayBlueprint(blueprintText) {
        blueprintOutputDiv.innerText = blueprintText.replace(/\\n/g, '\n');
    }
});
