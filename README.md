# Simple Mind Map

Simple Mind Mapは、考えや情報をすばやく整理するための個人向けマインドマップWebアプリです。HTML・CSS・Vanilla JavaScriptだけで動作し、ビルドや外部ライブラリを必要としません。

データは利用中のブラウザ内へ保存されます。複数マップの管理、検索、バックアップ、画像・PDF出力、スマホ操作、PWAによる基本的なオフライン利用に対応しています。

**公開URL：** [https://kanto879.github.io/simple-mind-map/](https://kanto879.github.io/simple-mind-map/)

## 主な機能

- 複数マインドマップの作成、切り替え、名前変更、複製
- マップのお気に入り、ゴミ箱への移動、復元、完全削除
- ノードの追加、選択、名前編集、子孫を含む削除
- マウス・タッチによるノードのドラッグ移動
- 親子関係に追従するBezier曲線の接続線
- 8色のノードカラーと接続線への色反映
- キャンバスのパン、ホイールズーム、ボタン操作、ピンチズーム、全体表示
- rootを中心とした自動レイアウト
- 現在のマップ内検索と該当ノードへの移動
- ノード操作のUndo / Redoとキーボードショートカット
- localStorageへの自動保存と再読み込み時の復元
- 全マップのJSONバックアップ書き出し・読み込み
- 現在のマップ全体のPNG・PDF出力
- PC・スマートフォン対応のレスポンシブUI
- ホーム画面への追加と基本的なオフライン利用ができるPWA

## 技術構成

- HTML
- CSS
- Vanilla JavaScript
- SVG（接続線とUIアイコン）
- Canvas / Blob（PNG・PDF出力）
- localStorage（マップデータ保存）
- Web App Manifest / Service Worker（PWA）

React、npm、ビルドツール、外部CDNは使用していません。PNG・PDFもブラウザ標準APIだけで生成します。

## ファイル構成

```text
.
├── index.html                 アプリ画面
├── style.css                 デザインとレスポンシブ対応
├── script.js                 マインドマップの全処理
├── manifest.webmanifest      PWA設定
├── service-worker.js         オフラインキャッシュ
├── icons/
│   ├── icon-192.png          192pxアプリアイコン
│   ├── icon-512.png          512pxアプリアイコン
│   ├── icon-maskable-512.png maskableアイコン
│   └── *-source.svg          アイコン編集用の元データ
├── tests/                    STEP4以降のブラウザ回帰テスト
├── .gitignore                ローカル専用ファイルの除外設定
└── README.md
```

## 基本的な使い方

1. 「新しいマップ」でマップを作成します。
2. ノードを選択し、右下の「＋」または下部の「ノード追加」で子ノードを追加します。
3. PCではノードをダブルクリック、スマートフォンでは選択中のノードをもう一度タップして名前を編集します。
4. ノードをドラッグして移動し、背景をドラッグして表示範囲を移動します。
5. ホイール、ピンチ、右側のズームボタンで表示倍率を変更します。

ノード操作はヘッダーのUndo / Redoから戻せます。PCでは`Ctrl/Cmd + Z`、Redoは`Ctrl/Cmd + Shift + Z`または`Ctrl + Y`も利用できます。

## JSONバックアップ

ヘッダー右側の「その他」メニューから、全マップをJSONファイルへ書き出せます。「JSONを読み込む」で同じ形式のバックアップを復元できます。

ブラウザの履歴・サイトデータを削除するとlocalStorageのデータも失われる可能性があります。重要なマップは定期的にJSONバックアップを保存してください。

## PNG・PDF出力

「その他」メニューから、現在のマップ全体をPNGまたはPDFで保存できます。画面外のノードと接続線も含まれ、現在のパン位置やズーム倍率は変更されません。

## データ保存

マップデータはブラウザのlocalStorageへ自動保存され、サーバーやクラウドへ自動送信されません。保存領域はURL単位で異なるため、継続利用するときは毎回同じURLから開いてください。

選択状態、検索文字、Undo / Redo履歴などの一時的な画面状態は保存対象外です。

## PWAとオフライン利用

対応ブラウザでは、Androidの「アプリをインストール」やiPhone Safariの「ホーム画面に追加」からアプリとして起動できます。

一度オンラインで読み込むと、アプリ本体と主要ファイルがキャッシュされ、保存済みマップの編集・検索・JSON／PNG／PDF出力などをオフラインでも利用できます。Service Workerは`localhost`またはHTTPS環境でのみ有効です。`file://`で直接開いた場合、通常機能は動きますがPWAとオフラインキャッシュは動きません。

## ローカルで起動する方法

プロジェクトフォルダで次のコマンドを実行します。

```bash
python3 -m http.server 8000
```

ブラウザで次のURLを開きます。

```text
http://localhost:8000/
```

停止するときは、コマンドを実行した画面で`Ctrl + C`を押します。

## GitHub Pages

このアプリはGitHub Pagesで公開しています。

```text
https://kanto879.github.io/simple-mind-map/
```

CSS、JavaScript、Manifest、Service Worker、アイコンは相対パスまたはService Workerのscopeを基準に読み込むため、`simple-mind-map/`配下でも正常に動作します。`main`ブランチの`/ (root)`から公開しており、以後は変更をcommitしてpushするとGitHub Pagesへ反映されます。

## テスト

ローカルHTTPサーバーを起動して、次のページを開くとSTEP4〜15の回帰テストをまとめて実行できます。

```text
http://localhost:8000/tests/regression.html
```

テストは独立したStorageモックを使うため、通常利用しているマップデータを変更しません。実機のソフトウェアキーボードやOS固有のジェスチャーは、Android・iPhoneの実機でも確認してください。

## 開発時の注意

- `service-worker.js`のキャッシュ対象を変更した場合は、`CACHE_NAME`も更新してください。
- 古い画面が残る場合は、ブラウザの開発者ツールでService WorkerとCache Storageを確認してから再読み込みしてください。
- キャッシュ更新のためにlocalStorageを削除するとマップデータも消えるため、先にJSONバックアップを保存してください。
- `git reset --hard`や`git clean -fd`など、未コミットの作業を破棄するコマンドは使用しないでください。

## 現在の制約

- データはブラウザ内保存で、クラウド同期やユーザーアカウントはありません。
- 異なる端末やブラウザ間の移行にはJSONバックアップを使用します。
- PWAのインストールとService WorkerにはHTTPSまたはlocalhostが必要です。
