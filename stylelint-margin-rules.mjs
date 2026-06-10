import stylelint from 'stylelint';

const ruleName = 'custom-rule/margin-value';
const messages = stylelint.utils.ruleMessages(ruleName, {
    invalidPx: (value) => `margin px "${value}" должно быть четным`,
    invalidRem: (value) => `margin rem "${value}" должно быть кратно 2 (0.2, 1.4 etc)`,
});

const meta = {
    fixable: true,
};

const isEvenPxValue = (numericValue) => Number.isInteger(numericValue) && numericValue % 2 === 0;

const isEvenRemValue = (numericStr) => {
    const decimalPart = numericStr.includes('.') ? numericStr.split('.')[1] : '0';
    const lastDigit = decimalPart[decimalPart.length - 1];
    return ['0', '2', '4', '6', '8'].includes(lastDigit);
};

const fixPxValue = (numericValue) => `${Math.round(numericValue / 2) * 2}px`;

const fixRemValue = (numericValue) => {
    const rounded = Math.round(numericValue * 5) / 5;
    return `${rounded.toFixed(1)}rem`.replace(/\.?0+rem$/, 'rem').replace(/^0(?=\.\d+)/, '');
};

const checkMarginValue = (token) => {
    if (token.toLowerCase().includes('!important')) {
        return { isValid: true, value: token };
    }

    const match = token.match(/^(\d*\.?\d+)([a-zA-Z%]+)$/);
    if (!match) {
        return { isValid: true, value: token };
    }

    const [fullValue, numericStr, unit] = match;
    const numericValue = parseFloat(numericStr);
    const isRem = unit.toLowerCase() === 'rem';
    const isPx = unit.toLowerCase() === 'px';

    if (!isRem && !isPx) {
        return { isValid: true, value: token };
    }

    const isValid = isPx ? isEvenPxValue(numericValue) : isEvenRemValue(numericStr);

    if (isValid) {
        return { isValid: true, value: token };
    }

    return {
        isValid: false,
        message: isPx ? messages.invalidPx(fullValue) : messages.invalidRem(fullValue),
        value: isPx ? fixPxValue(numericValue) : fixRemValue(numericValue),
        word: fullValue,
    };
};

const ruleFunction = (primaryOption) => (root, result) => {
    if (
        !stylelint.utils.validateOptions(result, ruleName, {
            actual: primaryOption,
            possible: [true, false],
        })
    ) {
        return;
    }

    root.walkDecls((decl) => {
        if (!decl.prop.toLowerCase().includes('margin')) {
            return;
        }

        const originalValues = decl.value.split(/\s+/);
        const fixedValues = [];

        originalValues.forEach((token) => {
            const { isValid, message, value, word } = checkMarginValue(token);

            if (!isValid) {
                fixedValues.push(value);

                stylelint.utils.report({
                    ruleName,
                    result,
                    node: decl,
                    message,
                    word,
                    fix: () => {
                        decl.value = originalValues
                            .map((t) => {
                                const check = checkMarginValue(t);
                                return check.isValid ? t : check.value;
                            })
                            .join(' ');
                        return true;
                    },
                });
            } else {
                fixedValues.push(value);
            }
        });
    });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default stylelint.createPlugin(ruleName, ruleFunction);
