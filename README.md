# 物件写真チェック

スマホで撮影した物件写真をブラウザでアップロードし、掲載向けクオリティを簡易判定するツールです。

## GitHub Pages 公開

このフォルダは、そのまま GitHub Pages に公開できるようにしてあります。

### 公開手順

1. GitHub で新しいリポジトリを作成する
2. この `物件写真チェック` フォルダの中身をそのままリポジトリ直下に置く
3. `main` ブランチへ push する
4. GitHub の `Settings > Pages` を開く
5. `Build and deployment` で `GitHub Actions` を選ぶ
6. Actions のデプロイ完了後、公開URLを共有する

### 公開後のURL例

`https://<github-user>.github.io/<repository-name>/`

### メンバー展開のおすすめ

- 公開URLを共有する
- スマホ向けにQRコード化して配る
- 更新時は `main` に push するだけで反映する

## 使い方

1. `index.html` をブラウザで開く
2. 写真を選択する
3. `掲載可 / 要確認 / 掲載不可` の結果を確認する

## フォルダ構成

- `index.html`: 画面本体
- `assets/css/styles.css`: 画面スタイル
- `assets/js/script.js`: 判定ロジックと画面制御
- `.github/workflows/deploy-pages.yml`: GitHub Pages 自動公開設定
- `.nojekyll`: GitHub Pages 用設定

## 補足

- スマホ利用を前提にした縦長UIです
- 判定はシャーメゾン掲載写真の見え方を参考にした簡易チェックです
