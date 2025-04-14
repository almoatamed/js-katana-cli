import {} from "./utility.js";

const stripRegex = (regex: RegExp) => {
    const stripped = String(regex).slice(1, -1).replace(/\$$/, "").replace(/^\^/, "");
    return stripped;
};

export const joinRegex = (
    options: {
        ignoreCase?: boolean;
        general?: boolean;
        joinExp: RegExp;
        includeEnd?: boolean;
        includeStart?: boolean;
        group?: boolean;
    },
    ...regexExpressions: RegExp[]
) => {
    return RegExp(
        `${options.includeStart ? "^" : ""}` +
            regexExpressions
                .map(r => `${options.group ? "(" : ""}` + stripRegex(r) + `${options.group ? ")" : ""}`)
                .join(stripRegex(options.joinExp)) +
            `${options.includeEnd ? "$" : ""}`,
        `${options.ignoreCase ? "i" : ""}${options.general ? "g" : ""}`,
    );
};

export const utilityVersionValidationRegex = /^[0-9]+\.[0-9]+\.[0-9]+$/;
export const utilityNameValidationRegex = /^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/;
export const orgNameValidationRegex = /^[_\-a-zA-Z0-9]+$/;
export const ownerUtilityMatchRegex = joinRegex(
    {
        includeEnd: true,
        includeStart: true,
        group: true,
        joinExp: /\//,
    },
    orgNameValidationRegex,
    utilityNameValidationRegex,
);
