# simple-codex-client

Bun で動く Codex App Server / JSON-RPC JSONL 検証クライアントです。

`codex app-server` を子プロセスとして起動し、stdio JSONL で JSON-RPC message を送受信します。起動時に `initialize` request と `initialized` notification は自動で送信されるため、標準入力からは初期化後の request / notification を 1 行 JSON として手入力できます。

## できること

- `codex app-server` に対して JSON-RPC request / notification を手入力で送る
- id 付き request の response を pending 管理し、結果を `[manual request result]` として確認する
- Codex App Server からの approval request を受け取り、デフォルトでは安全側に `decline` で応答する
- stdio JSONL transport、JSON-RPC connection、Codex wrapper、manual input runtime を分けた構成を確認する
- ローカルの mock server で JSON-RPC の最小入出力を試す

## ファイル構成

- `json-rpc-stdio-client.ts`: CLI entrypoint。`codex app-server` を起動し、初期化後に手動 JSON 入力を開始する
- `rpc/`: JSON-RPC の型、runtime validation、pending request 管理、Transport interface
- `transports/`: child process stdio を使う JSONL transport
- `codex/`: Codex App Server client、approval handler、sample client 用の最小 Codex 型
- `cli/`: 標準入力から JSON-RPC message を送る manual input runtime
- `mock/`: mock server、mock 用 schema、JSONL 入力例
- `server.ts`, `frontend.tsx`, `App.tsx`: UI 側の検証用エントリ

## 構成図

全体構成は、CLI entrypoint が各層を組み合わせ、`JsonRpcConnection` が RPC の意味論を、`ProcessJsonlTransport` が stdio JSONL の通信を担当する形です。

```mermaid
flowchart LR
    User[標準入力ユーザー] --> Entry[json-rpc-stdio-client.ts]

    Entry --> Manual[cli/ ManualJsonInputRuntime]
    Entry --> CodexClient[codex/ CodexAppServerClient]
    Entry --> Approval[codex/ approval handlers]
    Entry --> Connection[rpc/ JsonRpcConnection]
    Entry --> Transport[transports/ ProcessJsonlTransport]

    Manual -->|id 付き request| Connection
    Manual -->|notification / response| Connection
    CodexClient -->|initialize / typed request| Connection
    Approval -->|server request handler| Connection

    Connection -->|JSON-RPC message| Transport
    Transport <-->|stdio JSONL| CodexServer[codex app-server]

    Mock[mock/ JSON-RPC mock server] -. 検証用 .-> Transport
```

手動入力した id 付き request は `requestRaw()` で pending 管理され、同じ id の response が返ると結果として解決されます。

```mermaid
sequenceDiagram
    actor User as 標準入力ユーザー
    participant Manual as ManualJsonInputRuntime
    participant Conn as JsonRpcConnection
    participant Pending as pendingRequests
    participant Transport as ProcessJsonlTransport
    participant Server as codex app-server

    User->>Manual: {"method":"account/read","id":1,...}
    Manual->>Conn: requestRaw(message)
    Conn->>Pending: id=1 を登録
    Conn->>Transport: sendRaw(message)
    Transport->>Server: JSONL request
    Server-->>Transport: JSONL response id=1
    Transport-->>Conn: parsed response
    Conn->>Pending: id=1 を検索して削除
    Conn-->>Manual: result を resolve
    Manual-->>User: [manual request result]
```

- id 付き request は `requestRaw()` で pending 管理されます。
- id なし message は notification として `sendRaw()` で送られ、response を期待しません。
- `sendRaw()` は低レベル送信用で、request を送っても pending 管理しません。

## 前提条件

- Bun
- `codex app-server` を使う場合は Codex CLI

依存関係をインストールします。

```bash
bun install
```

## 使い方

### Codex App Server に接続する

`package.json` の `start` script は `json-rpc-stdio-client.ts` を起動します。

```bash
bun run start
```

起動すると、クライアントは内部で次の lifecycle を実行します。

1. `codex app-server` を子プロセスとして起動する
2. `initialize` request を送る
3. `initialized` notification を送る
4. `>` prompt で手動 JSON-RPC 入力を受け付ける

そのため、通常は `initialize` を手入力する必要はありません。手入力では、初期化後に使う request を送ります。

例:

```json
{"method":"account/read","id":1,"params":{"refreshToken":false}}
```

```json
{"method":"model/list","id":6,"params":{"limit":20,"includeHidden":false}}
```

```json
{"method":"thread/list","id":14,"params":{"cursor":null,"limit":25,"sortKey":"created_at","archived":false}}
```

入力例は `mock/codex-server-mock-inputs.jsonl` にあります。ただし、先頭の `initialize` / `initialized` は protocol lifecycle の参考用です。`bun run start` では自動実行済みなので、手入力ではそれ以降の request を使ってください。

### request と notification の違い

`id` 付き message は JSON-RPC request として扱われます。

```json
{"method":"account/read","id":1,"params":{"refreshToken":false}}
```

manual input runtime はこの request を `requestRaw()` で送信します。入力された `id` をそのまま pending 管理に登録し、サーバーから同じ `id` の response が返ると、結果を表示します。

```txt
[manual request result] ...
```

`id` のない message は notification として扱われます。

```json
{"method":"initialized","params":{}}
```

notification は response を期待しない JSON-RPC message なので、サーバーから result は返りません。

### モックサーバーで試す

Codex CLI がない場合や、まず JSON-RPC の入出力だけ確認したい場合は、`mock/json-rpc-mock-server.ts` を使えます。

```bash
bun run mock/json-rpc-mock-server.ts
```

別 terminal から JSONL を流す、または起動設定を custom transport に差し替えて使います。mock server は `sum` method だけを実装しています。

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

- stdio transport は 1 行 1 JSON の JSONL として stdout を parse します
- `JsonRpcConnection.request()` は request id を自動採番して pending 管理します
- `JsonRpcConnection.requestRaw()` は入力済み request id を保持したまま pending 管理します
- `JsonRpcConnection.sendRaw()` は低レベル送信用で、request を送っても pending 管理しません
- manual input の id 付き request は `requestRaw()` を使うため、`received response for unknown request id` になりません
- listener 例外は RPC 制御フローを壊さないように隔離されます
- server initiated request は `onRequest()` で handler 登録し、Codex approval request は `codex/approvals.ts` で扱います
- approval request のデフォルト handler は command execution / file change のどちらも `decline` を返します

## 注意点

- verbose RPC payload logging は検証用です。prompt、file content、command output、repo path を扱う本番環境では redaction や size limit を入れてください
- `codex/types.ts` は sample client 用の最小型です。Codex App Server の完全な version-specific schema ではありません
- 完全な型が必要な場合は、利用する Codex CLI の version で次を生成してください

```bash
codex app-server generate-ts --out ./schemas/codex-app-server
```

- mock server は JSON-RPC の最小検証用です。実際の Codex App Server の method、params、response とは一致しません
- `id` のない message は notification なので response は返りません
