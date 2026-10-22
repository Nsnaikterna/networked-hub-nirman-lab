// Reliability chart: for each confidence bucket, a green bar (actual accuracy)
// and an amber line (stated confidence). Perfect calibration = line sits on the bar top.
function renderReliability(svg, buckets) {
  var w = 700, h = 240, padL = 40, padR = 14, padT = 14, padB = 40;
  var pw = w - padL - padR, ph = h - padT - padB;
  var y = function (v) { return padT + ph - (v / 100) * ph; };
  var slot = pw / buckets.length, bw = slot * 0.5;
  var p = [];
  [0, 50, 100].forEach(function (v) {
    p.push('<line x1="' + padL + '" y1="' + y(v) + '" x2="' + (w - padR) + '" y2="' + y(v) + '" stroke="var(--card-border)" stroke-dasharray="4 4"/>');
    p.push('<text x="' + (padL - 8) + '" y="' + (y(v) + 4) + '" font-size="10" text-anchor="end">' + v + '%</text>');
  });
  buckets.forEach(function (b, i) {
    var cx = padL + slot * i + slot / 2;
    p.push('<text x="' + cx + '" y="' + (h - 20) + '" font-size="10" text-anchor="middle">' + b.label + '%</text>');
    p.push('<text x="' + cx + '" y="' + (h - 6) + '" font-size="9" text-anchor="middle">n=' + b.n + '</text>');
    if (!b.n) return;
    var barH = ph * b.accuracy / 100;
    p.push('<rect x="' + (cx - bw / 2) + '" y="' + y(b.accuracy) + '" width="' + bw + '" height="' + barH + '" fill="var(--teal)" opacity="0.75"/>');
    p.push('<line x1="' + (cx - bw / 2 - 6) + '" y1="' + y(b.avgConfidence) + '" x2="' + (cx + bw / 2 + 6) + '" y2="' + y(b.avgConfidence) + '" stroke="var(--amber)" stroke-width="3"/>');
  });
  svg.innerHTML = p.join('');
}
