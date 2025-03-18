const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const TEXT_PREDICTION = document.getElementById("prediction");
const K_NUMBER = document.getElementById("k-number");

const LOADING_INDICATOR = document.createElement('div');
LOADING_INDICATOR.style.position = 'fixed';
LOADING_INDICATOR.style.top = '60px';
LOADING_INDICATOR.style.left = '50%';
LOADING_INDICATOR.style.color = 'white';
LOADING_INDICATOR.style.transform = 'translateX(-50%)';
document.body.appendChild(LOADING_INDICATOR);

let numPoints = 50;
let numClusters = 3;
let accuracy = 10;
let seed = Math.random();
let k = 3;
let kbackgroundColor = k;
let reloaded = false;
let backgroundColor = null;
let points = [];
let mousePosition = { x: 0, y: 0 };
let wheelTimeout = null;
let isRendering = false;

window.addEventListener("mousemove", function (event) {
  mousePosition.x = event.clientX;
  mousePosition.y = event.clientY;
});

window.addEventListener("touchmove", function (event) {
  mousePosition.x = event.touches[0].clientX;
  mousePosition.y = event.touches[0].clientY;
});

function random(seed, min = 0, max = 1) {
  let x = Math.sin(seed) * 10000;
  let randomValue = x - Math.floor(x);
  return min + randomValue * (max - min);
}

function generatePoints() {
  const clusterCenters = [];
  const clusterRadius = 200;

  // Cluster generation inside the canvas
  for (let i = 0; i < numClusters; i++) {
    let x = random(seed + i, clusterRadius, canvas.width - clusterRadius);
    let y = random(seed - i, clusterRadius, canvas.height - clusterRadius);
    clusterCenters.push({ x, y });
  }

  // Points generation inside the clusters
  for (let i = 0; i < numPoints; i++) {
    let clusterIndex = i % numClusters;
    let center = clusterCenters[clusterIndex];
    let x = random(
      seed + i,
      center.x - clusterRadius,
      center.x + clusterRadius
    );
    let y = random(
      seed - i,
      center.y - clusterRadius,
      center.y + clusterRadius
    );
    let category =
      clusterIndex === 0
        ? "red"
        : clusterIndex === 1
        ? "blue"
        : clusterIndex === 2
        ? "orange"
        : clusterIndex === 3
        ? "green"
        : "purple";
    points.push({ x, y, category });
  }
}

function drawPoints() {
  points.forEach((p) => {
    ctx.fillStyle = p.category;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.stroke();
  });
}

function drawCursorPrediction(x, y) {
  let { prediction, nearest, maxDist } = knn(x, y);
  TEXT_PREDICTION.textContent = prediction;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = prediction;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.stroke();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(x, y, maxDist, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "white";
  ctx.stroke();
  nearest.forEach((p) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "white";
    ctx.stroke();
  });
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  generatePoints();
  drawBackgroundColor();
  drawPoints();
}

let showColoredZone = false;

function toggleColoredZone(event) {
  if (event.code === "Space") {
    showColoredZone = !showColoredZone;
    document.getElementById("show-background").checked = showColoredZone;

    console.log(k, kbackgroundColor);
    if (
      showColoredZone &&
      (!backgroundColor || k != kbackgroundColor || reloaded)
    ) {
      generateBackgroundImage();
      kbackgroundColor = k;
    }

    renderCanvas();
  }
}

function knn(px, py) {
  let distances = points.map((p) => {
    let dist = Math.hypot(p.x - px, p.y - py);
    return { ...p, dist };
  });
  distances.sort((a, b) => a.dist - b.dist);
  let nearest = distances.slice(0, k);
  let categories = nearest.map((p) => p.category);

  let categoryCount = categories.reduce((acc, category) => {
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  let maxCount = Math.max(...Object.values(categoryCount));
  let mostFrequentCategories = Object.keys(categoryCount).filter(
    (category) => categoryCount[category] === maxCount
  );

  let prediction =
    mostFrequentCategories.length === 1
      ? mostFrequentCategories[0]
      : nearest.find((p) => mostFrequentCategories.includes(p.category))
          .category;

  let maxDist = nearest[k - 1].dist;
  return { prediction, nearest, maxDist };
}

let backgroundWorker = null;
let isGenerating = false;

function generateBackgroundImage(quality = accuracy) {
  if (isGenerating) return;
  isGenerating = true;
  LOADING_INDICATOR.textContent = 'Loading...';

  if (backgroundWorker) {
    backgroundWorker.terminate();
  }

  backgroundWorker = new Worker('background-worker.js');

  backgroundWorker.onmessage = (e) => {
    if (e.data.type === 'imageData') {
      backgroundColor = e.data.imageData;
      kbackgroundColor = k;
      renderCanvas();
      LOADING_INDICATOR.textContent = '';
      isGenerating = false;
    }
    backgroundWorker = null;
  };

  const workerData = {
    points: points.map(p => ({ 
      x: p.x, 
      y: p.y, 
      category: p.category 
    })),
    k,
    accuracy: quality,
    width: canvas.width,
    height: canvas.height
  };

  backgroundWorker.postMessage(workerData);
}

function drawBackgroundColor() {
  if (backgroundColor && showColoredZone) {
    ctx.putImageData(backgroundColor, 0, 0);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function renderCanvas() {
  if (!isRendering) {
    isRendering = true;
    requestAnimationFrame(() => {
      drawBackgroundColor();
      drawPoints();
      drawCursorPrediction(mousePosition.x, mousePosition.y);
      isRendering = false;
    });
  }
}

function reload() {
  reloaded = true;
  seed = Math.random();
  points = [];
  generatePoints();
  renderCanvas();
  if (showColoredZone) {
    generateBackgroundImage();
    renderCanvas();
  }
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", toggleColoredZone);
window.addEventListener("wheel", (event) => {
  // Wheel down
  if (event.deltaY > 0) {
    k = Math.max(1, k - 1);
    K_NUMBER.innerHTML = k;
    // Wheel up
  } else {
    k = Math.min(points.length, k + 1);
    K_NUMBER.innerHTML = k;
  }

  renderCanvas();

  clearTimeout(wheelTimeout);

  wheelTimeout = setTimeout(() => {
    if (showColoredZone) {
      generateBackgroundImage();
      renderCanvas();
    }
  }, 250);
});

let qualityCheckboxes = document.querySelectorAll('input[name$="quality"]');
qualityCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", function () {
    accuracy = parseInt(this.value);
    qualityCheckboxes.forEach((qcb) => {
      qcb.checked = qcb === this;
    });
    if (showColoredZone) {
      generateBackgroundImage(accuracy);
      renderCanvas();
    }
    // unfocus the button
    this.blur();
  });
});

let pointCheckbox = document.querySelectorAll('input[name$="number"]');
pointCheckbox.forEach((checkbox) => {
  checkbox.addEventListener("change", function () {
    // if (!this.checked) {
    //   this.checked = true;
    //   return;
    // }
    numPoints = parseInt(this.value);
    pointCheckbox.forEach((pcb) => {
      pcb.checked = pcb === this;
    });
    reload();
    if (showColoredZone) {
      generateBackgroundImage();
      renderCanvas();
    }
    // unfocus the button
    this.blur();
  });
});

let classeCheckbox = document.querySelectorAll('input[name$="class"]');
classeCheckbox.forEach((checkbox) => {
  checkbox.addEventListener("change", function () {
    // if (!this.checked) {
    //   this.checked = true;
    //   return;
    // }
    numClusters = parseInt(this.value);
    classeCheckbox.forEach((ccb) => {
      ccb.checked = ccb === this;
    });
    reload();
    if (showColoredZone) {
      generateBackgroundImage();
      renderCanvas();
    }
    // unfocus the button
    this.blur();
  });
});

document
  .getElementById("show-background")
  .addEventListener("click", function () {
    showColoredZone = !showColoredZone;

    if (
      showColoredZone &&
      (!backgroundColor || k != kbackgroundColor || reloaded)
    ) {
      generateBackgroundImage();
      kbackgroundColor = k;
    }
    renderCanvas();
    // unfocus the button
    this.blur();
  });
document.getElementById("reload").addEventListener("click", () => {
  reload();
});

canvas.addEventListener("mousemove", () => {
  renderCanvas();
});

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  renderCanvas();
});

resizeCanvas();

if (window.screen.width > 375 && window.screen.width <= 425) {
  let infoContainer = document.getElementById("info-container");
  let infoPrediction = document.getElementById("info-prediction");
  infoContainer.insertBefore(infoPrediction, infoContainer.children[6]);
  document.getElementById("hide").style.display = "flex";
} else if (window.screen.width <= 375) {
  let infoContainer = document.getElementById("info-container");
  let infoBackground = document.getElementById("info-background");
  infoBackground.style.gap = "10px";
  infoContainer.insertBefore(infoBackground, infoContainer.children[3]);
  document.getElementById("hide").style.display = "flex";
}

if (window.screen.width <= 425) {
  document.getElementById("hide").addEventListener("click", () => {
    let infoContainer = document.getElementById("info-container");
    Array.from(infoContainer.children)
      .slice(0, -3)
      .forEach((child) => {
        child.style.display = "none";
      });
    document.getElementById("show").style.display = "flex";
    document.getElementById("hide").style.display = "none";
  });
  document.getElementById("show").addEventListener("click", () => {
    let infoContainer = document.getElementById("info-container");
    Array.from(infoContainer.children)
      .slice(0, -3)
      .forEach((child) => {
        child.style.display = "flex";
      });
    document.getElementById("show").style.display = "none";
    document.getElementById("hide").style.display = "flex";
  });
}

