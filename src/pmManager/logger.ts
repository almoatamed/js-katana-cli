import ora from "ora";

const colors = {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    consoleColor: "\x1b[0m",
};

export const loadingSpinner = ora();
const colorText = (
    color: "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "consoleColor",
    ...text: any[]
): string => {
    return `${colors[color]}${text.join(" ")}${colors.consoleColor}`;
};

const spinWrapper = <T>(cp: (...args: any[]) => T): T => {
    if (loadingSpinner.isSpinning) {
        loadingSpinner.stop();
        const res = cp();
        loadingSpinner.start();
        return res;
    }
    return cp();
};
const Error = console.error
export const error = (...message: any[]) => {
    spinWrapper(() => {
        Error(colorText("red", ...message));
        console.trace()
    });
};
console.error = error

export const success = (...message: any[]) => {
    spinWrapper(() => {
        console.log(colorText("green", ...message));
    });
};

export const info = (...message: any[]) => {
    spinWrapper(() => {
        console.log(colorText("blue", ...message));
    });
};

export const warning = (...message: any[]) => {
    spinWrapper(() => {
        console.warn(colorText("yellow", ...message));
    });
};

export const fatal = (...message: any[]): never => {
    return spinWrapper<never>(() => {
        console.error(...message);
        process.exit(1);
    });
};
export const log = (...message: any[]) => {
    if (loadingSpinner.isSpinning) {
        // loadingSpinner.stop()
        loadingSpinner.text = message.join(" ");
        // console.log(...message)
        // loadingSpinner.start()
        return;
    }
    console.log(...message);
};



export default { info, error, success, warning, fatal, log };
