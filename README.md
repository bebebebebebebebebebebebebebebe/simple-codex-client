# simple-codex-client

Bunで動く最小構成のJSON-RPCクライアントです。標準入力から1行ごとにJSONを受け取り、子プロセスとして起動したサーバーにそのまま転送し、標準出力に返ってきたレスポンスを表示します。

デフォルトでは `codex app-server` に接続します。ローカル検証用にモックサーバーも同梱しています。

## できること

- `codex app-server` に対してJSON-RPCメッセージを手入力で送る
- 標準入出力ベースのやり取りを最小コードで確認する
- モックサーバーを使って、Codex CLIがなくても入出力フローを試す

## ファイル構成

- `index.ts`: 対話入力を受け取り、子プロセスのサーバーへJSON-RPCを転送するクライアント
- `json-rpc-mock-server.ts`: 標準入力からJSON-RPCを受け取る簡易モックサーバー
- `json-rpc-schema.ts`: リクエストとレスポンスの型定義
- `mock/json-rpc-mock-inputs.jsonl`: モックサーバー向けの入力例
- `mock/codex-server-mock-inputs.jsonl`: Codex App Server向けの入力例

## 前提条件

- Bun
- `codex app-server` を使う場合はCodex CLI

依存関係をインストールします。

```bash
bun install
```

## 使い方

### 1. Codex App Serverに接続する

そのまま起動すると、`index.ts` は `codex app-server` を子プロセスとして起動します。

```bash
bun run index.ts
```

起動後、`>` プロンプトに1行のJSON-RPCリクエストを入力します。

例:

```json
{"method":"initialize","id":0,"params":{"clientInfo":{"name":"my_client","title":"My Client","version":"0.1.0"}}}
```

続けて初期化完了通知を送れます。

```json
{"method":"initialized","params":{}}
```

モデル一覧やスレッド操作の例は `mock/codex-server-mock-inputs.jsonl` にあります。

## 2. モックサーバーで試す

Codex CLIがない場合や、まず入出力だけ確認したい場合は `index.ts` のサーバー起動部分をモックサーバーに切り替えます。

切り替え対象:

```ts
// const serverProcess = spawn("bun", ["run", "json-rpc-mock-server.ts"], {
//   stdio: ["pipe", "pipe", "pipe"],
// });
const serverProcess = spawn("codex", ["app-server"], {
	stdio: ["pipe", "pipe", "pipe"],
});
```

上の3行をアンコメントし、`codex app-server` 側をコメントアウトしてください。

そのあとクライアントを起動します。

```bash
bun run index.ts
```

モックサーバーは `sum` メソッドだけを実装しています。

入力例:

```json
{"id":1,"method":"sum","params":[1,2,3,4,5]}
```

想定レスポンス:

```json
{"id":1,"result":15,"method":"sum","params":[1,2,3,4,5]}
```

その他の入力例は `mock/json-rpc-mock-inputs.jsonl` を参照してください。

## 実装メモ

- 入力は1行ごとにサーバーへ送信されます
- サーバーからの応答も1行ごとに `response:` プレフィックス付きで表示されます
- 子プロセスの標準エラー出力はそのままコンソールに表示されます
- サーバー終了時はクライアントも終了します

## 注意点

- クライアントはJSONの妥当性を事前検証せず、そのままサーバーへ送信します
- モックサーバーはJSON-RPCの最小実装です。実際のCodex App Serverのメソッドやレスポンスとは異なります
- `json-rpc-schema.ts` の型定義より、実際のモックサーバー実装のほうが挙動の正確な参考になります
