const colorMap = {
  red: [255, 0, 0, 255],
  blue: [0, 0, 255, 255],
  orange: [255, 165, 0, 255],
  green: [0, 128, 0, 255],
  purple: [128, 0, 128, 255]
};

self.onmessage = function(e) {
  const { points, k, accuracy, width, height } = e.data;
  const imageData = new ImageData(width, height);
  const data = imageData.data;

  for (let x = 0; x < width; x += accuracy) {
    for (let y = 0; y < height; y += accuracy) {
      // KNN
      const distances = points.map(p => ({
        category: p.category,
        dist: Math.hypot(p.x - x, p.y - y)
      }));
      
      distances.sort((a, b) => a.dist - b.dist);
      const nearest = distances.slice(0, k);
      
      const counts = nearest.reduce((acc, { category }) => {
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});
      
      const prediction = Object.entries(counts)
        .sort(([,a], [,b]) => b - a)[0][0];
      
      const rgba = colorMap[prediction];
      for (let dx = 0; dx < accuracy; dx++) {
        for (let dy = 0; dy < accuracy; dy++) {
          const px = x + dx;
          const py = y + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            data.set(rgba, idx);
          }
        }
      }
    }
  }

  self.postMessage({ 
    type: 'imageData', 
    imageData: imageData 
  }, [imageData.data.buffer]);
};