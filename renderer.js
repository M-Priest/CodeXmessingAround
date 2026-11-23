(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function noise(x, y) {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const dx = smooth(x - left);
    const dy = smooth(y - top);
    return lerp(
      lerp(hash(left, top), hash(left + 1, top), dx),
      lerp(hash(left, top + 1), hash(left + 1, top + 1), dx),
      dy,
    );
  }

  // Bake the cloud layers to a lit sphere once so animation only draws a sprite.
  function createPlanet() {
    const palette = [
      [69, 34, 32], [112, 56, 43], [168, 87, 62], [194, 117, 82],
      [220, 160, 112], [233, 192, 146], [247, 218, 181],
    ];
    const sprite = document.createElement('canvas');
    const size = 478;
    sprite.width = sprite.height = size;
    const context = sprite.getContext('2d');
    const texture = context.createImageData(size, size);
    const radius = size / 2 - 2;

    for (let py = 0; py < size; py++) {
      const y = (py + 0.5 - size / 2) / radius;
      for (let px = 0; px < size; px++) {
        const x = (px + 0.5 - size / 2) / radius;
        const surface = 1 - x * x - y * y;
        if (surface <= 0) continue;

        const z = Math.sqrt(surface);
        const longitude = Math.atan2(x, z);
        const latitude = Math.asin(y);
        const spotX = (longitude + 0.32) / 0.31;
        const spotY = (latitude - 0.34) / 0.105;
        const spotDistance = Math.hypot(spotX, spotY);
        const spotWarp = Math.exp(-spotDistance * spotDistance * 0.55);
        const spotAngle = Math.atan2(spotY, spotX) + spotWarp * 2.1;
        const u = longitude + Math.cos(spotAngle) * spotWarp * 0.08;
        const streak = noise(u * 4 + 14, latitude * 24 + 22) - 0.5;
        const billow = noise(u * 2.8 + 68, latitude * 8 + 44) - 0.5;
        const thread = noise(u * 19 + streak * 1.6, latitude * 78 + 91.4) - 0.5;
        const band = latitude + streak * 0.051 + billow * 0.097
          + Math.sin(u * 2.3 + latitude * 17) * 0.015
          + Math.sin(spotAngle) * spotWarp * 0.058;

        let pigment = 0.53 + Math.sin(band * 15.8 - 0.5) * 0.14
          + Math.sin(band * 35.8 + 2.4) * 0.102
          + Math.sin(band * 68.0 - 3.2) * 0.058
          + Math.sin(band * 118.0 + billow) * 0.028
          + streak * 0.18 + thread * 0.15 + billow * 0.23;
        const polarHaze = clamp((Math.abs(latitude) - 0.94) / 0.47, 0, 1);
        pigment *= 1 - polarHaze * 0.25;

        if (spotDistance < 1.22) {
          const spotEdge = smooth(clamp((1.22 - spotDistance) / 0.43, 0, 1));
          const spotPigment = 0.36 + Math.sin(spotDistance * 25 + streak * 3) * 0.073
            + Math.sin(spotAngle * 3 - spotDistance * 6) * 0.043 + thread * 0.14;
          pigment = lerp(pigment, spotPigment, spotEdge * 0.88);
        }

        const palettePosition = clamp(pigment, 0, 0.999) * (palette.length - 1);
        const lower = Math.floor(palettePosition);
        const blend = palettePosition - lower;
        const sun = clamp(-0.64 * x - 0.39 * y + 0.66 * z, 0, 1);
        const lit = 0.075 + 1.19 * Math.pow(sun, 0.65);
        const edge = Math.pow(1 - z, 5);
        const haze = edge * (0.025 + 0.24 * sun);
        const microGrain = (hash(px + 649, py + 43) - 0.5) * 6;
        const offset = (py * size + px) * 4;
        texture.data[offset] = lerp(
          lerp(palette[lower][0], palette[lower + 1][0], blend) * lit + microGrain,
          247,
          haze,
        );
        texture.data[offset + 1] = lerp(
          lerp(palette[lower][1], palette[lower + 1][1], blend) * lit + microGrain,
          179,
          haze,
        );
        texture.data[offset + 2] = lerp(
          lerp(palette[lower][2], palette[lower + 1][2], blend) * lit + microGrain * 0.75,
          152,
          haze,
        ) + (1 - sun) * 4;
        texture.data[offset + 3] = clamp(surface * radius * 128, 0, 255);
      }
    }

    context.putImageData(texture, 0, 0);
    return sprite;
  }

  class OrbitRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.planet = createPlanet();
      this.backdrop = document.createElement('canvas');
    }

    resize() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) {
        return;
      }

      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
      this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
      this.backdrop.width = this.canvas.width;
      this.backdrop.height = this.canvas.height;
      if (width && height) this.drawBackdrop();
    }

    drawBackdrop() {
      const { width, height, pixelRatio } = this;
      const context = this.backdrop.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = '#080a14';
      context.fillRect(0, 0, width, height);

      const violet = context.createRadialGradient(
        width * 0.45, height * 0.45, 0,
        width * 0.45, height * 0.45, width * 0.61,
      );
      violet.addColorStop(0, '#1b172b');
      violet.addColorStop(0.45, '#111326');
      violet.addColorStop(1, 'rgba(9, 12, 25, 0)');
      context.fillStyle = violet;
      context.fillRect(0, 0, width, height);

      const amber = context.createRadialGradient(
        width * 0.39, height * 0.43, 0,
        width * 0.39, height * 0.43, height * 0.58,
      );
      amber.addColorStop(0, 'rgba(130, 65, 51, 0.115)');
      amber.addColorStop(1, 'rgba(130, 65, 51, 0)');
      context.fillStyle = amber;
      context.fillRect(0, 0, width, height);

      const count = Math.round(clamp(width * height / 1760, 105, 425));
      for (let i = 0; i < count; i++) {
        const x = hash(i + 79, 19) * width;
        const y = hash(i + 17, 81) * height;
        const brightness = hash(i, 117);
        const color = hash(i, 220) > 0.73 ? '225, 190, 184' : '183, 193, 238';
        const radius = 0.32 + brightness * brightness * 0.7;
        if (brightness > 0.94) {
          const light = context.createRadialGradient(x, y, 0, x, y, 4.3);
          light.addColorStop(0, 'rgba(167, 174, 235, 0.29)');
          light.addColorStop(1, 'rgba(167, 174, 235, 0)');
          context.fillStyle = light;
          context.fillRect(x - 5, y - 5, 10, 10);
        }

        context.fillStyle = `rgba(${color}, ${0.11 + brightness * brightness * 0.54})`;
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
      }

      this.drawStar(context, width * 0.176, height * 0.295, 1);
      this.drawStar(context, width * 0.793, height * 0.211, 0.74);
      this.drawStar(context, width * 0.849, height * 0.736, 0.5);
    }

    drawStar(context, x, y, intensity) {
      const radius = 7 * intensity + 2;
      const light = context.createRadialGradient(x, y, 0, x, y, radius);
      light.addColorStop(0, `rgba(204, 206, 254, ${0.58 * intensity})`);
      light.addColorStop(0.25, `rgba(176, 178, 238, ${0.22 * intensity})`);
      light.addColorStop(1, 'rgba(144, 158, 255, 0)');
      context.fillStyle = light;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      context.fillStyle = `rgba(231, 224, 254, ${0.71 * intensity})`;
      context.beginPath();
      context.moveTo(x, y - radius);
      context.lineTo(x + 0.56, y - 0.52);
      context.lineTo(x + radius * 0.7, y);
      context.lineTo(x + 0.56, y + 0.52);
      context.lineTo(x, y + radius);
      context.lineTo(x - 0.56, y + 0.52);
      context.lineTo(x - radius * 0.7, y);
      context.lineTo(x - 0.56, y - 0.52);
      context.closePath();
      context.fill();
    }

    render({ phase, gravity, distance, inclination, trails, activePreset }) {
      this.resize();
      const { context, width, height, pixelRatio } = this;
      if (!width || !height) return { x: 0, y: 0, hidden: true };

      const centerX = width * 0.49;
      const centerY = height * 0.49;
      const planetRadius = Math.min(width * 0.21, height * 0.219, 140);
      const trackRadius = lerp(
        planetRadius * 1.35,
        Math.max(planetRadius * 1.47, Math.min(width * 0.411, height * 0.7)),
        (distance - 2) / 6,
      );
      const minorRatio = lerp(0.2, 0.72, inclination / 75);
      const angle = -0.32 - inclination * 0.0012;
      const track = { x: trackRadius, y: trackRadius * minorRatio, angle };
      const secondary = {
        x: Math.min(width * 0.445, track.x * 1.19 + 12),
        y: Math.min(height * 0.36, track.y * 1.25 + 4),
        angle: angle - 0.025,
      };
      const reference = {
        x: Math.min(width * 0.472, secondary.x * 1.08 + 6),
        y: Math.min(height * 0.391, secondary.y * 1.14 + 7),
        angle: angle - 0.045,
      };
      const multiplier = [1, 1.37, 0.76][activePreset] || 1;
      const moonPhase = 4.25 - phase * 0.53 * multiplier;
      const moonPosition = this.point(reference, moonPhase);
      const position = this.point(track, phase);

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.drawImage(this.backdrop, 0, 0, width, height);
      context.save();
      context.translate(centerX, centerY);

      this.drawTrack(reference, Math.PI, TAU, 'rgba(149, 155, 214, 0.17)', true);
      this.drawTrack(secondary, Math.PI, TAU, 'rgba(149, 155, 214, 0.16)');
      this.drawTrack(track, Math.PI, TAU, 'rgba(180, 160, 233, 0.29)');
      if (trails) this.drawTrail(track, phase, gravity, false);
      if (Math.sin(phase) < 0) this.drawSatellite(position);
      if (Math.sin(moonPhase) < 0) this.drawMoon(moonPosition);

      this.drawPlanet(planetRadius);

      this.drawTrack(reference, 0, Math.PI, 'rgba(149, 155, 214, 0.23)', true);
      this.drawTrack(secondary, 0, Math.PI, 'rgba(149, 155, 214, 0.24)');
      this.drawTrack(track, 0, Math.PI, 'rgba(179, 155, 233, 0.45)');
      if (trails) this.drawTrail(track, phase, gravity, true);
      if (Math.sin(phase) >= 0) this.drawSatellite(position);
      if (Math.sin(moonPhase) >= 0) this.drawMoon(moonPosition);
      context.restore();

      return {
        x: centerX + position.x,
        y: centerY + position.y,
        hidden: Math.sin(phase) < 0 && Math.hypot(position.x, position.y) <= planetRadius,
      };
    }

    point(track, phase) {
      const localX = Math.cos(phase) * track.x;
      const localY = Math.sin(phase) * track.y;
      const cosine = Math.cos(track.angle);
      const sine = Math.sin(track.angle);
      return { x: localX * cosine - localY * sine, y: localX * sine + localY * cosine };
    }

    drawPlanet(radius) {
      const context = this.context;
      const atmosphere = context.createRadialGradient(0, 0, radius * 0.92, 0, 0, radius * 1.13);
      atmosphere.addColorStop(0, 'rgba(236, 140, 99, 0)');
      atmosphere.addColorStop(0.38, 'rgba(246, 164, 119, 0.24)');
      atmosphere.addColorStop(0.56, 'rgba(218, 121, 96, 0.09)');
      atmosphere.addColorStop(1, 'rgba(218, 121, 96, 0)');
      context.fillStyle = atmosphere;
      context.fillRect(-radius * 1.2, -radius * 1.2, radius * 2.4, radius * 2.4);
      context.save();
      context.rotate(-0.23);
      context.drawImage(this.planet, -radius, -radius, radius * 2, radius * 2);
      context.restore();
    }

    drawTrack(track, start, end, color, dashed = false) {
      const context = this.context;
      context.beginPath();
      context.ellipse(0, 0, track.x, track.y, track.angle, start, end);
      context.strokeStyle = color;
      context.lineWidth = 0.8;
      if (dashed) context.setLineDash([2, 5]);
      context.stroke();
      if (dashed) context.setLineDash([]);
    }

    drawTrail(track, phase, gravity, front) {
      const context = this.context;
      const length = 0.69 + gravity * 0.21;
      const segments = 35;
      context.lineWidth = 1.65;

      for (let i = 0; i < segments; i++) {
        const start = phase - length * i / segments;
        const end = phase - length * (i + 1.32) / segments;
        if ((Math.sin((start + end) / 2) >= 0) !== front) continue;
        const opacity = Math.pow(1 - (i + 0.5) / segments, 1.47);
        context.beginPath();
        context.ellipse(0, 0, track.x, track.y, track.angle, end, start);
        context.strokeStyle = `rgba(192, 156, 255, ${opacity * 0.91})`;
        context.stroke();
      }
    }

    drawSatellite({ x, y }) {
      const context = this.context;
      const glow = context.createRadialGradient(x, y, 0, x, y, 23);
      glow.addColorStop(0, 'rgba(211, 184, 255, 0.97)');
      glow.addColorStop(0.20, 'rgba(177, 126, 249, 0.53)');
      glow.addColorStop(0.49, 'rgba(147, 101, 246, 0.18)');
      glow.addColorStop(1, 'rgba(147, 101, 246, 0)');
      context.fillStyle = glow;
      context.fillRect(x - 23, y - 23, 46, 46);

      context.beginPath();
      context.arc(x, y, 7.7, 0, TAU);
      context.lineWidth = 0.9;
      context.strokeStyle = 'rgba(200, 165, 255, 0.62)';
      context.stroke();

      const body = context.createRadialGradient(x - 1, y - 1.5, 0.1, x, y, 4.5);
      body.addColorStop(0, '#fff7ff');
      body.addColorStop(0.47, '#ebd5ff');
      body.addColorStop(1, '#a780f3');
      context.fillStyle = body;
      context.beginPath();
      context.arc(x, y, 4.25, 0, TAU);
      context.fill();
    }

    drawMoon({ x, y }) {
      const context = this.context;
      const light = context.createRadialGradient(x - 1.6, y - 1.1, 0.5, x + 1, y + 1, 6.3);
      light.addColorStop(0, '#d7d0d7');
      light.addColorStop(0.45, '#94889d');
      light.addColorStop(0.76, '#3c364b');
      light.addColorStop(1, '#171522');
      context.fillStyle = light;
      context.beginPath();
      context.arc(x, y, 5, 0, TAU);
      context.fill();
    }
  }

  window.OrbitRenderer = OrbitRenderer;
})();
