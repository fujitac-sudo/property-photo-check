const STATUS_LABELS = {
  ok: "掲載可",
  review: "要確認",
  ng: "掲載不可",
};

const STATUS_PRIORITY = {
  ok: 0,
  review: 1,
  ng: 2,
};

const elements = {
  photoInput: document.getElementById("photoInput"),
  emptyState: document.getElementById("emptyState"),
  resultsGrid: document.getElementById("resultsGrid"),
  template: document.getElementById("resultCardTemplate"),
  okCount: document.getElementById("okCount"),
  reviewCount: document.getElementById("reviewCount"),
  ngCount: document.getElementById("ngCount"),
};

elements.photoInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  await renderEvaluations(files);
});

async function renderEvaluations(files) {
  elements.resultsGrid.innerHTML = "";

  if (!files.length) {
    updateSummary([]);
    elements.emptyState.classList.remove("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");

  const evaluations = [];
  for (const file of files) {
    const evaluation = await evaluateFile(file);
    evaluations.push(evaluation);
    elements.resultsGrid.appendChild(buildResultCard(evaluation));
  }

  updateSummary(evaluations);
}

async function evaluateFile(file) {
  const image = await loadImageFromFile(file);
  const scaled = drawScaledImage(image, 1600);
  const { width, height, imageData } = scaled;
  const gray = toGray(imageData.data);
  const analysis = analyzeMetrics(gray, width, height);

  const checks = [
    evaluateResolution(width, height),
    evaluateOrientation(width, height),
    evaluateBrightness(analysis),
    evaluateSharpness(analysis),
    evaluateTilt(analysis),
    evaluateFraming(analysis),
  ];

  let decision = "ok";
  const reasons = [];
  const suggestions = [];

  for (const check of checks) {
    if (STATUS_PRIORITY[check.status] > STATUS_PRIORITY[decision]) {
      decision = check.status;
    }
    if (check.reason) {
      reasons.push(check.reason);
    }
    if (check.suggestion) {
      suggestions.push(check.suggestion);
    }
  }

  const score = Math.max(
    0,
    Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length)
  );

  const mainIssue =
    checks
      .slice()
      .sort((a, b) => STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status] || a.score - b.score)[0]
      ?.label || "問題なし";

  return {
    file,
    imageUrl: URL.createObjectURL(file),
    width,
    height,
    decision,
    decisionLabel: STATUS_LABELS[decision],
    score,
    mainIssue,
    reasons: uniqueItems(reasons),
    suggestions: uniqueItems(suggestions),
    metrics: [
      ["明るさ平均", formatNumber(analysis.meanBrightness, 0)],
      ["白飛び率", formatPercent(analysis.whiteClipRatio)],
      ["黒つぶれ率", formatPercent(analysis.blackClipRatio)],
      ["傾き推定", analysis.tiltDegrees == null ? "判定弱め" : `${formatNumber(analysis.tiltDegrees, 1)}°`],
      ["シャープネス", formatNumber(analysis.sharpnessVariance, 0)],
      ["端の詰まり", formatPercent(analysis.borderContactRatio)],
    ],
  };
}

function buildResultCard(evaluation) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".result-card");
  const image = fragment.querySelector("img");
  const fileName = fragment.querySelector(".file-name");
  const meta = fragment.querySelector(".meta");
  const badge = fragment.querySelector(".status-badge");
  const scoreValue = fragment.querySelector(".score-value");
  const mainIssue = fragment.querySelector(".main-issue");
  const reasonList = fragment.querySelector(".reason-list");
  const suggestionList = fragment.querySelector(".suggestion-list");
  const metricGrid = fragment.querySelector(".metric-grid");

  image.src = evaluation.imageUrl;
  image.alt = evaluation.file.name;
  fileName.textContent = evaluation.file.name;
  meta.textContent = `${evaluation.width} x ${evaluation.height}`;
  badge.textContent = evaluation.decisionLabel;
  badge.classList.add(`status-${evaluation.decision}`);
  scoreValue.textContent = `${evaluation.score} / 100`;
  mainIssue.textContent = evaluation.mainIssue;

  for (const reason of evaluation.reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    reasonList.appendChild(li);
  }

  for (const suggestion of evaluation.suggestions) {
    const li = document.createElement("li");
    li.textContent = suggestion;
    suggestionList.appendChild(li);
  }

  for (const [label, value] of evaluation.metrics) {
    const item = document.createElement("div");
    item.className = "metric-item";
    item.innerHTML = `
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    `;
    metricGrid.appendChild(item);
  }

  return card;
}

function updateSummary(evaluations) {
  const counts = { ok: 0, review: 0, ng: 0 };
  for (const evaluation of evaluations) {
    counts[evaluation.decision] += 1;
  }
  elements.okCount.textContent = counts.ok;
  elements.reviewCount.textContent = counts.review;
  elements.ngCount.textContent = counts.ng;
}

function evaluateResolution(width, height) {
  const shortest = Math.min(width, height);
  const longest = Math.max(width, height);

  if (shortest < 720 || longest < 1280) {
    return {
      label: "解像度不足",
      status: "ng",
      score: 32,
      reason: "解像度が低く、掲載時に粗く見える可能性があります。",
      suggestion: "スマホの標準画質以上で撮影し、圧縮しすぎた画像は避けてください。",
    };
  }

  if (shortest < 960 || longest < 1600) {
    return {
      label: "解像度やや不足",
      status: "review",
      score: 70,
      reason: "掲載は可能でも、拡大時の精細感が弱い可能性があります。",
      suggestion: "できれば元画像のままアップロードし、スクリーンショット転送は避けてください。",
    };
  }

  return {
    label: "解像度良好",
    status: "ok",
    score: 100,
    reason: "解像度は掲載用途として大きな問題はありません。",
    suggestion: "元画像のままアップロードする運用を維持してください。",
  };
}

function evaluateOrientation(width, height) {
  if (width < height) {
    return {
      label: "縦位置",
      status: "ng",
      score: 25,
      reason: "縦位置の写真で、室内の横方向の広がりが伝わりにくいです。",
      suggestion: "室内写真は基本的に横位置で撮影してください。",
    };
  }

  if (width / height < 1.2) {
    return {
      label: "横幅やや不足",
      status: "review",
      score: 72,
      reason: "横位置ではあるものの、やや縦長寄りで空間の広がりが弱めです。",
      suggestion: "もう少し横位置を意識して撮ると掲載向きになります。",
    };
  }

  return {
    label: "横位置",
    status: "ok",
    score: 100,
    reason: "横位置で、室内の広がりを見せやすい構図です。",
    suggestion: "横位置を基本に維持してください。",
  };
}

function evaluateBrightness(metrics) {
  if (metrics.meanBrightness < 85 || metrics.whiteClipRatio > 0.16) {
    return {
      label: "露出NG",
      status: "ng",
      score: 35,
      reason:
        metrics.meanBrightness < 85
          ? "写真全体が暗く、部屋の情報が伝わりにくいです。"
          : "白飛びが強く、窓まわりや壁面の情報が失われています。",
      suggestion:
        metrics.meanBrightness < 85
          ? "照明をすべて点灯し、明るさを上げて再撮影してください。"
          : "露出を少し下げて、窓付近の白飛びを抑えてください。",
    };
  }

  if (
    metrics.meanBrightness < 105 ||
    metrics.whiteClipRatio > 0.09 ||
    metrics.blackClipRatio > 0.24 ||
    metrics.dynamicRange < 42
  ) {
    return {
      label: "露出要確認",
      status: "review",
      score: 70,
      reason: "やや暗い、または明暗差のバランスに少し不安があります。",
      suggestion: "撮影位置を少し変えつつ、窓と室内の明るさバランスを整えてください。",
    };
  }

  return {
    label: "露出良好",
    status: "ok",
    score: 100,
    reason: "明るさと階調は概ね安定しています。",
    suggestion: "今の明るさ基準を維持してください。",
  };
}

function evaluateSharpness(metrics) {
  if (metrics.sharpnessVariance < 85) {
    return {
      label: "ピンボケ",
      status: "ng",
      score: 30,
      reason: "解像感が低く、ブレやピンボケの可能性があります。",
      suggestion: "両手で固定し、撮影後に拡大してブレがないか確認してください。",
    };
  }

  if (metrics.sharpnessVariance < 145) {
    return {
      label: "シャープさ不足",
      status: "review",
      score: 72,
      reason: "やや甘い写りで、掲載写真としては見栄えが弱い可能性があります。",
      suggestion: "手ブレしにくい姿勢で再撮影し、レンズの汚れも確認してください。",
    };
  }

  return {
    label: "解像感良好",
    status: "ok",
    score: 100,
    reason: "解像感は概ね良好です。",
    suggestion: "このシャープさを維持してください。",
  };
}

function evaluateTilt(metrics) {
  if (metrics.tiltDegrees != null && metrics.tiltDegrees > 5) {
    return {
      label: "傾き大",
      status: "ng",
      score: 28,
      reason: "壁や建具の縦横が傾いて見え、掲載写真として不安定です。",
      suggestion: "ドア枠や壁を基準に、水平垂直を合わせて撮り直してください。",
    };
  }

  if (metrics.tiltDegrees == null || metrics.tiltDegrees > 2.8) {
    return {
      label: "傾き要確認",
      status: "review",
      score: 70,
      reason:
        metrics.tiltDegrees == null
          ? "傾きの基準線が弱く、自動判定が安定しません。"
          : "わずかな傾きがあり、建物写真としては気になる可能性があります。",
      suggestion: "グリッド表示を使い、壁や建具をまっすぐに合わせてください。",
    };
  }

  return {
    label: "傾き良好",
    status: "ok",
    score: 100,
    reason: "水平垂直は概ね整っています。",
    suggestion: "この水平感を維持してください。",
  };
}

function evaluateFraming(metrics) {
  if (metrics.borderContactRatio > 0.24) {
    return {
      label: "構図詰まり",
      status: "ng",
      score: 38,
      reason: "画面端の詰まりが強く、空間全体が収まっていない可能性があります。",
      suggestion: "少し下がるか、部屋の角から対角方向に撮影してください。",
    };
  }

  if (
    metrics.borderContactRatio > 0.17 ||
    (metrics.activeCorners === 0 && metrics.centerDensity > metrics.fullDensity * 2.2)
  ) {
    return {
      label: "構図要確認",
      status: "review",
      score: 69,
      reason: "構図がやや寄り気味で、部屋の広がりが十分に伝わらない可能性があります。",
      suggestion: "少し引いて、床や壁のラインも含めて空間の広がりを入れてください。",
    };
  }

  return {
    label: "構図良好",
    status: "ok",
    score: 100,
    reason: "部屋の広がりは比較的自然に表現できています。",
    suggestion: "角から対角方向の広め構図を維持してください。",
  };
}

function analyzeMetrics(gray, width, height) {
  const brightnessStats = computeBrightnessStats(gray);
  const edgeStats = computeEdgeStats(gray, width, height);
  const sharpnessVariance = computeSharpness(gray, width, height);

  return {
    ...brightnessStats,
    ...edgeStats,
    sharpnessVariance,
  };
}

function computeBrightnessStats(gray) {
  let sum = 0;
  let blackClipCount = 0;
  let whiteClipCount = 0;
  const values = new Array(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i];
    values[i] = value;
    sum += value;
    if (value <= 15) {
      blackClipCount += 1;
    }
    if (value >= 245) {
      whiteClipCount += 1;
    }
  }

  values.sort((a, b) => a - b);

  const p5 = percentileSorted(values, 0.05);
  const p95 = percentileSorted(values, 0.95);

  return {
    meanBrightness: sum / gray.length,
    dynamicRange: p95 - p5,
    blackClipRatio: blackClipCount / gray.length,
    whiteClipRatio: whiteClipCount / gray.length,
  };
}

function computeEdgeStats(gray, width, height) {
  const borderBand = Math.max(8, Math.floor(Math.min(width, height) * 0.08));
  const centerMarginX = Math.floor(width * 0.3);
  const centerMarginY = Math.floor(height * 0.3);
  const cornerW = Math.max(12, Math.floor(width * 0.18));
  const cornerH = Math.max(12, Math.floor(height * 0.18));

  let edgeCount = 0;
  let borderEdgeCount = 0;
  let centerEdgeCount = 0;
  let borderPixelCount = 0;
  let centerPixelCount = 0;
  const cornerEdgeCounts = [0, 0, 0, 0];
  const cornerPixelCounts = [cornerW * cornerH, cornerW * cornerH, cornerW * cornerH, cornerW * cornerH];

  let tiltSum = 0;
  let tiltWeight = 0;
  let tiltLineCount = 0;

  const threshold = 28;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx =
        -gray[index - width - 1] + gray[index - width + 1] +
        -2 * gray[index - 1] + 2 * gray[index + 1] +
        -gray[index + width - 1] + gray[index + width + 1];
      const gy =
        gray[index - width - 1] + 2 * gray[index - width] + gray[index - width + 1] +
        -gray[index + width - 1] - 2 * gray[index + width] - gray[index + width + 1];

      const magnitude = Math.hypot(gx, gy);
      const isEdge = magnitude > threshold;

      const isBorder =
        x < borderBand || x >= width - borderBand || y < borderBand || y >= height - borderBand;
      const isCenter =
        x >= centerMarginX &&
        x < width - centerMarginX &&
        y >= centerMarginY &&
        y < height - centerMarginY;

      if (isBorder) {
        borderPixelCount += 1;
      }
      if (isCenter) {
        centerPixelCount += 1;
      }

      if (!isEdge) {
        continue;
      }

      edgeCount += 1;
      if (isBorder) {
        borderEdgeCount += 1;
      }
      if (isCenter) {
        centerEdgeCount += 1;
      }

      if (x < cornerW && y < cornerH) {
        cornerEdgeCounts[0] += 1;
      } else if (x >= width - cornerW && y < cornerH) {
        cornerEdgeCounts[1] += 1;
      } else if (x < cornerW && y >= height - cornerH) {
        cornerEdgeCounts[2] += 1;
      } else if (x >= width - cornerW && y >= height - cornerH) {
        cornerEdgeCounts[3] += 1;
      }

      const gradientAngle = (Math.atan2(gy, gx) * 180) / Math.PI;
      const lineAngle = normalizeAngle(gradientAngle + 90);
      const deviation = angleDeviation(lineAngle);

      if (deviation <= 15) {
        tiltSum += deviation * magnitude;
        tiltWeight += magnitude;
        tiltLineCount += 1;
      }
    }
  }

  const fullDensity = edgeCount / Math.max(1, (width - 2) * (height - 2));
  const borderContactRatio = borderEdgeCount / Math.max(1, borderPixelCount);
  const centerDensity = centerEdgeCount / Math.max(1, centerPixelCount);
  const activeCorners = cornerEdgeCounts.filter(
    (count, index) => count / Math.max(1, cornerPixelCounts[index]) > fullDensity * 0.7
  ).length;

  return {
    fullDensity,
    borderContactRatio,
    centerDensity,
    activeCorners,
    tiltDegrees: tiltWeight > 0 && tiltLineCount > 30 ? tiltSum / tiltWeight : null,
  };
}

function computeSharpness(gray, width, height) {
  const laplacianValues = [];

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const value =
        gray[index - width] +
        gray[index - 1] +
        gray[index + 1] +
        gray[index + width] -
        4 * gray[index];
      laplacianValues.push(value);
    }
  }

  let sum = 0;
  for (const value of laplacianValues) {
    sum += value;
  }
  const mean = sum / Math.max(1, laplacianValues.length);

  let varianceSum = 0;
  for (const value of laplacianValues) {
    const diff = value - mean;
    varianceSum += diff * diff;
  }

  return varianceSum / Math.max(1, laplacianValues.length);
}

function toGray(data) {
  const gray = new Uint8ClampedArray(data.length / 4);

  for (let source = 0, target = 0; source < data.length; source += 4, target += 1) {
    gray[target] = Math.round(
      data[source] * 0.299 +
      data[source + 1] * 0.587 +
      data[source + 2] * 0.114
    );
  }

  return gray;
}

function drawScaledImage(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return {
    width,
    height,
    imageData: context.getImageData(0, 0, width, height),
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`${file.name} の読み込みに失敗しました。`));
    };

    image.src = objectUrl;
  });
}

function percentileSorted(values, ratio) {
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)));
  return values[index];
}

function normalizeAngle(angle) {
  let normalized = angle % 180;
  if (normalized < 0) {
    normalized += 180;
  }
  return normalized;
}

function angleDeviation(angle) {
  return Math.min(angle, Math.abs(angle - 90), Math.abs(angle - 180));
}

function uniqueItems(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function formatPercent(value) {
  return `${formatNumber(value * 100, 1)}%`;
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}
