# ItemCalc

GregTech向けの生産ライン計算アプリです。  
プロセス、外部入力、目標、廃棄先を接続して、定常状態の平均流量から必要装置台数と電力を計算します。

公開版:

- GitHub Pages: [https://aukdata.github.io/itemcalc/](https://aukdata.github.io/itemcalc/)

## できること

- プロセスノードの追加と編集
- 外部入力、目標、廃棄先ノードの追加
- ノード同士の接続
- JSON書き出し / JSON読み込み
- IndexedDBへの自動保存
- 目標流量からの逆算
- 必要装置台数の計算
- 稼働Tierに応じた処理時間 / 消費EU/tの再計算
- ポートと接続上での総流量表示

## 現在の前提

- 定常状態の平均流量を扱います
- `20t = 1s`
- アイテムは `個`、流体は `mB` を使います
- 内部計算では小数を許容します
- プロセスの出力確率は専用フィールドではなく、`1レシピ量` に期待値を直接入力する想定です
- バッファ、起動直後の過渡状態、搬送容量制約は扱いません

## プロセス計算

各プロセスは次の情報を持ちます。

- 設備名
- 最低Tier
- 稼働Tier
- 基準消費EU/t
- 基準加工時間(t)
- 回路番号
- 入力 / 出力の1レシピ量

稼働Tierが最低Tierより上がると、現在の実装では次のように再計算されます。

- 1段上がるごとに `加工時間は半分`
- 1段上がるごとに `消費EU/tは2倍`

表示上の `*消費EU/t` と `*加工時間` は、この再計算後の値です。  
計算結果として表示される装置台数は、必要流量を満たすための総台数です。

## 保存

- ブラウザ内では IndexedDB に自動保存します
- 保存対象は「現在のプロジェクト」1件です
- `JSON書き出し` でファイル保存できます
- `JSON読み込み` で復元できます

JSONエクスポート形式:

```json
{
  "format": "itemcalc-project",
  "formatVersion": 1,
  "exportedAt": "2026-06-14T00:00:00.000Z",
  "project": {}
}
```

## 操作

- `計算`: 現在のラインを計算
- `新規`: 新しいプロジェクトを作成
- `元に戻す` / `やり直す`
- `プロセス追加`
- `入力追加`
- `目標追加`
- `廃棄先追加`
- `削除`

ショートカット:

- `Ctrl+C`: 選択ノードのコピー
- `Ctrl+V`: 貼り付け
- `Delete`: 選択ノード / 接続の削除

## 開発

前提:

- Node.js `>=24 <25`
- pnpm `>=11 <12`
- 推奨: `pnpm@11.6.0`

セットアップ:

```bash
pnpm install
```

開発サーバー:

```bash
pnpm dev
```

本番ビルド:

```bash
pnpm build
```

プレビュー:

```bash
pnpm preview
```

検証:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## 主要構成

- [SPEC.md](/D:/Users/Takuma/Creations/codes/itemcalc/SPEC.md): プロダクト仕様
- [DESIGN.md](/D:/Users/Takuma/Creations/codes/itemcalc/DESIGN.md): 詳細設計
- [TECH_SPEC.md](/D:/Users/Takuma/Creations/codes/itemcalc/TECH_SPEC.md): 技術選定と技術仕様
- [src/features/editor](/D:/Users/Takuma/Creations/codes/itemcalc/src/features/editor): エディタUI
- [src/calculation](/D:/Users/Takuma/Creations/codes/itemcalc/src/calculation): 計算エンジン
- [src/persistence](/D:/Users/Takuma/Creations/codes/itemcalc/src/persistence): 保存 / import / export

## 注意

- `dist/index.html` を `file://` で直接開くと、ブラウザのCORS制約で正しく動きません
- ローカル確認は `pnpm dev` か `pnpm preview` を使ってください
- 日本語表示の確認では、PowerShellの`Get-Content`だけを根拠にせず、実際のブラウザ表示も確認する運用にしています
