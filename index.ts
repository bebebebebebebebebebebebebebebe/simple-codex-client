import readline from "node:readline";
import { spawn } from "node:child_process";

// json-rpc-mock-serverまたは、codex-app-server を起動して、標準入力からJSON-RPCリクエストを送信し、標準出力からレスポンスを受け取るクライアントコード
// const serverProcess = spawn("bun", ["run", "json-rpc-mock-server.ts"], {
//   stdio: ["pipe", "pipe", "pipe"],
// });
const serverProcess = spawn("codex", ["app-server"], {
  stdio: ["pipe", "pipe", "pipe"],
});

const serverOutput = readline.createInterface({
  input: serverProcess.stdout,
});

const userInput = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

userInput.setPrompt("> ");
userInput.prompt();

function sendToServer(line: string): void {
  const message = line.trim();

  if (!message) {
    userInput.prompt();
    return;
  }

  if (!serverProcess.stdin.writable) {
    console.error("server stdin is not writable");
    userInput.prompt();
    return;
  }

  serverProcess.stdin.write(`${message}\n`);
  userInput.prompt();
}

function printServerResponse(line: string): void {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);

  console.log("response:", line);

  userInput.prompt(true);
}

userInput.on("line", sendToServer);

serverOutput.on("line", printServerResponse);

serverProcess.stderr.on("data", data => {
  console.error("server stderr:", data.toString());
  userInput.prompt(true);
});

serverProcess.on("exit", code => {
  console.log("server exited:", code);

  serverOutput.close();
  userInput.close();
});