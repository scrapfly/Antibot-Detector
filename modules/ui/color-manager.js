/**
 * ColorManager Module
 * Handles all color-related functionality including:
 * - Color picker UI management
 * - Advanced canvas-based color picker
 * - Color conversion utilities (RGB, HSL, Hex)
 * - Preset color management
 */
class ColorManager {
  constructor() {
    this.presetColors = [
      '#3b82f6', // Blue
      '#10b981', // Green
      '#f59e0b', // Yellow
      '#ef4444', // Red
      '#8b5cf6', // Purple
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#06b6d4', // Cyan
      '#64748b'  // Gray
    ];

    this.currentColor = '#3b82f6';
    this.colorPickerInitialized = false;
    this.currentHue = 0;
    this.selectedColor = { r: 255, g: 0, b: 0 };

    // Callbacks for color selection
    this.onColorSelect = null;
    this.onColorChange = null;
  }

  /**
   * Initialize color picker functionality
   * @param {Object} options - Configuration options
   * @param {Function} options.onColorSelect - Callback when color is selected
   * @param {Function} options.onColorChange - Callback when color changes
   */
  initialize(options = {}) {
    this.onColorSelect = options.onColorSelect || null;
    this.onColorChange = options.onColorChange || null;

    this.setupColorPicker();
  }

  /**
   * Setup color picker UI and event listeners
   */
  setupColorPicker() {
    const colorGrid = document.querySelector('.color-picker-grid');

    if (colorGrid) {
      colorGrid.addEventListener('click', (e) => {
        e.stopPropagation();
        const colorOption = e.target.closest('.color-option');
        if (!colorOption) return;

        if (colorOption.id === 'rainbowPicker') {
          if (colorOption.dataset.customColor) {
            this.currentColor = colorOption.dataset.customColor;
            // Parse the color for the picker
            const rgb = this.hexToRgb(this.currentColor);
            if (rgb) {
              this.selectedColor = rgb;
            }
          }
          this.openAdvancedColorPicker();
          return;
        }

        const color = colorOption.dataset.color;
        if (color) {
          this.selectPresetColor(color, colorOption);
        }
      });
    }
  }

  /**
   * Select a preset color
   * @param {string} color - The hex color value
   * @param {HTMLElement} colorOption - The color option element
   */
  selectPresetColor(color, colorOption) {
    // Update selected state
    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.remove('selected');
    });
    if (colorOption) {
      colorOption.classList.add('selected');
    }

    this.currentColor = color;

    // Update badge color preview
    const colorPreview = document.querySelector('#badgeColorPreview');
    if (colorPreview) {
      colorPreview.style.background = color;
    }

    // Trigger callback
    if (this.onColorSelect) {
      this.onColorSelect(color);
    }
  }

  /**
   * Set color programmatically
   * @param {string} color - The hex color value
   */
  setColor(color) {
    this.currentColor = color;

    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.remove('selected');
    });

    const matchingOption = document.querySelector(`[data-color="${color}"]`);
    if (matchingOption) {
      matchingOption.classList.add('selected');
    } else {
      // No preset match -- mark rainbow picker as selected with custom color
      const rainbowPicker = document.querySelector('#rainbowPicker');
      if (rainbowPicker) {
        rainbowPicker.classList.add('selected');
        rainbowPicker.dataset.customColor = color;
      }
    }

    // Update badge color preview
    const colorPreview = document.querySelector('#badgeColorPreview');
    if (colorPreview) {
      colorPreview.style.background = color;
    }

    // Update custom color picker value
    const customColorPicker = document.querySelector('#customColorPicker');
    if (customColorPicker) {
      customColorPicker.value = color;
    }
  }

  /**
   * Get current selected color
   * @returns {string} Current hex color value
   */
  getColor() {
    return this.currentColor;
  }

  /**
   * Open advanced color picker modal
   */
  openAdvancedColorPicker() {
    const advancedModal = document.querySelector('#advancedColorModal');
    if (!advancedModal) return;

    // Initialize color picker if not done already
    if (!this.colorPickerInitialized) {
      this.initializeAdvancedColorPicker();
      this.colorPickerInitialized = true;
    } else {
      // Update the picker with the current color
      this.updatePickerToCurrentColor();
    }

    advancedModal.style.display = 'flex';
  }

  /**
   * Update picker to show current color
   */
  updatePickerToCurrentColor() {
    const colorCanvas = document.querySelector('#colorCanvas');
    const hueCanvas = document.querySelector('#hueCanvas');
    const colorCursor = document.querySelector('#colorPickerCursor');
    const hueCursor = document.querySelector('#hueSliderCursor');
    const colorPreview = document.querySelector('#selectedColorPreview');
    const rInput = document.querySelector('#rInput');
    const gInput = document.querySelector('#gInput');
    const bInput = document.querySelector('#bInput');

    if (!this.selectedColor) {
      this.selectedColor = this.hexToRgb(this.currentColor) || { r: 255, g: 0, b: 0 };
    }

    this.updateColorDisplay(this.selectedColor, colorPreview, rInput, gInput, bInput);

    const hsv = this.rgbToHsv(this.selectedColor.r, this.selectedColor.g, this.selectedColor.b);
    this.currentHue = hsv.h;

    if (colorCanvas) {
      const ctx = colorCanvas.getContext('2d');
      if (ctx) {
        this.drawColorCanvas(ctx, this.currentHue);
      }
    }

    if (hueCanvas) {
      const hueCtx = hueCanvas.getContext('2d');
      if (hueCtx) {
        this.drawHueStrip(hueCtx);
      }
    }

    if (hueCursor) {
      const hueY = (this.currentHue / 360) * 160;
      hueCursor.style.top = `${hueY}px`;
      hueCursor.style.display = 'block';
    }

    if (colorCursor) {
      const colorX = hsv.s * 240;
      const colorY = (1 - hsv.v) * 160;
      colorCursor.style.left = `${colorX}px`;
      colorCursor.style.top = `${colorY}px`;
      colorCursor.style.display = 'block';
    }
  }

  /**
   * Close advanced color picker modal
   */
  closeAdvancedColorPicker() {
    const advancedModal = document.querySelector('#advancedColorModal');
    if (advancedModal) {
      advancedModal.style.display = 'none';
    }
  }

  /**
   * Initialize canvas-based advanced color picker
   */
  initializeAdvancedColorPicker() {
    const colorCanvas = document.querySelector('#colorCanvas');
    const hueCanvas = document.querySelector('#hueCanvas');
    const colorCursor = document.querySelector('#colorPickerCursor');
    const hueCursor = document.querySelector('#hueSliderCursor');
    const colorPreview = document.querySelector('#selectedColorPreview');
    const rInput = document.querySelector('#rInput');
    const gInput = document.querySelector('#gInput');
    const bInput = document.querySelector('#bInput');
    const cancelBtn = document.querySelector('#cancelAdvancedColor');
    const selectBtn = document.querySelector('#selectAdvancedColor');

    if (!colorCanvas || !hueCanvas) {
      Logger.error('UI', 'Color picker canvas elements not found');
      return;
    }

    const colorCtx = colorCanvas.getContext('2d');
    const hueCtx = hueCanvas.getContext('2d');

    if (!colorCtx || !hueCtx) {
      Logger.error('UI', 'Cannot get canvas contexts');
      return;
    }

    // Initialize selectedColor from current color if not set
    if (!this.selectedColor || !this.selectedColor.r) {
      this.selectedColor = this.hexToRgb(this.currentColor) || { r: 255, g: 0, b: 0 };
    }

    // Draw hue strip
    this.drawHueStrip(hueCtx);

    // Calculate HSV from current color to set initial hue and position
    const initialHsv = this.rgbToHsv(this.selectedColor.r, this.selectedColor.g, this.selectedColor.b);
    this.currentHue = initialHsv.h;

    // Draw initial color canvas
    this.drawColorCanvas(colorCtx, this.currentHue);

    // Update initial color display
    this.updateColorDisplay(this.selectedColor, colorPreview, rInput, gInput, bInput);

    // Position cursors based on current color using HSV
    if (colorCursor) {
      const colorX = initialHsv.s * 240;
      const colorY = (1 - initialHsv.v) * 160;
      colorCursor.style.left = `${colorX}px`;
      colorCursor.style.top = `${colorY}px`;
      colorCursor.style.display = 'block';
    }
    if (hueCursor) {
      const hueY = (this.currentHue / 360) * 160;
      hueCursor.style.top = `${hueY}px`;
      hueCursor.style.display = 'block';
    }

    if (hueCanvas && hueCursor) {
      let isHueDragging = false;

      const updateHueFromPosition = (e) => {
        const rect = hueCanvas.getBoundingClientRect();
        const y = Math.max(0, Math.min(160, e.clientY - rect.top));        this.currentHue = (y / 160) * 360;
        // Update hue cursor
        hueCursor.style.top = `${y}px`;

        // Redraw color canvas with new hue
        this.drawColorCanvas(colorCtx, this.currentHue);

        // Update color at current position
        const colorRect = colorCanvas.getBoundingClientRect();
        const colorX = parseInt(colorCursor.style.left) || 120;
        const colorY = parseInt(colorCursor.style.top) || 80;
        const saturation = colorX / 240;
        const value = 1 - (colorY / 160);
        this.selectedColor = this.hsvToRgb(this.currentHue, saturation, value);
        this.updateColorDisplay(this.selectedColor, colorPreview, rInput, gInput, bInput);
      };

      // Mouse down - start dragging
      hueCanvas.addEventListener('mousedown', (e) => {
        isHueDragging = true;
        updateHueFromPosition(e);
      });

      hueCanvas.addEventListener('mousemove', (e) => {
        if (isHueDragging) {
          updateHueFromPosition(e);
        }
      });

      document.addEventListener('mouseup', () => {
        isHueDragging = false;
      });

      hueCanvas.addEventListener('click', (e) => {
        updateHueFromPosition(e);
      });
    }

    if (colorCanvas && colorCursor) {
      let isDragging = false;

      const updateColorFromPosition = (e) => {
        const rect = colorCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(240, e.clientX - rect.left));        const y = Math.max(0, Math.min(160, e.clientY - rect.top));
        const saturation = x / 240;
        const value = 1 - (y / 160);
        this.selectedColor = this.hsvToRgb(this.currentHue, saturation, value);

        colorCursor.style.left = `${x}px`;
        colorCursor.style.top = `${y}px`;

        this.updateColorDisplay(this.selectedColor, colorPreview, rInput, gInput, bInput);
      };

      colorCanvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateColorFromPosition(e);
      });

      colorCanvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
          updateColorFromPosition(e);
        }
      });

      document.addEventListener('mouseup', () => {
        isDragging = false;
      });

      colorCanvas.addEventListener('click', (e) => {
        updateColorFromPosition(e);
      });
    }

    const updateFromRGB = () => {
      this.selectedColor = {
        r: parseInt(rInput?.value) || 0,
        g: parseInt(gInput?.value) || 0,
        b: parseInt(bInput?.value) || 0
      };
      this.updateColorDisplay(this.selectedColor, colorPreview, rInput, gInput, bInput);

      const hsv = this.rgbToHsv(this.selectedColor.r, this.selectedColor.g, this.selectedColor.b);
      this.currentHue = hsv.h;

      if (hueCursor) {
        const hueY = (hsv.h / 360) * 160;
        hueCursor.style.top = `${hueY}px`;
      }

      if (colorCursor) {
        const colorX = hsv.s * 240;
        const colorY = (1 - hsv.v) * 160;
        colorCursor.style.left = `${colorX}px`;
        colorCursor.style.top = `${colorY}px`;
      }

      this.drawColorCanvas(colorCtx, this.currentHue);

      if (this.onColorChange) {
        this.onColorChange(this.rgbToHex(this.selectedColor));
      }
    };

    rInput?.addEventListener('input', updateFromRGB);
    gInput?.addEventListener('input', updateFromRGB);
    bInput?.addEventListener('input', updateFromRGB);

    // Modal control buttons
    cancelBtn?.addEventListener('click', () => this.closeAdvancedColorPicker());
    selectBtn?.addEventListener('click', () => {
      const hex = this.rgbToHex(this.selectedColor);
      this.applySelectedColor(hex);
      this.closeAdvancedColorPicker();
    });
  }

  /**
   * Draw the hue gradient strip
   * @param {CanvasRenderingContext2D} ctx - The canvas context
   */
  drawHueStrip(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 160);    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.17, '#ff00ff');
    gradient.addColorStop(0.33, '#0000ff');
    gradient.addColorStop(0.5, '#00ffff');
    gradient.addColorStop(0.67, '#00ff00');
    gradient.addColorStop(0.83, '#ffff00');
    gradient.addColorStop(1, '#ff0000');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 20, 160);  }

  /**
   * Draw the saturation/lightness canvas
   * @param {CanvasRenderingContext2D} ctx - The canvas context
   * @param {number} hue - The current hue value
   */
  drawColorCanvas(ctx, hue) {
    // Clear canvas
    ctx.clearRect(0, 0, 240, 160);
    // Create gradients
    // White to color (saturation)
    const satGradient = ctx.createLinearGradient(0, 0, 240, 0);    satGradient.addColorStop(0, '#ffffff');
    const baseColor = this.hsvToRgb(hue, 1, 1);
    satGradient.addColorStop(1, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);

    ctx.fillStyle = satGradient;
    ctx.fillRect(0, 0, 240, 160);
    // Transparent to black (lightness)
    const lightGradient = ctx.createLinearGradient(0, 0, 0, 160);    lightGradient.addColorStop(0, 'rgba(0,0,0,0)');
    lightGradient.addColorStop(1, 'rgba(0,0,0,1)');

    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, 240, 160);  }

  /**
   * Update color display in UI
   * @param {Object} color - RGB color object
   * @param {HTMLElement} preview - Preview element
   * @param {HTMLInputElement} rInput - Red input
   * @param {HTMLInputElement} gInput - Green input
   * @param {HTMLInputElement} bInput - Blue input
   */
  updateColorDisplay(color, preview, rInput, gInput, bInput) {
    const r = Math.max(0, Math.min(255, Math.round(color.r)));
    const g = Math.max(0, Math.min(255, Math.round(color.g)));
    const b = Math.max(0, Math.min(255, Math.round(color.b)));

    const hex = this.rgbToHex({ r, g, b });

    if (preview) preview.style.background = hex;
    if (rInput) rInput.value = r;
    if (gInput) gInput.value = g;
    if (bInput) bInput.value = b;
  }

  /**
   * Apply selected color from advanced picker
   * @param {string} hex - The hex color value
   */
  applySelectedColor(hex) {
    const colorPreview = document.querySelector('#badgeColorPreview');

    if (colorPreview) {
      colorPreview.style.background = hex;
    }

    this.currentColor = hex;

    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.remove('selected');
    });

    const matchingPreset = document.querySelector(`[data-color="${hex}"]`);
    if (matchingPreset) {
      matchingPreset.classList.add('selected');
    } else {
      const rainbowPicker = document.querySelector('#rainbowPicker');
      if (rainbowPicker) {
        rainbowPicker.classList.add('selected');
        rainbowPicker.dataset.customColor = hex;
      }
    }

    // Trigger callback
    if (this.onColorSelect) {
      this.onColorSelect(hex);
    }
  }

  /**
   * Convert RGB to HSV
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {Object} HSV values
   */
  rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const v = max;

    if (diff === 0) {
      return { h: 0, s: 0, v };
    }

    const s = diff / max;

    let h;
    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }

    return { h: h * 360, s, v };
  }

  /**
   * Convert HSV to RGB
   * @param {number} h - Hue (0-360)
   * @param {number} s - Saturation (0-1)
   * @param {number} v - Value (0-1)
   * @returns {Object} RGB values
   */
  hsvToRgb(h, s, v) {
    h = h / 360;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Convert RGB to Hex
   * @param {Object} rgb - RGB color object
   * @returns {string} Hex color value
   */
  rgbToHex(rgb) {
    const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Convert Hex to RGB
   * @param {string} hex - Hex color value
   * @returns {Object} RGB color object
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Get preset colors array
   * @returns {Array} Array of preset hex colors
   */
  getPresetColors() {
    return this.presetColors;
  }
}

if (typeof window !== 'undefined') {
  window.ColorManager = ColorManager;
}